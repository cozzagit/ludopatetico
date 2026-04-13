import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, teams, competitions, predictions, marketOdds } from '@/src/lib/db/schema';
import { eq, gte, asc, and } from 'drizzle-orm';

interface AccuracyRow {
  competitionId: number;
  competitionName: string;
  marketType: string;
  accuracy: number;
  totalPredictions: number;
}

interface SuggestedBet {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  competition: string;
  competitionCode: string;
  utcDate: string;
  betType: string;
  betLabel: string;
  betValue: string;
  probability: number;
  historicalAccuracy: number;
  marketOddsProb: number | null;
  reliabilityScore: number;
  confidence: number;
  reasoning: string;
}

const BET_LABELS: Record<string, string> = {
  '1X2_HOME': 'Vittoria Casa (1)',
  '1X2_DRAW': 'Pareggio (X)',
  '1X2_AWAY': 'Vittoria Trasferta (2)',
  'OVER_25': 'Over 2.5 Gol',
  'UNDER_25': 'Under 2.5 Gol',
  'OVER_35': 'Over 3.5 Gol',
  'BTTS_YES': 'GG (Goal)',
  'BTTS_NO': 'NG (No Goal)',
  'OVER_15': 'Over 1.5 Gol',
  'DC_1X': 'Doppia Chance 1X',
  'DC_X2': 'Doppia Chance X2',
};

export async function GET() {
  try {
    // 1. Fetch historical accuracy per competition x market
    const accRes = await fetch(
      `${process.env.NEXTAUTH_URL || 'http://localhost:3005'}/api/predictions/accuracy-by-competition`
    ).catch(() => null);
    const accuracyData: AccuracyRow[] = accRes?.ok ? await accRes.json() : [];

    // Build accuracy lookup: compId_marketType -> accuracy
    const accuracyMap = new Map<string, number>();
    for (const row of accuracyData) {
      accuracyMap.set(`${row.competitionId}_${row.marketType}`, row.accuracy);
    }

    // 2. Get upcoming matches with predictions (next 7 days)
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const upcomingPreds = await db
      .select({
        prediction: predictions,
        match: matches,
      })
      .from(predictions)
      .innerJoin(matches, eq(predictions.matchId, matches.id))
      .where(
        and(
          gte(matches.utcDate, now),
          // Filter out matches too far away
        )
      )
      .orderBy(asc(matches.utcDate))
      .limit(200);

    // Filter to next 7 days
    const filtered = upcomingPreds.filter(r => new Date(r.match.utcDate) <= weekFromNow);

    // 3. Enrich and calculate bets
    const allBets: SuggestedBet[] = [];

    for (const { prediction: pred, match } of filtered) {
      const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then(r => r[0]);
      const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then(r => r[0]);
      const comp = await db.select().from(competitions).where(eq(competitions.id, match.competitionId)).limit(1).then(r => r[0]);

      if (!homeTeam || !awayTeam || !comp) continue;

      // Get market odds
      const mktOdds = await db.select().from(marketOdds).where(eq(marketOdds.matchId, match.id)).limit(1).then(r => r[0] ?? null);

      const homeProb = parseFloat(pred.homeWinProbability);
      const drawProb = parseFloat(pred.drawProbability);
      const awayProb = parseFloat(pred.awayWinProbability);
      const confidence = parseFloat(pred.confidence);

      const baseBet = {
        matchId: match.id,
        homeTeam: homeTeam.shortName || homeTeam.name,
        awayTeam: awayTeam.shortName || awayTeam.name,
        homeTeamCrest: homeTeam.crest,
        awayTeamCrest: awayTeam.crest,
        competition: comp.name,
        competitionCode: comp.code,
        utcDate: match.utcDate.toISOString(),
        confidence,
      };

      // Helper to calculate reliability score
      // Weighted: 35% probability, 40% historical accuracy (heaviest — confidence removed, inverted in data),
      // 25% market agreement
      function calcScore(prob: number, marketType: string, mktProb: number | null): number {
        const histAcc = accuracyMap.get(`${match.competitionId}_${marketType}`) || 50;
        const marketAgreement = mktProb !== null ? (1 - Math.abs(prob / 100 - mktProb) / 0.5) * 100 : 50;
        return (prob * 0.35) + (histAcc * 0.40) + (Math.max(0, marketAgreement) * 0.25);
      }

      // FIX 2: Exclude Europa League and Conference League (28-37% 1X2 accuracy — worse than random)
      const EXCLUDED_COMPETITION_CODES = ['EL', 'ECL'];
      if (EXCLUDED_COMPETITION_CODES.includes(comp.code)) continue;

      // 1X2 bets
      // FIX 9: If market odds strongly disagree (>15pp difference), penalize heavily
      if (homeProb >= 50) {
        const mktP = mktOdds?.homeWinProb ? parseFloat(mktOdds.homeWinProb) : null;
        const marketDisagree = mktP !== null && (homeProb / 100 - mktP) > 0.15;
        // FIX 6: HOME bonus +5 (HOME predictions hit at 62.4% vs AWAY 45.1%)
        allBets.push({
          ...baseBet,
          betType: '1X2_HOME',
          betLabel: BET_LABELS['1X2_HOME'],
          betValue: homeTeam.shortName || homeTeam.name,
          probability: homeProb,
          historicalAccuracy: accuracyMap.get(`${match.competitionId}_1X2`) || 50,
          marketOddsProb: mktP ? mktP * 100 : null,
          reliabilityScore: calcScore(homeProb, '1X2', mktP) + 5 + (marketDisagree ? -10 : 0),
          reasoning: `${homeTeam.shortName || homeTeam.name} favorita al ${homeProb.toFixed(0)}%${marketDisagree ? ' (mercato cauto)' : ''}`,
        });
      }

      if (awayProb >= 50) {
        const mktP = mktOdds?.awayWinProb ? parseFloat(mktOdds.awayWinProb) : null;
        const marketDisagree = mktP !== null && (awayProb / 100 - mktP) > 0.15;
        // FIX 6: AWAY penalty -5 (AWAY predictions hit at 45.1%)
        allBets.push({
          ...baseBet,
          betType: '1X2_AWAY',
          betLabel: BET_LABELS['1X2_AWAY'],
          betValue: awayTeam.shortName || awayTeam.name,
          probability: awayProb,
          historicalAccuracy: accuracyMap.get(`${match.competitionId}_1X2`) || 50,
          marketOddsProb: mktP ? mktP * 100 : null,
          reliabilityScore: calcScore(awayProb, '1X2', mktP) - 5 + (marketDisagree ? -10 : 0),
          reasoning: `${awayTeam.shortName || awayTeam.name} favorita al ${awayProb.toFixed(0)}%${marketDisagree ? ' (mercato cauto)' : ''}`,
        });
      }

      // FIX 3: DRAW predictions excluded — 23.1% hit rate is unacceptable for any schedina tier

      // Double Chance - high reliability
      // FIX 7: DC requires higher threshold (75%+) and opposing side must be weak (<20%)
      // Historical DC failures: 0-3, 3-1, 4-1 — the opponent won decisively,
      // meaning our model was wrong about the stronger side entirely.
      // Adding a check that the excluded outcome has low probability reduces these upsets.
      if (homeProb + drawProb >= 75 && homeProb < 60 && awayProb < 20) {
        const mktP = mktOdds?.homeWinProb ? parseFloat(mktOdds.homeWinProb) : null;
        const mktDrawP = mktOdds?.drawProb ? parseFloat(mktOdds.drawProb) : null;
        const marketDC1X = (mktP !== null && mktDrawP !== null) ? mktP + mktDrawP : null;
        allBets.push({
          ...baseBet,
          betType: 'DC_1X',
          betLabel: BET_LABELS['DC_1X'],
          betValue: `${homeTeam.shortName || homeTeam.name} o X`,
          probability: homeProb + drawProb,
          historicalAccuracy: (accuracyMap.get(`${match.competitionId}_1X2`) || 50) + 10,
          marketOddsProb: marketDC1X ? marketDC1X * 100 : null,
          reliabilityScore: calcScore(homeProb + drawProb, '1X2', marketDC1X) * 0.95,
          reasoning: `1X copre ${(homeProb + drawProb).toFixed(0)}% — avversario solo ${awayProb.toFixed(0)}%`,
        });
      }
      if (awayProb + drawProb >= 75 && awayProb < 60 && homeProb < 20) {
        const mktP = mktOdds?.awayWinProb ? parseFloat(mktOdds.awayWinProb) : null;
        const mktDrawP = mktOdds?.drawProb ? parseFloat(mktOdds.drawProb) : null;
        const marketDCX2 = (mktP !== null && mktDrawP !== null) ? mktP + mktDrawP : null;
        allBets.push({
          ...baseBet,
          betType: 'DC_X2',
          betLabel: BET_LABELS['DC_X2'],
          betValue: `X o ${awayTeam.shortName || awayTeam.name}`,
          probability: awayProb + drawProb,
          historicalAccuracy: (accuracyMap.get(`${match.competitionId}_1X2`) || 50) + 10,
          marketOddsProb: marketDCX2 ? marketDCX2 * 100 : null,
          reliabilityScore: calcScore(awayProb + drawProb, '1X2', marketDCX2) * 0.95,
          reasoning: `X2 copre ${(awayProb + drawProb).toFixed(0)}% — avversario solo ${homeProb.toFixed(0)}%`,
        });
      }

      // Over/Under 2.5
      const over25 = pred.over25Probability ? parseFloat(pred.over25Probability) : null;
      if (over25 !== null) {
        const mktP = mktOdds?.over25Prob ? parseFloat(mktOdds.over25Prob) : null;
        // FIX 8: Over 2.5 threshold raised from 60% to 68% — we lost 3x with 70-71% predictions (1-1 results)
        if (over25 >= 68) {
          allBets.push({
            ...baseBet,
            betType: 'OVER_25',
            betLabel: BET_LABELS['OVER_25'],
            betValue: 'Over 2.5',
            probability: over25,
            historicalAccuracy: accuracyMap.get(`${match.competitionId}_OVER_25`) || 55,
            marketOddsProb: mktP ? mktP * 100 : null,
            reliabilityScore: calcScore(over25, 'OVER_25', mktP),
            reasoning: `Alta probabilita di 3+ gol (${over25.toFixed(0)}%)`,
          });
        }
        if (over25 <= 40) {
          allBets.push({
            ...baseBet,
            betType: 'UNDER_25',
            betLabel: BET_LABELS['UNDER_25'],
            betValue: 'Under 2.5',
            probability: 100 - over25,
            historicalAccuracy: accuracyMap.get(`${match.competitionId}_OVER_25`) || 55,
            marketOddsProb: mktP ? (1 - mktP) * 100 : null,
            reliabilityScore: calcScore(100 - over25, 'OVER_25', mktP ? 1 - mktP : null),
            reasoning: `Partita da pochi gol (Under al ${(100 - over25).toFixed(0)}%)`,
          });
        }
      }

      // BTTS
      const bttsYes = pred.bttsYesProbability ? parseFloat(pred.bttsYesProbability) : null;
      if (bttsYes !== null) {
        const mktP = mktOdds?.bttsYesProb ? parseFloat(mktOdds.bttsYesProb) : null;
        if (bttsYes >= 60) {
          allBets.push({
            ...baseBet,
            betType: 'BTTS_YES',
            betLabel: BET_LABELS['BTTS_YES'],
            betValue: 'Goal',
            probability: bttsYes,
            historicalAccuracy: accuracyMap.get(`${match.competitionId}_BTTS`) || 55,
            marketOddsProb: mktP ? mktP * 100 : null,
            reliabilityScore: calcScore(bttsYes, 'BTTS', mktP),
            reasoning: `Entrambe le squadre segnano (${bttsYes.toFixed(0)}%)`,
          });
        }
        if (bttsYes <= 40) {
          allBets.push({
            ...baseBet,
            betType: 'BTTS_NO',
            betLabel: BET_LABELS['BTTS_NO'],
            betValue: 'No Goal',
            probability: 100 - bttsYes,
            historicalAccuracy: accuracyMap.get(`${match.competitionId}_BTTS`) || 55,
            marketOddsProb: mktP ? (1 - mktP) * 100 : null,
            reliabilityScore: calcScore(100 - bttsYes, 'BTTS', mktP ? 1 - mktP : null),
            reasoning: `Almeno una non segna (${(100 - bttsYes).toFixed(0)}%)`,
          });
        }
      }

      // Over 1.5 (safer bet)
      const over15 = pred.over15Probability ? parseFloat(pred.over15Probability) : null;
      if (over15 !== null && over15 >= 75) {
        allBets.push({
          ...baseBet,
          betType: 'OVER_15',
          betLabel: BET_LABELS['OVER_15'],
          betValue: 'Over 1.5',
          probability: over15,
          historicalAccuracy: 70, // Generally high
          marketOddsProb: null,
          reliabilityScore: calcScore(over15, 'OVER_25', null) * 0.9,
          reasoning: `Quasi certo 2+ gol (${over15.toFixed(0)}%)`,
        });
      }
    }

    // Sort by reliability score
    allBets.sort((a, b) => b.reliabilityScore - a.reliabilityScore);

    // Group by date
    const byDate: Record<string, SuggestedBet[]> = {};
    for (const bet of allBets) {
      const dateKey = new Date(bet.utcDate).toISOString().split('T')[0];
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(bet);
    }

    // Build 3 schedine per day: Sicura, Moderata, Rischiosa
    const schedine: Array<{
      date: string;
      type: 'safe' | 'moderate' | 'bold';
      label: string;
      emoji: string;
      description: string;
      bets: SuggestedBet[];
      combinedReliability: number;
      combinedProbability: number;
    }> = [];

    // Helper: pick diverse bets (different matches, mixed bet types)
    function pickDiverseBets(
      bets: SuggestedBet[],
      count: number,
      minScore: number
    ): SuggestedBet[] {
      const eligible = bets.filter(b => b.reliabilityScore >= minScore);
      const picked: SuggestedBet[] = [];
      const usedMatches = new Set<number>();
      const usedTypes = new Map<string, number>(); // betType -> count

      // Group bets by match, keeping all bet types
      const byMatch = new Map<number, SuggestedBet[]>();
      for (const b of eligible) {
        if (!byMatch.has(b.matchId)) byMatch.set(b.matchId, []);
        byMatch.get(b.matchId)!.push(b);
      }

      // Round-robin: for each match, pick the best bet that adds type diversity
      while (picked.length < count && usedMatches.size < byMatch.size) {
        let bestBet: SuggestedBet | null = null;
        let bestScore = -1;

        for (const [matchId, matchBets] of byMatch) {
          if (usedMatches.has(matchId)) continue;

          for (const bet of matchBets) {
            // Bonus for type diversity: prefer types we haven't used yet
            const typeCount = usedTypes.get(bet.betType) || 0;
            const diversityBonus = typeCount === 0 ? 15 : typeCount === 1 ? 5 : -5;
            const adjustedScore = bet.reliabilityScore + diversityBonus;

            if (adjustedScore > bestScore) {
              bestScore = adjustedScore;
              bestBet = bet;
            }
          }
        }

        if (!bestBet) break;
        picked.push(bestBet);
        usedMatches.add(bestBet.matchId);
        usedTypes.set(bestBet.betType, (usedTypes.get(bestBet.betType) || 0) + 1);
      }

      return picked;
    }

    for (const [date, bets] of Object.entries(byDate)) {
      const uniqueMatches = new Set(bets.map(b => b.matchId)).size;
      if (uniqueMatches < 2) continue;

      // SAFE: exactly 2 best bets (score >= 58) — fewer bets = higher combined probability
      const safeBets = pickDiverseBets(bets, 2, 58);
      if (safeBets.length >= 2) {
        const avgRel = safeBets.reduce((s, b) => s + b.reliabilityScore, 0) / safeBets.length;
        const combinedProb = safeBets.reduce((p, b) => p * (b.probability / 100), 1) * 100;
        const types = [...new Set(safeBets.map(b => b.betLabel))];
        schedine.push({
          date, type: 'safe',
          label: 'Schedina Sicura',
          emoji: '🛡️',
          description: `${safeBets.length} selezioni top: ${types.join(', ')}. Massima probabilita.`,
          bets: safeBets, combinedReliability: avgRel, combinedProbability: combinedProb,
        });
      }

      // MODERATE: 3-4 diverse bets (score >= 45)
      const modBets = pickDiverseBets(bets, 4, 45);
      if (modBets.length >= 3) {
        const avgRel = modBets.reduce((s, b) => s + b.reliabilityScore, 0) / modBets.length;
        const combinedProb = modBets.reduce((p, b) => p * (b.probability / 100), 1) * 100;
        const types = [...new Set(modBets.map(b => b.betLabel))];
        schedine.push({
          date, type: 'moderate',
          label: 'Schedina Bilanciata',
          emoji: '⚖️',
          description: `${modBets.length} selezioni mix: ${types.join(', ')}. Buon rapporto rischio/rendimento.`,
          bets: modBets, combinedReliability: avgRel, combinedProbability: combinedProb,
        });
      }

      // BOLD: 4-6 diverse bets (score >= 42) — raised from 35 to reduce 2-error schedine
      const boldBets = pickDiverseBets(bets, 6, 42);
      if (boldBets.length >= 4) {
        const avgRel = boldBets.reduce((s, b) => s + b.reliabilityScore, 0) / boldBets.length;
        const combinedProb = boldBets.reduce((p, b) => p * (b.probability / 100), 1) * 100;
        const types = [...new Set(boldBets.map(b => b.betLabel))];
        schedine.push({
          date, type: 'bold',
          label: 'Schedina Rischiosa',
          emoji: '🔥',
          description: `${boldBets.length} selezioni aggressive: ${types.join(', ')}. Quote alte, alto rischio.`,
          bets: boldBets, combinedReliability: avgRel, combinedProbability: combinedProb,
        });
      }
    }

    schedine.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const typeOrder = { safe: 0, moderate: 1, bold: 2 };
      return typeOrder[a.type] - typeOrder[b.type];
    });

    return NextResponse.json({
      topBets: allBets.slice(0, 30),
      schedine,
      totalBets: allBets.length,
    });
  } catch (error) {
    console.error('Error generating suggested bets:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate suggestions' } },
      { status: 500 }
    );
  }
}
