import OpenAI from "openai";
import type { Match, Team, TeamForm, InsertPrediction, Injury, MarketOdds } from "@/src/lib/db/schema";
import { db } from "@/src/lib/db";
import {
  matches, predictions, teams, competitions, matchStats, teamForm, standings, injuries, marketOdds,
} from "@/src/lib/db/schema";
import { eq, and, or, desc, asc, gte, sql } from "drizzle-orm";

let openai: OpenAI | null = null;

// Only initialize OpenAI if API key is available
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  } else {
    console.warn("OPENAI_API_KEY not set. AI prediction service will use fallback predictions.");
  }
} catch (error) {
  console.error("Failed to initialize OpenAI client:", error);
  openai = null;
}

interface TeamStanding {
  position: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  played: number;
}

interface PredictionInput {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
  homeForm?: TeamForm;
  awayForm?: TeamForm;
  homeStanding?: TeamStanding;
  awayStanding?: TeamStanding;
  h2hMatches?: Match[];
  homeAvgCards?: number; // Average cards per match for home team
  awayAvgCards?: number; // Average cards per match for away team
  homeAvgCorners?: number; // Average corners per match for home team
  awayAvgCorners?: number; // Average corners per match for away team
  homeInjuries?: Injury[]; // Active injuries/suspensions for home team
  awayInjuries?: Injury[]; // Active injuries/suspensions for away team
  marketOdds?: MarketOdds | null; // Blockchain prediction market odds (Polymarket)
}

interface PredictionResult {
  predictedWinner: "HOME_TEAM" | "DRAW" | "AWAY_TEAM";
  homeWinProbability: string;
  drawProbability: string;
  awayWinProbability: string;
  predictedHomeScore: string;
  predictedAwayScore: string;
  confidence: string;
  keyFactors: string[];
  // Additional betting markets
  over15Probability?: string;
  over25Probability?: string;
  over35Probability?: string;
  bttsYesProbability?: string;
  bttsNoProbability?: string;
  recommendedBets?: Array<{type: string; value: string; reason: string}>;
  // Half-time predictions
  homeScoreHT?: string;
  awayScoreHT?: string;
  predictedWinnerHT?: "HOME_TEAM" | "DRAW" | "AWAY_TEAM";
  homeWinProbabilityHT?: string;
  drawProbabilityHT?: string;
  awayWinProbabilityHT?: string;
  over05ProbabilityHT?: string;
  over15ProbabilityHT?: string;
  // Cards & Corners predictions
  predictedTotalCards?: string;
  totalCardsOver25Probability?: string;
  totalCardsOver45Probability?: string;
  predictedTotalCorners?: string;
  totalCornersOver85Probability?: string;
  totalCornersOver105Probability?: string;
}

// Helper: Apply adaptive temperature scaling to probability distribution
// Weight >1.0 sharpens (more confident), <1.0 flattens (less confident)
// Uses log-space scaling for numerical stability
function applyAdaptiveTemperature(probabilities: number[], weight: number): number[] {
  if (weight === 1.0 || probabilities.length === 0) return probabilities;

  const eps = 1e-6; // Prevent log(0)
  const temp = 1 / weight; // Convert weight to temperature

  // Convert percentages to probabilities and clamp
  const probs = probabilities.map(p => Math.max(eps, Math.min(1 - eps, p / 100)));

  // Calculate logits
  const logits = probs.map(p => Math.log(p));

  // Scale by temperature
  const scaledLogits = logits.map(l => l / temp);

  // Apply softmax: exp(logit) / sum(exp(logits))
  const maxLogit = Math.max(...scaledLogits);
  const expLogits = scaledLogits.map(l => Math.exp(l - maxLogit)); // Subtract max for numerical stability
  const sumExp = expLogits.reduce((a, b) => a + b, 0);
  const calibrated = expLogits.map(e => (e / sumExp) * 100);

  return calibrated;
}

// Helper: Apply bounded confidence adjustment around neutrality (50%)
// Weight >1.0 increases distance from 50, <1.0 decreases distance from 50
// Keeps result in [0, 100] range
function applyBoundedConfidenceAdjustment(confidence: number, weight: number): number {
  if (weight === 1.0) return confidence;

  const delta = (confidence - 50) * (weight - 1.0);
  const adjusted = confidence + delta;

  return Math.max(0, Math.min(100, adjusted));
}

class AIPredictionService {
  async generatePrediction(input: PredictionInput, isPremium: boolean = false): Promise<InsertPrediction> {
    const { match, homeTeam, awayTeam, homeForm, awayForm, homeStanding, awayStanding } = input;

    // If OpenAI is not available, use fallback prediction
    if (!openai) {
      console.warn(`Using fallback prediction for match ${match.id} - OpenAI not available`);
      return this.generateBasicPrediction(match, homeForm, awayForm, isPremium);
    }

    // Get adaptive weights from learning system
    const { learningSystem } = await import("./learning-system");
    const adaptiveWeights = await learningSystem.getAdaptiveWeights(
      match.competitionId,
      homeTeam.id,
      awayTeam.id
    );

    // Fetch blockchain prediction market odds if not provided
    let blockchainOdds = input.marketOdds;
    if (blockchainOdds === undefined) {
      const [odds] = await db
        .select()
        .from(marketOdds)
        .where(eq(marketOdds.matchId, match.id))
        .limit(1);
      blockchainOdds = odds || null;
    }

    const prompt = this.buildPrompt(
      homeTeam,
      awayTeam,
      homeForm,
      awayForm,
      homeStanding,
      awayStanding,
      match,
      adaptiveWeights,
      input.homeAvgCards,
      input.awayAvgCards,
      input.homeAvgCorners,
      input.awayAvgCorners,
      homeTeam.fifaRanking,
      awayTeam.fifaRanking,
      input.homeInjuries,
      input.awayInjuries,
      blockchainOdds
    );

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Sei un esperto analista di calcio specializzato in pronostici sportivi REALISTICI e STATISTICAMENTE ACCURATI.

VERITA STATISTICA DEL CALCIO:
- Nel calcio professionistico, circa il 27-30% delle partite finisce in PAREGGIO
- Solo il 35-40% delle partite vede vincere la squadra di casa
- Il 25-30% vede vincere la squadra in trasferta
- La tua predizione DEVE riflettere queste proporzioni statistiche reali

PRINCIPIO FONDAMENTALE - PESA I FATTORI REALI:
- Se una squadra ha 45% di vincere, significa che ha 55% di NON vincere
- NON basta guardare le percentuali - devi PESARE i fattori concreti:

  CLASSIFICA (peso massimo):
  - Differenza >5 posizioni = vantaggio chiaro per la squadra piu alta
  - Differenza >10 posizioni = quasi impossibile il pareggio (<20%)
  - Top 3 vs Bottom 3 = vittoria squadra alta molto probabile (>50%)

  GOL FATTI/SUBITI (peso massimo):
  - Squadra con >2 gol/partita di media vs <1 gol/partita = vittoria probabile
  - Difesa solida (<0.8 gol subiti) + attacco forte (>1.5 gol) = favorito netto
  - Entrambe con media gol <1.2 = pareggio piu probabile

  FATTORE CAMPO (peso importante):
  - Casa con >60% vittorie casalinghe = +15% probabilita vittoria
  - Trasferta con >50% vittorie in trasferta = +10% probabilita vittoria
  - Casa debole in casa (<30% vittorie) = ridurre vantaggio casalingo

  FORMA RECENTE (peso medio):
  - 3+ vittorie consecutive = squadra in fiducia (+10% probabilita)
  - 3+ sconfitte consecutive = squadra in crisi (-10% probabilita)

QUANDO SCEGLIERE IL PAREGGIO:
SI solo se DAVVERO equilibrato:
- Posizioni in classifica <=3 E punti <=4 E media gol simile (<0.5 diff)
- Entrambe con molti pareggi recenti (>=2 su 5) E differenza classifica <=5
- Match difensivi: entrambe <1.2 gol fatti E <0.9 gol subiti
NO NON scegliere pareggio se:
- Una squadra ha chiaro vantaggio in classifica (>5 posizioni)
- Una squadra segna molto di piu (differenza >0.8 gol/partita)
- Una delle due e in forma eccellente mentre l'altra e in crisi

Rispondi SOLO con un oggetto JSON valido nel seguente formato:
{
  "predictedWinner": "HOME_TEAM" | "DRAW" | "AWAY_TEAM",
  "homeWinProbability": "numero decimale tra 0 e 100",
  "drawProbability": "numero decimale tra 0 e 100",
  "awayWinProbability": "numero decimale tra 0 e 100",
  "predictedHomeScore": "numero decimale (es. 1.5)",
  "predictedAwayScore": "numero decimale (es. 0.8)",
  "confidence": "numero decimale tra 0 e 100",
  "keyFactors": ["fattore 1", "fattore 2", "fattore 3"],
  "over15Probability": "numero tra 0 e 100 (probabilita >1.5 gol totali)",
  "over25Probability": "numero tra 0 e 100 (probabilita >2.5 gol totali)",
  "over35Probability": "numero tra 0 e 100 (probabilita >3.5 gol totali)",
  "bttsYesProbability": "numero tra 0 e 100 (entrambe segnano)",
  "bttsNoProbability": "numero tra 0 e 100 (almeno una non segna)",
  "homeScoreHT": "numero decimale gol casa a fine primo tempo (es. 0.5)",
  "awayScoreHT": "numero decimale gol trasferta a fine primo tempo (es. 0.3)",
  "predictedWinnerHT": "HOME_TEAM" | "DRAW" | "AWAY_TEAM",
  "homeWinProbabilityHT": "numero tra 0 e 100 (probabilita vittoria casa al 45')",
  "drawProbabilityHT": "numero tra 0 e 100 (probabilita pareggio al 45')",
  "awayWinProbabilityHT": "numero tra 0 e 100 (probabilita vittoria trasferta al 45')",
  "over05ProbabilityHT": "numero tra 0 e 100 (probabilita >0.5 gol al primo tempo)",
  "over15ProbabilityHT": "numero tra 0 e 100 (probabilita >1.5 gol al primo tempo)",
  "predictedTotalCards": "numero decimale cartellini totali previsti (gialli + rossi)",
  "totalCardsOver25Probability": "numero tra 0 e 100 (probabilita >2.5 cartellini)",
  "totalCardsOver45Probability": "numero tra 0 e 100 (probabilita >4.5 cartellini)",
  "predictedTotalCorners": "numero decimale calci d'angolo totali previsti",
  "totalCornersOver85Probability": "numero tra 0 e 100 (probabilita >8.5 corner)",
  "totalCornersOver105Probability": "numero tra 0 e 100 (probabilita >10.5 corner)",
  "recommendedBets": [
    {
      "type": "over15|over25|over35|under15|under25|under35|btts_yes|btts_no|1X2|HT_over05|HT_over15|HT_under05|HT_under15",
      "value": "descrizione",
      "reason": "motivazione specifica"
    }
  ]
}

REGOLE CRITICHE:
1. Probabilita 1X2 devono sommare a 100
2. Probabilita 1X2 HT devono sommare a 100
3. bttsYesProbability + bttsNoProbability = 100
4. recommendedBets: includi SOLO scommesse con probabilita >60%
5. Fattori chiave in italiano, specifici e basati sui dati
6. CONSIDERA SEMPRE la classifica - squadre alte favorite vs squadre basse
7. I gol al primo tempo sono GENERALMENTE minori del totale finale`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      const responseContent = completion.choices[0].message.content;
      if (!responseContent) {
        throw new Error("No response from OpenAI");
      }

      const result: PredictionResult = JSON.parse(responseContent);

      // Get market-specific adaptive weights for post-LLM calibration
      const marketWeights = await learningSystem.getMarketWeights(
        match.competitionId,
        homeTeam.id,
        awayTeam.id
      );

      // Normalize probabilities to ensure they sum to 100
      const total = parseFloat(result.homeWinProbability) +
                   parseFloat(result.drawProbability) +
                   parseFloat(result.awayWinProbability);

      let homeWinProb = parseFloat(result.homeWinProbability) / total * 100;
      let drawProb = parseFloat(result.drawProbability) / total * 100;
      let awayWinProb = parseFloat(result.awayWinProbability) / total * 100;

      // Apply adaptive temperature calibration to 1X2 probabilities
      const calibrated1X2 = applyAdaptiveTemperature(
        [homeWinProb, drawProb, awayWinProb],
        marketWeights.weight_1x2
      );
      [homeWinProb, drawProb, awayWinProb] = calibrated1X2;

      // Log when adaptive weights are applied (different from 1.0)
      const hasAdaptiveWeights = Object.values(marketWeights).some(w => Math.abs(w - 1.0) > 0.01);
      if (hasAdaptiveWeights) {
        console.log(`LEARNING APPLIED - Match ${match.id} (${homeTeam.name} vs ${awayTeam.name}):`);
        console.log(`   Weights: 1X2=${marketWeights.weight_1x2.toFixed(2)} BTTS=${marketWeights.weight_btts.toFixed(2)} O2.5=${marketWeights.weight_over25.toFixed(2)} O3.5=${marketWeights.weight_over35.toFixed(2)}`);
        console.log(`   1X2 Pre: H=${(parseFloat(result.homeWinProbability) / total * 100).toFixed(1)}% -> Post: H=${homeWinProb.toFixed(1)}%`);
      }

      // BLOCKCHAIN MARKET CALIBRATION
      // Blend AI predictions with prediction market odds using volume-weighted averaging
      // Higher market volume = more trust in market prices
      if (blockchainOdds && blockchainOdds.homeWinProb) {
        const marketVolume = parseFloat(blockchainOdds.totalVolume || "0");
        // Market weight: 0.15 at low volume, up to 0.35 at high volume
        const marketWeight = Math.min(0.35, 0.15 + (marketVolume / 200000) * 0.20);
        const aiWeight = 1 - marketWeight;

        const mktHome = parseFloat(blockchainOdds.homeWinProb) * 100;
        const mktDraw = blockchainOdds.drawProb ? parseFloat(blockchainOdds.drawProb) * 100 : drawProb;
        const mktAway = blockchainOdds.awayWinProb ? parseFloat(blockchainOdds.awayWinProb) * 100 : awayWinProb;

        const blendedHome = aiWeight * homeWinProb + marketWeight * mktHome;
        const blendedDraw = aiWeight * drawProb + marketWeight * mktDraw;
        const blendedAway = aiWeight * awayWinProb + marketWeight * mktAway;

        // Re-normalize to 100
        const blendedTotal = blendedHome + blendedDraw + blendedAway;
        homeWinProb = (blendedHome / blendedTotal) * 100;
        drawProb = (blendedDraw / blendedTotal) * 100;
        awayWinProb = (blendedAway / blendedTotal) * 100;

        console.log(`MARKET BLEND - Match ${match.id}: weight=${(marketWeight * 100).toFixed(0)}% (vol=$${marketVolume.toFixed(0)})`);
        console.log(`   Market: H=${mktHome.toFixed(1)}% D=${mktDraw.toFixed(1)}% A=${mktAway.toFixed(1)}%`);
        console.log(`   Blended: H=${homeWinProb.toFixed(1)}% D=${drawProb.toFixed(1)}% A=${awayWinProb.toFixed(1)}%`);
      }

      // Determine predicted winner and double chance
      let predictedWinner: "HOME_TEAM" | "DRAW" | "AWAY_TEAM";
      let doubleChance: string | null = null;

      // Find the highest probability
      const probabilities = {
        HOME_TEAM: homeWinProb,
        DRAW: drawProb,
        AWAY_TEAM: awayWinProb
      };

      const sortedResults = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
      const [topResult, topProb] = sortedResults[0];
      const [secondResult, secondProb] = sortedResults[1];
      const [thirdResult, thirdProb] = sortedResults[2];

      // STRATEGY: Favor DRAW when appropriate but more conservatively
      // If draw is >= 32% and within 10% of the highest, consider it a draw
      if (drawProb >= 32 && Math.abs(topProb - drawProb) <= 10) {
        predictedWinner = 'DRAW';

        // Also suggest double chance
        if (homeWinProb > awayWinProb) {
          doubleChance = '1X';
        } else {
          doubleChance = 'X2';
        }
      }
      // If top two probabilities are within 10%, suggest double chance
      else if (Math.abs(topProb - secondProb) <= 10) {
        predictedWinner = topResult as "HOME_TEAM" | "DRAW" | "AWAY_TEAM";

        // Determine double chance
        const results = [topResult, secondResult].sort().join('');
        if (results === 'DRAWHOME_TEAM') {
          doubleChance = '1X';
        } else if (results === 'AWAY_TEAMDRAW') {
          doubleChance = 'X2';
        } else if (results === 'AWAY_TEAMHOME_TEAM') {
          doubleChance = '12';
        }
      } else {
        predictedWinner = topResult as "HOME_TEAM" | "DRAW" | "AWAY_TEAM";
      }

      // Normalize and calibrate BTTS probabilities if provided
      let bttsYesProb = result.bttsYesProbability ? parseFloat(result.bttsYesProbability) : null;
      let bttsNoProb = result.bttsNoProbability ? parseFloat(result.bttsNoProbability) : null;

      if (bttsYesProb !== null && bttsNoProb !== null) {
        const bttsTotal = bttsYesProb + bttsNoProb;
        let bttsYesNorm = (bttsYesProb / bttsTotal * 100);
        let bttsNoNorm = (bttsNoProb / bttsTotal * 100);

        // Apply adaptive temperature calibration to BTTS
        const calibratedBTTS = applyAdaptiveTemperature(
          [bttsYesNorm, bttsNoNorm],
          marketWeights.weight_btts
        );
        bttsYesProb = calibratedBTTS[0];
        bttsNoProb = calibratedBTTS[1];
      }

      // Blend BTTS with market odds
      if (blockchainOdds?.bttsYesProb && bttsYesProb !== null && bttsNoProb !== null) {
        const marketVolume = parseFloat(blockchainOdds.totalVolume || "0");
        const mktWeight = Math.min(0.30, 0.10 + (marketVolume / 200000) * 0.20);
        const mktBtts = parseFloat(blockchainOdds.bttsYesProb) * 100;
        bttsYesProb = (1 - mktWeight) * bttsYesProb + mktWeight * mktBtts;
        bttsNoProb = 100 - bttsYesProb;
      }

      const bttsYesProbStr = bttsYesProb !== null ? bttsYesProb.toFixed(2) : null;
      const bttsNoProbStr = bttsNoProb !== null ? bttsNoProb.toFixed(2) : null;

      // Normalize and calibrate HT 1X2 probabilities if provided
      let homeWinProbHTNum: number | null = null;
      let drawProbHTNum: number | null = null;
      let awayWinProbHTNum: number | null = null;

      if (result.homeWinProbabilityHT && result.drawProbabilityHT && result.awayWinProbabilityHT) {
        const totalHT = parseFloat(result.homeWinProbabilityHT) +
                       parseFloat(result.drawProbabilityHT) +
                       parseFloat(result.awayWinProbabilityHT);

        let homeHTNorm = (parseFloat(result.homeWinProbabilityHT) / totalHT * 100);
        let drawHTNorm = (parseFloat(result.drawProbabilityHT) / totalHT * 100);
        let awayHTNorm = (parseFloat(result.awayWinProbabilityHT) / totalHT * 100);

        // Apply adaptive temperature calibration to HT 1X2
        const calibratedHT = applyAdaptiveTemperature(
          [homeHTNorm, drawHTNorm, awayHTNorm],
          marketWeights.weight_1x2_ht
        );
        [homeWinProbHTNum, drawProbHTNum, awayWinProbHTNum] = calibratedHT;
      }

      const homeWinProbHT = homeWinProbHTNum !== null ? homeWinProbHTNum.toFixed(2) : null;
      const drawProbHT = drawProbHTNum !== null ? drawProbHTNum.toFixed(2) : null;
      const awayWinProbHT = awayWinProbHTNum !== null ? awayWinProbHTNum.toFixed(2) : null;

      // Calibrate Over/Under 2.5 and 3.5 (process both outcomes together)
      let over25ProbNum = result.over25Probability ? parseFloat(result.over25Probability) : null;
      let under25ProbNum = over25ProbNum !== null ? 100 - over25ProbNum : null;

      if (over25ProbNum !== null && under25ProbNum !== null) {
        const calibrated25 = applyAdaptiveTemperature([over25ProbNum, under25ProbNum], marketWeights.weight_over25);
        over25ProbNum = calibrated25[0];
        under25ProbNum = calibrated25[1];
      }

      let over35ProbNum = result.over35Probability ? parseFloat(result.over35Probability) : null;
      let under35ProbNum = over35ProbNum !== null ? 100 - over35ProbNum : null;

      if (over35ProbNum !== null && under35ProbNum !== null) {
        const calibrated35 = applyAdaptiveTemperature([over35ProbNum, under35ProbNum], marketWeights.weight_over35);
        over35ProbNum = calibrated35[0];
        under35ProbNum = calibrated35[1];
      }

      const over15Prob = result.over15Probability ? parseFloat(result.over15Probability) : null;
      const over25Prob = over25ProbNum;
      const over35Prob = over35ProbNum;

      const under15Prob = over15Prob !== null ? (100 - over15Prob).toFixed(2) : null;
      const under25Prob = under25ProbNum !== null ? under25ProbNum.toFixed(2) : null;
      const under35Prob = under35ProbNum !== null ? under35ProbNum.toFixed(2) : null;

      // Calibrate HT Over/Under probabilities (process both outcomes together)
      let over05HTProbNum = result.over05ProbabilityHT ? parseFloat(result.over05ProbabilityHT) : null;
      let under05HTProbNum = over05HTProbNum !== null ? 100 - over05HTProbNum : null;

      if (over05HTProbNum !== null && under05HTProbNum !== null) {
        const calibrated05HT = applyAdaptiveTemperature([over05HTProbNum, under05HTProbNum], marketWeights.weight_over05_ht);
        over05HTProbNum = calibrated05HT[0];
        under05HTProbNum = calibrated05HT[1];
      }

      let over15HTProbNum = result.over15ProbabilityHT ? parseFloat(result.over15ProbabilityHT) : null;
      let under15HTProbNum = over15HTProbNum !== null ? 100 - over15HTProbNum : null;

      if (over15HTProbNum !== null && under15HTProbNum !== null) {
        const calibrated15HT = applyAdaptiveTemperature([over15HTProbNum, under15HTProbNum], marketWeights.weight_over15_ht);
        over15HTProbNum = calibrated15HT[0];
        under15HTProbNum = calibrated15HT[1];
      }

      const over05HTPr = over05HTProbNum;
      const over15HTPr = over15HTProbNum;

      const under05HTProb = under05HTProbNum !== null ? under05HTProbNum.toFixed(2) : null;
      const under15HTProb = under15HTProbNum !== null ? under15HTProbNum.toFixed(2) : null;

      // Calibrate Cards & Corners predictions (process both outcomes together)
      const predictedTotalCards = result.predictedTotalCards ? parseFloat(result.predictedTotalCards) : null;
      let cardsOver25ProbNum = result.totalCardsOver25Probability ? parseFloat(result.totalCardsOver25Probability) : null;
      let cardsUnder25ProbNum = cardsOver25ProbNum !== null ? 100 - cardsOver25ProbNum : null;
      let cardsOver45ProbNum = result.totalCardsOver45Probability ? parseFloat(result.totalCardsOver45Probability) : null;

      if (cardsOver25ProbNum !== null && cardsUnder25ProbNum !== null) {
        const calibratedCards = applyAdaptiveTemperature([cardsOver25ProbNum, cardsUnder25ProbNum], marketWeights.weight_cards);
        cardsOver25ProbNum = calibratedCards[0];
        // cardsUnder25 = calibratedCards[1]; // Not used, just for normalization
      }

      const predictedTotalCorners = result.predictedTotalCorners ? parseFloat(result.predictedTotalCorners) : null;
      let cornersOver85ProbNum = result.totalCornersOver85Probability ? parseFloat(result.totalCornersOver85Probability) : null;
      let cornersUnder85ProbNum = cornersOver85ProbNum !== null ? 100 - cornersOver85ProbNum : null;
      let cornersOver105ProbNum = result.totalCornersOver105Probability ? parseFloat(result.totalCornersOver105Probability) : null;

      if (cornersOver85ProbNum !== null && cornersUnder85ProbNum !== null) {
        const calibratedCorners = applyAdaptiveTemperature([cornersOver85ProbNum, cornersUnder85ProbNum], marketWeights.weight_corners);
        cornersOver85ProbNum = calibratedCorners[0];
        // cornersUnder85 = calibratedCorners[1]; // Not used, just for normalization
      }

      const cardsOver25Prob = cardsOver25ProbNum;
      const cardsOver45Prob = cardsOver45ProbNum;
      const cornersOver85Prob = cornersOver85ProbNum;
      const cornersOver105Prob = cornersOver105ProbNum;

      // Determine if it's a "rough match" (high probability of many cards)
      const isRoughMatch = cardsOver45Prob !== null && cardsOver45Prob >= 60;

      // Apply bounded confidence adjustment using 1X2 weight (with robust null/NaN guard)
      const rawConfidence = result.confidence ? parseFloat(result.confidence) : 65; // Default 65 if missing
      const safeConfidence = Number.isFinite(rawConfidence) ? rawConfidence : 65; // Ensure always numeric
      const adjustedConfidence = applyBoundedConfidenceAdjustment(safeConfidence, marketWeights.weight_1x2);

      // Extended debug logging for all calibrated markets
      if (process.env.DEBUG_PREDICTIONS === "true" && bttsYesProb !== null) {
        console.log(`  BTTS: weight=${marketWeights.weight_btts.toFixed(2)}, calibrated Yes=${bttsYesProb.toFixed(1)}% No=${bttsNoProb!.toFixed(1)}%`);
      }
      if (process.env.DEBUG_PREDICTIONS === "true" && over25Prob !== null) {
        console.log(`  Over2.5: weight=${marketWeights.weight_over25.toFixed(2)}, calibrated Over=${over25Prob.toFixed(1)}% Under=${under25Prob}`);
      }
      if (process.env.DEBUG_PREDICTIONS === "true") {
        console.log(`  Confidence: raw=${safeConfidence.toFixed(1)}%, adjusted=${adjustedConfidence.toFixed(1)}%, weight=${marketWeights.weight_1x2.toFixed(2)}`);
      }

      return {
        matchId: match.id,
        predictedWinner: predictedWinner,
        doubleChance: doubleChance,
        homeWinProbability: homeWinProb.toFixed(2),
        drawProbability: drawProb.toFixed(2),
        awayWinProbability: awayWinProb.toFixed(2),
        predictedHomeScore: parseFloat(result.predictedHomeScore).toFixed(1),
        predictedAwayScore: parseFloat(result.predictedAwayScore).toFixed(1),
        confidence: adjustedConfidence.toFixed(2),
        keyFactors: result.keyFactors,
        // Over/Under probabilities
        over15Probability: over15Prob !== null ? over15Prob.toFixed(2) : null,
        over25Probability: over25Prob !== null ? over25Prob.toFixed(2) : null,
        over35Probability: over35Prob !== null ? over35Prob.toFixed(2) : null,
        under15Probability: under15Prob,
        under25Probability: under25Prob,
        under35Probability: under35Prob,
        bttsYesProbability: bttsYesProbStr,
        bttsNoProbability: bttsNoProbStr,
        // Half-time predictions
        predictedHomeScoreHT: result.homeScoreHT ? parseFloat(result.homeScoreHT).toFixed(1) : null,
        predictedAwayScoreHT: result.awayScoreHT ? parseFloat(result.awayScoreHT).toFixed(1) : null,
        predictedWinnerHT: result.predictedWinnerHT || null,
        homeWinProbabilityHT: homeWinProbHT,
        drawProbabilityHT: drawProbHT,
        awayWinProbabilityHT: awayWinProbHT,
        over05HTProb: over05HTPr !== null ? over05HTPr.toFixed(2) : null,
        over15HTProb: over15HTPr !== null ? over15HTPr.toFixed(2) : null,
        under05HTProb: under05HTProb,
        under15HTProb: under15HTProb,
        recommendedBets: result.recommendedBets || null,
        // Cards & Corners
        predictedTotalCards: predictedTotalCards !== null ? predictedTotalCards.toFixed(1) : null,
        totalCardsOver25Prob: cardsOver25Prob !== null ? cardsOver25Prob.toFixed(2) : null,
        totalCardsOver45Prob: cardsOver45Prob !== null ? cardsOver45Prob.toFixed(2) : null,
        predictedTotalCorners: predictedTotalCorners !== null ? predictedTotalCorners.toFixed(1) : null,
        totalCornersOver85Prob: cornersOver85Prob !== null ? cornersOver85Prob.toFixed(2) : null,
        totalCornersOver105Prob: cornersOver105Prob !== null ? cornersOver105Prob.toFixed(2) : null,
        isRoughMatch,
        isPremium,
        actualResult: null,
        isCorrect: null,
      };
    } catch (error) {
      console.error("Error generating AI prediction:", error);

      // Fallback to basic prediction
      return this.generateBasicPrediction(match, homeForm, awayForm, isPremium);
    }
  }

  private buildPrompt(
    homeTeam: Team,
    awayTeam: Team,
    homeForm?: TeamForm,
    awayForm?: TeamForm,
    homeStanding?: TeamStanding,
    awayStanding?: TeamStanding,
    match?: Match,
    adaptiveWeights?: Record<string, number>,
    homeAvgCards?: number,
    awayAvgCards?: number,
    homeAvgCorners?: number,
    awayAvgCorners?: number,
    homeFifaRanking?: number | null,
    awayFifaRanking?: number | null,
    homeInjuries?: Injury[],
    awayInjuries?: Injury[],
    blockchainOdds?: MarketOdds | null
  ): string {
    let prompt = `Analizza questa partita di calcio:\n\n`;
    prompt += `**CASA**: ${homeTeam.name}\n`;
    prompt += `**TRASFERTA**: ${awayTeam.name}\n\n`;

    // Add adaptive learning insights
    if (adaptiveWeights && Object.keys(adaptiveWeights).length > 0) {
      prompt += `**SISTEMA DI APPRENDIMENTO ADATTIVO**:\n`;
      prompt += `Il sistema ha analizzato i risultati storici e ha calibrato i pesi per migliorare l'accuratezza:\n`;

      if (adaptiveWeights.weight_1x2 !== undefined) {
        prompt += `- Peso pronostici 1X2: ${(adaptiveWeights.weight_1x2 * 100).toFixed(0)}%\n`;
      }
      if (adaptiveWeights.weight_over25 !== undefined) {
        prompt += `- Peso pronostici Over 2.5: ${(adaptiveWeights.weight_over25 * 100).toFixed(0)}%\n`;
      }
      if (adaptiveWeights.weight_over35 !== undefined) {
        prompt += `- Peso pronostici Over 3.5: ${(adaptiveWeights.weight_over35 * 100).toFixed(0)}%\n`;
      }
      if (adaptiveWeights.weight_btts !== undefined) {
        prompt += `- Peso pronostici BTTS: ${(adaptiveWeights.weight_btts * 100).toFixed(0)}%\n`;
      }
      prompt += `Usa questi pesi come guida: valori >100% indicano alta affidabilita storica, <100% suggeriscono cautela.\n\n`;
    }

    // Add FIFA Rankings for national teams (CRITICAL for international matches)
    if (homeFifaRanking || awayFifaRanking) {
      prompt += `**RANKING FIFA MONDIALE**:\n`;
      if (homeFifaRanking) {
        const rankingLevel = homeFifaRanking <= 10 ? "TOP 10 - Elite mondiale" :
                            homeFifaRanking <= 20 ? "TOP 20 - Squadra forte" :
                            homeFifaRanking <= 50 ? "TOP 50 - Competitiva" :
                            homeFifaRanking <= 100 ? "Media" : "Bassa";
        prompt += `- ${homeTeam.name}: #${homeFifaRanking} (${rankingLevel})\n`;
      }
      if (awayFifaRanking) {
        const rankingLevel = awayFifaRanking <= 10 ? "TOP 10 - Elite mondiale" :
                            awayFifaRanking <= 20 ? "TOP 20 - Squadra forte" :
                            awayFifaRanking <= 50 ? "TOP 50 - Competitiva" :
                            awayFifaRanking <= 100 ? "Media" : "Bassa";
        prompt += `- ${awayTeam.name}: #${awayFifaRanking} (${rankingLevel})\n`;
      }

      if (homeFifaRanking && awayFifaRanking) {
        const rankingDiff = Math.abs(homeFifaRanking - awayFifaRanking);
        const stronger = homeFifaRanking < awayFifaRanking ? homeTeam.name : awayTeam.name;

        prompt += `- Differenza ranking: ${rankingDiff} posizioni`;
        if (rankingDiff >= 30) {
          prompt += ` - ENORME DIVARIO: ${stronger} e NETTAMENTE favorita\n`;
        } else if (rankingDiff >= 15) {
          prompt += ` - VANTAGGIO SIGNIFICATIVO per ${stronger}\n`;
        } else if (rankingDiff >= 5) {
          prompt += ` - Leggero vantaggio per ${stronger}\n`;
        } else {
          prompt += ` - EQUILIBRIO: squadre di livello simile\n`;
        }
      }

      prompt += `NOTA: Il ranking FIFA e un indicatore chiave per le nazionali (specialmente quando non ci sono classifiche)\n\n`;
    }

    // Add standings information (CRITICAL for accuracy)
    if (homeStanding) {
      prompt += `**CLASSIFICA ${homeTeam.name}**:\n`;
      prompt += `- Posizione: ${homeStanding.position}\n`;
      prompt += `- Punti: ${homeStanding.points} (in ${homeStanding.played} partite)\n`;
      prompt += `- Gol fatti/subiti: ${homeStanding.goalsFor}/${homeStanding.goalsAgainst}\n`;
      prompt += `- Differenza reti: ${homeStanding.goalDifference > 0 ? '+' : ''}${homeStanding.goalDifference}\n`;
      prompt += `- Media gol a partita: ${(homeStanding.goalsFor / homeStanding.played).toFixed(2)} fatti, ${(homeStanding.goalsAgainst / homeStanding.played).toFixed(2)} subiti\n\n`;
    }

    if (awayStanding) {
      prompt += `**CLASSIFICA ${awayTeam.name}**:\n`;
      prompt += `- Posizione: ${awayStanding.position}\n`;
      prompt += `- Punti: ${awayStanding.points} (in ${awayStanding.played} partite)\n`;
      prompt += `- Gol fatti/subiti: ${awayStanding.goalsFor}/${awayStanding.goalsAgainst}\n`;
      prompt += `- Differenza reti: ${awayStanding.goalDifference > 0 ? '+' : ''}${awayStanding.goalDifference}\n`;
      prompt += `- Media gol a partita: ${(awayStanding.goalsFor / awayStanding.played).toFixed(2)} fatti, ${(awayStanding.goalsAgainst / awayStanding.played).toFixed(2)} subiti\n\n`;
    }

    // Add equilibrium analysis
    if (homeStanding && awayStanding) {
      const positionDiff = Math.abs(homeStanding.position - awayStanding.position);
      const pointsDiff = Math.abs(homeStanding.points - awayStanding.points);

      prompt += `**ANALISI EQUILIBRIO**:\n`;
      prompt += `- Differenza posizioni: ${positionDiff} (${positionDiff <= 3 ? 'SQUADRE MOLTO EQUILIBRATE - ALTA PROBABILITA PAREGGIO' : positionDiff <= 6 ? 'Abbastanza equilibrate' : 'Netta differenza'})\n`;
      prompt += `- Differenza punti: ${pointsDiff} (${pointsDiff <= 3 ? 'EQUILIBRIO TOTALE' : pointsDiff <= 6 ? 'Moderate' : 'Grande divario'})\n`;

      const homeAvgGoals = homeStanding.goalsFor / homeStanding.played;
      const awayAvgGoals = awayStanding.goalsFor / awayStanding.played;
      if (homeAvgGoals < 1.3 && awayAvgGoals < 1.3) {
        prompt += `- ENTRAMBE LE SQUADRE CON POCHI GOL -> ALTA PROBABILITA PAREGGIO BASSO (0-0 o 1-1)\n`;
      }
      prompt += `\n`;
    }

    // Add recent form
    if (homeForm) {
      const drawPercentage = (homeForm.draws / 5 * 100).toFixed(0);
      prompt += `**FORMA RECENTE ${homeTeam.name}** (ultimi 5 match):\n`;
      prompt += `- Striscia: ${homeForm.recentForm} (W=Vittoria, D=Pareggio, L=Sconfitta)\n`;
      prompt += `- Bilancio: ${homeForm.wins}V ${homeForm.draws}P ${homeForm.losses}S\n`;
      prompt += `- PAREGGI: ${homeForm.draws} su 5 (${drawPercentage}%) ${homeForm.draws >= 2 ? 'TENDENZA ALTA AI PAREGGI' : ''}\n`;
      prompt += `- Gol: ${homeForm.goalsScored} fatti, ${homeForm.goalsConceded} subiti (media ${(homeForm.goalsScored/5).toFixed(1)}/${(homeForm.goalsConceded/5).toFixed(1)} a partita)\n\n`;
    }

    if (awayForm) {
      const drawPercentage = (awayForm.draws / 5 * 100).toFixed(0);
      prompt += `**FORMA RECENTE ${awayTeam.name}** (ultimi 5 match):\n`;
      prompt += `- Striscia: ${awayForm.recentForm} (W=Vittoria, D=Pareggio, L=Sconfitta)\n`;
      prompt += `- Bilancio: ${awayForm.wins}V ${awayForm.draws}P ${awayForm.losses}S\n`;
      prompt += `- PAREGGI: ${awayForm.draws} su 5 (${drawPercentage}%) ${awayForm.draws >= 2 ? 'TENDENZA ALTA AI PAREGGI' : ''}\n`;
      prompt += `- Gol: ${awayForm.goalsScored} fatti, ${awayForm.goalsConceded} subiti (media ${(awayForm.goalsScored/5).toFixed(1)}/${(awayForm.goalsConceded/5).toFixed(1)} a partita)\n\n`;
    }

    // Add injuries/suspensions section
    const hasHomeInjuries = homeInjuries && homeInjuries.length > 0;
    const hasAwayInjuries = awayInjuries && awayInjuries.length > 0;

    if (hasHomeInjuries || hasAwayInjuries) {
      prompt += `**INFORTUNI E SQUALIFICHE**:\n`;
      prompt += `FATTORE CRITICO: Gli assenti possono influenzare significativamente le probabilita!\n\n`;

      if (hasHomeInjuries) {
        const injuriesList = homeInjuries!.filter(i => i.type === 'injury');
        const suspensions = homeInjuries!.filter(i => i.type === 'suspension');
        const doubtful = homeInjuries!.filter(i => i.type === 'doubtful');

        prompt += `**${homeTeam.name} - Assenti (${homeInjuries!.length} giocatori)**:\n`;

        if (injuriesList.length > 0) {
          prompt += `- Infortunati: ${injuriesList.map(i => `${i.playerName} (${i.reason})`).join(', ')}\n`;
        }
        if (suspensions.length > 0) {
          prompt += `- Squalificati: ${suspensions.map(i => `${i.playerName} (${i.reason})`).join(', ')}\n`;
        }
        if (doubtful.length > 0) {
          prompt += `- In dubbio: ${doubtful.map(i => `${i.playerName} (${i.reason})`).join(', ')}\n`;
        }

        // Impact analysis
        if (homeInjuries!.length >= 3) {
          prompt += `- IMPATTO ALTO: Molti assenti potrebbero indebolire significativamente la squadra\n`;
        }
        prompt += `\n`;
      }

      if (hasAwayInjuries) {
        const injuriesList = awayInjuries!.filter(i => i.type === 'injury');
        const suspensions = awayInjuries!.filter(i => i.type === 'suspension');
        const doubtful = awayInjuries!.filter(i => i.type === 'doubtful');

        prompt += `**${awayTeam.name} - Assenti (${awayInjuries!.length} giocatori)**:\n`;

        if (injuriesList.length > 0) {
          prompt += `- Infortunati: ${injuriesList.map(i => `${i.playerName} (${i.reason})`).join(', ')}\n`;
        }
        if (suspensions.length > 0) {
          prompt += `- Squalificati: ${suspensions.map(i => `${i.playerName} (${i.reason})`).join(', ')}\n`;
        }
        if (doubtful.length > 0) {
          prompt += `- In dubbio: ${doubtful.map(i => `${i.playerName} (${i.reason})`).join(', ')}\n`;
        }

        if (awayInjuries!.length >= 3) {
          prompt += `- IMPATTO ALTO: Molti assenti potrebbero indebolire significativamente la squadra\n`;
        }
        prompt += `\n`;
      }

      // Comparative analysis
      if (hasHomeInjuries && hasAwayInjuries) {
        const homeMissing = homeInjuries!.length;
        const awayMissing = awayInjuries!.length;
        if (Math.abs(homeMissing - awayMissing) >= 3) {
          const lessAffected = homeMissing < awayMissing ? homeTeam.name : awayTeam.name;
          prompt += `VANTAGGIO NUMERICO: ${lessAffected} ha meno assenti -> possibile vantaggio in campo\n\n`;
        }
      } else if (hasHomeInjuries && !hasAwayInjuries) {
        prompt += `${awayTeam.name} al completo vs ${homeTeam.name} con assenti -> vantaggio trasferta\n\n`;
      } else if (hasAwayInjuries && !hasHomeInjuries) {
        prompt += `${homeTeam.name} al completo vs ${awayTeam.name} con assenti -> vantaggio casa\n\n`;
      }
    }

    if (match) {
      const compName = match.competitionId === 2019 ? "Serie A" :
                      match.competitionId === 2021 ? "Premier League" :
                      match.competitionId === 2002 ? "Bundesliga" :
                      match.competitionId === 2015 ? "Ligue 1" :
                      match.competitionId === 2 ? "Europa League" :
                      match.competitionId === 848 ? "Conference League" :
                      match.competitionId === 32 ? "Qualificazioni Mondiali UEFA" : "Champions League";

      const isNationalTeam = match.competitionId === 32;

      prompt += `**DETTAGLI PARTITA**:\n`;
      prompt += `- Competizione: ${compName}\n`;

      if (isNationalTeam) {
        prompt += `- CONTESTO INTERNAZIONALE: Partita tra nazionali\n`;
        prompt += `- NOTA: Non ci sono classifiche per le nazionali - valuta basandoti su forma recente e media gol\n`;
        prompt += `- Le nazionali giocano con meno frequenza rispetto ai club (pause internazionali ogni 2-3 mesi)\n`;
        prompt += `- Alta posta in palio: qualificazione ai Mondiali 2026\n`;
        prompt += `- I pareggi sono MOLTO piu comuni nelle qualificazioni (squadre giocano con prudenza)\n`;
        prompt += `- Valuta la forza relativa delle squadre basandoti su: forma recente, media gol, e storico\n`;
      }

      prompt += `- Data: ${new Date(match.utcDate).toLocaleDateString("it-IT", {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}\n`;
      prompt += `- Ora: ${new Date(match.utcDate).toLocaleTimeString("it-IT", {hour: '2-digit', minute: '2-digit'})}\n`;
      if (match.matchday) prompt += `- Giornata: ${match.matchday}\n`;
    }

    // Add Cards & Corners statistics
    if (homeAvgCards !== undefined || awayAvgCards !== undefined || homeAvgCorners !== undefined || awayAvgCorners !== undefined) {
      prompt += `\n**STATISTICHE CARTELLINI E CORNER**:\n`;

      if (homeAvgCards !== undefined) {
        const cardLevel = homeAvgCards >= 3.5 ? "MOLTO ALTA - Squadra aggressiva" :
                         homeAvgCards >= 2.5 ? "ALTA - Molti falli" :
                         homeAvgCards >= 1.5 ? "MEDIA" : "BASSA - Gioco pulito";
        prompt += `- ${homeTeam.name} - Cartellini medi: ${homeAvgCards.toFixed(1)} per partita (${cardLevel})\n`;
      }

      if (awayAvgCards !== undefined) {
        const cardLevel = awayAvgCards >= 3.5 ? "MOLTO ALTA - Squadra aggressiva" :
                         awayAvgCards >= 2.5 ? "ALTA - Molti falli" :
                         awayAvgCards >= 1.5 ? "MEDIA" : "BASSA - Gioco pulito";
        prompt += `- ${awayTeam.name} - Cartellini medi: ${awayAvgCards.toFixed(1)} per partita (${cardLevel})\n`;
      }

      if (homeAvgCards !== undefined && awayAvgCards !== undefined) {
        const totalAvgCards = homeAvgCards + awayAvgCards;
        if (totalAvgCards >= 5) {
          prompt += `- PARTITA POTENZIALMENTE "CATTIVA": ${totalAvgCards.toFixed(1)} cartellini totali previsti\n`;
        }
      }

      if (homeAvgCorners !== undefined) {
        const cornerLevel = homeAvgCorners >= 6 ? "MOLTO OFFENSIVA" :
                           homeAvgCorners >= 4 ? "OFFENSIVA" : "Pochi corner";
        prompt += `- ${homeTeam.name} - Corner medi: ${homeAvgCorners.toFixed(1)} per partita (${cornerLevel})\n`;
      }

      if (awayAvgCorners !== undefined) {
        const cornerLevel = awayAvgCorners >= 6 ? "MOLTO OFFENSIVA" :
                           awayAvgCorners >= 4 ? "OFFENSIVA" : "Pochi corner";
        prompt += `- ${awayTeam.name} - Corner medi: ${awayAvgCorners.toFixed(1)} per partita (${cornerLevel})\n`;
      }

      if (homeAvgCorners !== undefined && awayAvgCorners !== undefined) {
        const totalAvgCorners = homeAvgCorners + awayAvgCorners;
        prompt += `- TOTALE CORNER PREVISTI: circa ${totalAvgCorners.toFixed(1)} (range: ${(totalAvgCorners * 0.8).toFixed(0)}-${(totalAvgCorners * 1.2).toFixed(0)})\n`;
      }
    }

    // Add blockchain prediction market odds (CRITICAL SIGNAL)
    if (blockchainOdds && blockchainOdds.homeWinProb) {
      const volume = parseFloat(blockchainOdds.totalVolume || "0");
      const liquidity = parseFloat(blockchainOdds.totalLiquidity || "0");
      const volumeLabel = volume >= 50000 ? "MOLTO ALTO - Segnale fortissimo" :
                         volume >= 10000 ? "ALTO - Segnale affidabile" :
                         volume >= 1000 ? "MEDIO - Segnale utile" : "BASSO - Segnale debole";

      prompt += `\n**MERCATI PREDITTIVI BLOCKCHAIN (Polymarket)**:\n`;
      prompt += `DATO CRUCIALE: Queste probabilita derivano da mercati dove persone reali scommettono soldi veri.\n`;
      prompt += `La "saggezza della folla" con denaro in gioco e storicamente piu accurata dei singoli analisti.\n`;
      prompt += `Volume: $${volume.toFixed(0)} (${volumeLabel})\n`;
      prompt += `Liquidita: $${liquidity.toFixed(0)}\n\n`;

      const homeProb = (parseFloat(blockchainOdds.homeWinProb) * 100).toFixed(1);
      const drawProb = blockchainOdds.drawProb ? (parseFloat(blockchainOdds.drawProb) * 100).toFixed(1) : null;
      const awayProb = blockchainOdds.awayWinProb ? (parseFloat(blockchainOdds.awayWinProb) * 100).toFixed(1) : null;

      prompt += `- 1X2 Mercato: Casa ${homeProb}%`;
      if (drawProb) prompt += `, Pareggio ${drawProb}%`;
      if (awayProb) prompt += `, Trasferta ${awayProb}%`;
      prompt += `\n`;

      if (blockchainOdds.over25Prob) {
        prompt += `- Over 2.5: ${(parseFloat(blockchainOdds.over25Prob) * 100).toFixed(1)}%\n`;
      }
      if (blockchainOdds.over35Prob) {
        prompt += `- Over 3.5: ${(parseFloat(blockchainOdds.over35Prob) * 100).toFixed(1)}%\n`;
      }
      if (blockchainOdds.bttsYesProb) {
        prompt += `- BTTS Si: ${(parseFloat(blockchainOdds.bttsYesProb) * 100).toFixed(1)}%\n`;
      }
      if (blockchainOdds.homeWinProbHT) {
        const htHome = (parseFloat(blockchainOdds.homeWinProbHT) * 100).toFixed(1);
        const htDraw = blockchainOdds.drawProbHT ? (parseFloat(blockchainOdds.drawProbHT) * 100).toFixed(1) : "?";
        const htAway = blockchainOdds.awayWinProbHT ? (parseFloat(blockchainOdds.awayWinProbHT) * 100).toFixed(1) : "?";
        prompt += `- 1X2 Primo Tempo: Casa ${htHome}%, Pareggio ${htDraw}%, Trasferta ${htAway}%\n`;
      }
      if (blockchainOdds.cornersOver85Prob) {
        prompt += `- Corner Over 8.5: ${(parseFloat(blockchainOdds.cornersOver85Prob) * 100).toFixed(1)}%\n`;
      }

      prompt += `\nIMPORTANTE: Usa questi dati come ANCORA per le tue probabilita. Se i tuoi calcoli divergono molto dal mercato (>15%), giustifica il perche. Il mercato ha quasi sempre ragione sui favoriti.\n`;
    }

    const isNationalTeam = match?.competitionId === 32;

    prompt += `\nISTRUZIONI CRITICHE:\n`;
    if (isNationalTeam) {
      prompt += `1. IMPORTANTE: Non ci sono classifiche per le nazionali - usa SOLO forma recente e media gol come indicatori\n`;
      prompt += `2. Analizza la forma gol recente per valutare Over/Under e Gol/NoGol\n`;
      prompt += `3. Considera che i pareggi sono piu probabili nelle qualificazioni mondiali (cautela tattica)\n`;
      prompt += `4. Una nazionale con form molto positivo (es: WWWW) e favorita, ma NON fortemente (no certezze)\n`;
      prompt += `5. Raccomanda scommesse aggiuntive SOLO se la probabilita e >65% e i dati lo supportano\n`;
    } else {
      prompt += `1. CONSIDERA PESANTEMENTE la posizione in classifica e la differenza punti\n`;
      prompt += `2. Analizza la forma gol recente per valutare Over/Under e Gol/NoGol\n`;
      prompt += `3. Una squadra in posizioni alte con forma positiva e FORTEMENTE favorita vs squadre basse\n`;
      prompt += `4. Raccomanda scommesse aggiuntive SOLO se la probabilita e >60% e i dati lo supportano\n`;
    }
    if (adaptiveWeights) {
      const weightNum = isNationalTeam ? 6 : 5;
      prompt += `${weightNum}. I pesi adattivi riflettono l'accuratezza storica: sii piu/meno conservativo basandoti su questi dati\n`;
    }
    prompt += `\nGenera ora un pronostico completo con probabilita 1X2, Over/Under, Gol/NoGol, pronostici primo tempo e scommesse raccomandate.`;

    return prompt;
  }

  private generateBasicPrediction(
    match: Match,
    homeForm?: TeamForm,
    awayForm?: TeamForm,
    isPremium: boolean = false
  ): InsertPrediction {
    // Simple form-based prediction as fallback
    const homeStrength = homeForm
      ? (homeForm.wins * 3 + homeForm.draws) / ((homeForm.wins + homeForm.draws + homeForm.losses) * 3)
      : 0.5;

    const awayStrength = awayForm
      ? (awayForm.wins * 3 + awayForm.draws) / ((awayForm.wins + awayForm.draws + awayForm.losses) * 3)
      : 0.5;

    // Home advantage
    const homeAdvantage = 0.1;
    const adjustedHomeStrength = Math.min(homeStrength + homeAdvantage, 1);

    const total = adjustedHomeStrength + awayStrength + 0.5; // 0.5 for draw
    const homeWinProbNum = (adjustedHomeStrength / total * 100);
    const drawProbNum = (0.5 / total * 100);
    const awayWinProbNum = (awayStrength / total * 100);

    const homeWinProb = homeWinProbNum.toFixed(2);
    const drawProb = drawProbNum.toFixed(2);
    const awayWinProb = awayWinProbNum.toFixed(2);

    // Determine predicted winner and double chance
    let predictedWinner: "HOME_TEAM" | "DRAW" | "AWAY_TEAM";
    let doubleChance: string | null = null;

    const probabilities = {
      HOME_TEAM: homeWinProbNum,
      DRAW: drawProbNum,
      AWAY_TEAM: awayWinProbNum
    };

    const sortedResults = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
    const [topResult, topProb] = sortedResults[0];
    const [secondResult, secondProb] = sortedResults[1];

    // STRATEGY: Favor DRAW when appropriate (fallback has less data, so be more conservative)
    if (drawProbNum >= 32 && Math.abs(topProb - drawProbNum) <= 10) {
      predictedWinner = 'DRAW';

      if (homeWinProbNum > awayWinProbNum) {
        doubleChance = '1X';
      } else {
        doubleChance = 'X2';
      }
    }
    // If top two probabilities are within 10%, suggest double chance
    else if (Math.abs(topProb - secondProb) <= 10) {
      predictedWinner = topResult as "HOME_TEAM" | "DRAW" | "AWAY_TEAM";

      const results = [topResult, secondResult].sort().join('');
      if (results === 'DRAWHOME_TEAM') {
        doubleChance = '1X';
      } else if (results === 'AWAY_TEAMDRAW') {
        doubleChance = 'X2';
      } else if (results === 'AWAY_TEAMHOME_TEAM') {
        doubleChance = '12';
      }
    } else {
      predictedWinner = topResult as "HOME_TEAM" | "DRAW" | "AWAY_TEAM";
    }

    const avgHomeGoals = homeForm ? homeForm.goalsScored / 5 : 1.5;
    const avgAwayGoals = awayForm ? awayForm.goalsScored / 5 : 1.0;

    return {
      matchId: match.id,
      predictedWinner,
      doubleChance,
      homeWinProbability: homeWinProb,
      drawProbability: drawProb,
      awayWinProbability: awayWinProb,
      predictedHomeScore: avgHomeGoals.toFixed(1),
      predictedAwayScore: avgAwayGoals.toFixed(1),
      confidence: "65.00",
      keyFactors: [
        "Analisi basata sulla forma recente",
        "Vantaggio casalingo considerato",
        "Media gol delle ultime partite",
      ],
      isPremium,
      actualResult: null,
      isCorrect: null,
    };
  }

  private async calculateTeamCardsCornersAverage(teamId: number, competitionId: number): Promise<{avgCards: number, avgCorners: number}> {
    try {
      // Get last 5 finished matches for this team in this competition
      const finishedMatches = await db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.competitionId, competitionId),
            or(
              eq(matches.homeTeamId, teamId),
              eq(matches.awayTeamId, teamId)
            ),
            eq(matches.status, "FINISHED")
          )
        )
        .orderBy(desc(matches.utcDate))
        .limit(5);

      if (finishedMatches.length === 0) {
        return { avgCards: 2.5, avgCorners: 5 }; // Default values
      }

      let totalCards = 0;
      let totalCorners = 0;
      let validMatchesCount = 0;

      for (const match of finishedMatches) {
        const stats = await db
          .select()
          .from(matchStats)
          .where(eq(matchStats.matchId, match.id))
          .limit(1);

        if (stats.length > 0) {
          const stat = stats[0];
          const isHome = match.homeTeamId === teamId;

          const cards = isHome
            ? (stat.homeYellowCards || 0) + (stat.homeRedCards || 0)
            : (stat.awayYellowCards || 0) + (stat.awayRedCards || 0);

          const corners = isHome
            ? (stat.homeCorners || 0)
            : (stat.awayCorners || 0);

          totalCards += cards;
          totalCorners += corners;
          validMatchesCount++;
        }
      }

      if (validMatchesCount === 0) {
        return { avgCards: 2.5, avgCorners: 5 };
      }

      return {
        avgCards: totalCards / validMatchesCount,
        avgCorners: totalCorners / validMatchesCount
      };
    } catch (error) {
      console.error(`Error calculating cards/corners average for team ${teamId}:`, error);
      return { avgCards: 2.5, avgCorners: 5 }; // Fallback
    }
  }

  async generatePredictionsForUpcomingMatches(competitionId: number, isPremium: boolean = false): Promise<void> {
    const { footballDataService } = await import("./football-data");

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const upcomingMatches = await db
      .select()
      .from(matches)
      .where(
        and(eq(matches.competitionId, competitionId), gte(matches.utcDate, twoHoursAgo))
      )
      .orderBy(matches.utcDate)
      .limit(10);

    // Get competition code for standings
    const competition = await db.select().from(competitions).where(eq(competitions.id, competitionId)).limit(1).then(r => r[0] ?? null);
    let standingsExternal: any = null;

    // Try external API first (Football-Data.org)
    try {
      if (competition) {
        standingsExternal = await footballDataService.getStandings(competition.code);
      }
    } catch (error) {
      console.warn(`Could not fetch standings from external API for competition ${competitionId}`);
    }

    // FALLBACK: Read standings from local database (for Serie B, WCQ, etc.)
    let localStandings: any[] = [];
    if (!standingsExternal?.standings || standingsExternal.standings.length === 0) {
      try {
        const currentSeason = new Date().getFullYear();
        localStandings = await db
          .select()
          .from(standings)
          .where(and(eq(standings.competitionId, competitionId), eq(standings.season, currentSeason)))
          .orderBy(asc(standings.position));
        if (localStandings.length > 0) {
          console.log(`Using local DB standings for competition ${competitionId}: ${localStandings.length} teams`);
        }
      } catch (error) {
        console.warn(`Could not fetch local standings for competition ${competitionId}`);
      }
    }

    for (const match of upcomingMatches) {
      // Check if prediction already exists
      const existingPrediction = await db
        .select()
        .from(predictions)
        .where(eq(predictions.matchId, match.id))
        .orderBy(desc(predictions.createdAt))
        .limit(1)
        .then(r => r[0] ?? null);
      if (existingPrediction) continue;

      const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then(r => r[0] ?? null);
      const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then(r => r[0] ?? null);

      if (!homeTeam || !awayTeam) continue;

      const homeForm = await db.select().from(teamForm).where(and(eq(teamForm.teamId, match.homeTeamId), eq(teamForm.competitionId, match.competitionId))).limit(1).then(r => r[0] ?? undefined);
      const awayForm = await db.select().from(teamForm).where(and(eq(teamForm.teamId, match.awayTeamId), eq(teamForm.competitionId, match.competitionId))).limit(1).then(r => r[0] ?? undefined);

      // Extract standings for both teams
      let homeStanding: TeamStanding | undefined;
      let awayStanding: TeamStanding | undefined;

      // Try external API standings first
      if (standingsExternal?.standings && standingsExternal.standings.length > 0) {
        const table = standingsExternal.standings[0].table;
        const homeEntry = table.find((entry: any) => entry.team.id === match.homeTeamId);
        const awayEntry = table.find((entry: any) => entry.team.id === match.awayTeamId);

        if (homeEntry) {
          homeStanding = {
            position: homeEntry.position,
            points: homeEntry.points,
            goalsFor: homeEntry.goalsFor,
            goalsAgainst: homeEntry.goalsAgainst,
            goalDifference: homeEntry.goalDifference,
            played: homeEntry.playedGames,
          };
        }

        if (awayEntry) {
          awayStanding = {
            position: awayEntry.position,
            points: awayEntry.points,
            goalsFor: awayEntry.goalsFor,
            goalsAgainst: awayEntry.goalsAgainst,
            goalDifference: awayEntry.goalDifference,
            played: awayEntry.playedGames,
          };
        }
      }
      // FALLBACK: Use local database standings (for Serie B, WCQ, etc.)
      else if (localStandings.length > 0) {
        const homeEntry = localStandings.find((s: any) => s.teamId === match.homeTeamId);
        const awayEntry = localStandings.find((s: any) => s.teamId === match.awayTeamId);

        if (homeEntry) {
          homeStanding = {
            position: homeEntry.position,
            points: homeEntry.points,
            goalsFor: homeEntry.goalsFor,
            goalsAgainst: homeEntry.goalsAgainst,
            goalDifference: homeEntry.goalsFor - homeEntry.goalsAgainst,
            played: homeEntry.won + homeEntry.draw + homeEntry.lost,
          };
        }

        if (awayEntry) {
          awayStanding = {
            position: awayEntry.position,
            points: awayEntry.points,
            goalsFor: awayEntry.goalsFor,
            goalsAgainst: awayEntry.goalsAgainst,
            goalDifference: awayEntry.goalsFor - awayEntry.goalsAgainst,
            played: awayEntry.won + awayEntry.draw + awayEntry.lost,
          };
        }

        if (homeStanding && awayStanding) {
          console.log(`Standings loaded: ${homeTeam.name} (${homeStanding.position}, ${homeStanding.points}pts) vs ${awayTeam.name} (${awayStanding.position}, ${awayStanding.points}pts)`);
        }
      }

      // Calculate cards and corners averages
      const homeStats = await this.calculateTeamCardsCornersAverage(match.homeTeamId, match.competitionId);
      const awayStats = await this.calculateTeamCardsCornersAverage(match.awayTeamId, match.competitionId);

      const prediction = await this.generatePrediction(
        {
          match,
          homeTeam,
          awayTeam,
          homeForm,
          awayForm,
          homeStanding,
          awayStanding,
          homeAvgCards: homeStats.avgCards,
          awayAvgCards: awayStats.avgCards,
          homeAvgCorners: homeStats.avgCorners,
          awayAvgCorners: awayStats.avgCorners,
        },
        isPremium
      );

      await db.insert(predictions).values(prediction);
    }
  }

  // Wrapper function to generate prediction from just matchId
  async generatePredictionFromMatchId(matchId: number, isPremium: boolean = false): Promise<void> {
    const { footballDataService } = await import("./football-data");

    const match = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1).then(r => r[0] ?? null);
    if (!match) {
      throw new Error(`Match ${matchId} not found`);
    }

    const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then(r => r[0] ?? null);
    const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then(r => r[0] ?? null);

    if (!homeTeam || !awayTeam) {
      throw new Error(`Teams not found for match ${matchId}`);
    }

    const homeForm = await db.select().from(teamForm).where(and(eq(teamForm.teamId, match.homeTeamId), eq(teamForm.competitionId, match.competitionId))).limit(1).then(r => r[0] ?? undefined);
    const awayForm = await db.select().from(teamForm).where(and(eq(teamForm.teamId, match.awayTeamId), eq(teamForm.competitionId, match.competitionId))).limit(1).then(r => r[0] ?? undefined);

    // Get standings if available (not all competitions have standings)
    let homeStanding: TeamStanding | undefined;
    let awayStanding: TeamStanding | undefined;

    try {
      const competition = await db.select().from(competitions).where(eq(competitions.id, match.competitionId)).limit(1).then(r => r[0] ?? null);
      let foundStandings = false;

      // Try external API first (Football-Data.org)
      if (competition) {
        try {
          const standingsExternal = await footballDataService.getStandings(competition.code);

          if (standingsExternal?.standings && standingsExternal.standings.length > 0) {
            const table = standingsExternal.standings[0].table;
            const homeEntry = table.find((entry: any) => entry.team.id === match.homeTeamId);
            const awayEntry = table.find((entry: any) => entry.team.id === match.awayTeamId);

            if (homeEntry) {
              homeStanding = {
                position: homeEntry.position,
                points: homeEntry.points,
                goalsFor: homeEntry.goalsFor,
                goalsAgainst: homeEntry.goalsAgainst,
                goalDifference: homeEntry.goalDifference,
                played: homeEntry.playedGames,
              };
              foundStandings = true;
            }

            if (awayEntry) {
              awayStanding = {
                position: awayEntry.position,
                points: awayEntry.points,
                goalsFor: awayEntry.goalsFor,
                goalsAgainst: awayEntry.goalsAgainst,
                goalDifference: awayEntry.goalDifference,
                played: awayEntry.playedGames,
              };
              foundStandings = true;
            }
          }
        } catch (apiError) {
          console.warn(`External API standings not available for ${competition.code}`);
        }
      }

      // FALLBACK: Use local database standings (for Serie B, WCQ, etc.)
      if (!foundStandings) {
        const currentSeason = new Date().getFullYear();
        const localStandings = await db
          .select()
          .from(standings)
          .where(and(eq(standings.competitionId, match.competitionId), eq(standings.season, currentSeason)))
          .orderBy(asc(standings.position));

        if (localStandings.length > 0) {
          console.log(`Using local DB standings for match ${matchId}: ${localStandings.length} teams`);

          const homeEntry = localStandings.find((s: any) => s.teamId === match.homeTeamId);
          const awayEntry = localStandings.find((s: any) => s.teamId === match.awayTeamId);

          if (homeEntry) {
            homeStanding = {
              position: homeEntry.position,
              points: homeEntry.points,
              goalsFor: homeEntry.goalsFor,
              goalsAgainst: homeEntry.goalsAgainst,
              goalDifference: homeEntry.goalsFor - homeEntry.goalsAgainst,
              played: homeEntry.won + homeEntry.draw + homeEntry.lost,
            };
          }

          if (awayEntry) {
            awayStanding = {
              position: awayEntry.position,
              points: awayEntry.points,
              goalsFor: awayEntry.goalsFor,
              goalsAgainst: awayEntry.goalsAgainst,
              goalDifference: awayEntry.goalsFor - awayEntry.goalsAgainst,
              played: awayEntry.won + awayEntry.draw + awayEntry.lost,
            };
          }

          if (homeStanding && awayStanding) {
            console.log(`Standings: ${homeTeam.name} (${homeStanding.position}, ${homeStanding.points}pts) vs ${awayTeam.name} (${awayStanding.position}, ${awayStanding.points}pts)`);
          }
        }
      }
    } catch (error) {
      console.warn(`Could not fetch standings for match ${matchId}:`, error);
      // Continue without standings - it's OK for competitions like Champions League
    }

    // Calculate cards and corners averages
    const homeStats = await this.calculateTeamCardsCornersAverage(match.homeTeamId, match.competitionId);
    const awayStats = await this.calculateTeamCardsCornersAverage(match.awayTeamId, match.competitionId);

    // Get injuries/suspensions for both teams
    let homeInjuries;
    let awayInjuries;
    try {
      homeInjuries = await db
        .select()
        .from(injuries)
        .where(and(eq(injuries.teamId, match.homeTeamId), eq(injuries.isActive, true)))
        .orderBy(desc(injuries.updatedAt));
      awayInjuries = await db
        .select()
        .from(injuries)
        .where(and(eq(injuries.teamId, match.awayTeamId), eq(injuries.isActive, true)))
        .orderBy(desc(injuries.updatedAt));
      if (homeInjuries.length > 0 || awayInjuries.length > 0) {
        console.log(`Injuries found: ${homeTeam.name} (${homeInjuries.length}), ${awayTeam.name} (${awayInjuries.length})`);
      }
    } catch (error) {
      console.warn(`Could not fetch injuries for match ${matchId}:`, error);
    }

    const prediction = await this.generatePrediction(
      {
        match,
        homeTeam,
        awayTeam,
        homeForm,
        awayForm,
        homeStanding,
        awayStanding,
        homeAvgCards: homeStats.avgCards,
        awayAvgCards: awayStats.avgCards,
        homeAvgCorners: homeStats.avgCorners,
        awayAvgCorners: awayStats.avgCorners,
        homeInjuries,
        awayInjuries,
      },
      isPremium
    );

    // Delete existing prediction before creating new one (avoid duplicates)
    const existingPrediction = await db
      .select()
      .from(predictions)
      .where(eq(predictions.matchId, matchId))
      .orderBy(desc(predictions.createdAt))
      .limit(1)
      .then(r => r[0] ?? null);
    if (existingPrediction) {
      await db.delete(predictions).where(eq(predictions.matchId, matchId));
      console.log(`Deleted existing prediction for match ${matchId} before regenerating`);
    }

    await db.insert(predictions).values(prediction);
  }
}

export const aiPredictionService = new AIPredictionService();
