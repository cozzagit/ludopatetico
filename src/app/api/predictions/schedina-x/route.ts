import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, teams, competitions, predictions, marketOdds } from '@/src/lib/db/schema';
import { eq, gte, asc, and } from 'drizzle-orm';

// Competition draw tendency rates (from real historical data)
const COMP_DRAW_RATES: Record<string, number> = {
  'SB': 32,     // Serie B — highest draw rate
  'PL': 29,     // Premier League
  'BL1': 27,    // Bundesliga
  'SA': 24,     // Serie A
  'PD': 22,     // Primera Division
  'FL1': 22,    // Ligue 1
  'EL': 21,     // Europa League
  'ECL': 20,    // Conference League
  'CL': 17,     // Champions League
  'WCQ_EU': 16, // WC Qualifiers
};

interface DrawCandidate {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  competition: string;
  competitionCode: string;
  matchDate: string;
  bet: 'X';
  drawScore: number;
  drawProbability: number;
  over25Probability: number | null;
  bttsProbability: number | null;
  polymarketDrawProb: number | null;
  signals: string[];
}

interface SchedinaX {
  tier: 'X_SICURA' | 'X_BILANCIATA' | 'X_RISCHIOSA';
  label: string;
  description: string;
  bets: DrawCandidate[];
  combinedDrawProb: number;
}

export async function GET() {
  try {
    // Get upcoming matches with predictions (next 3 days)
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

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
        )
      )
      .orderBy(asc(matches.utcDate))
      .limit(200);

    // Filter to next 3 days
    const filtered = upcomingPreds.filter(r => new Date(r.match.utcDate) <= threeDaysFromNow);

    const allCandidates: DrawCandidate[] = [];

    for (const { prediction: pred, match } of filtered) {
      const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then(r => r[0]);
      const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then(r => r[0]);
      const comp = await db.select().from(competitions).where(eq(competitions.id, match.competitionId)).limit(1).then(r => r[0]);

      if (!homeTeam || !awayTeam || !comp) continue;

      // Get market odds (Polymarket)
      const mktOdds = await db.select().from(marketOdds).where(eq(marketOdds.matchId, match.id)).limit(1).then(r => r[0] ?? null);

      const homeWinProb = parseFloat(pred.homeWinProbability);
      const drawProb = parseFloat(pred.drawProbability);
      const awayWinProb = parseFloat(pred.awayWinProbability);
      const over25Prob = pred.over25Probability ? parseFloat(pred.over25Probability) : null;
      const bttsProb = pred.bttsYesProbability ? parseFloat(pred.bttsYesProbability) : null;
      const polymarketDrawProb = mktOdds?.drawProb ? parseFloat(mktOdds.drawProb) * 100 : null;

      const signals: string[] = [];

      // === DRAW SCORING ALGORITHM ===
      let drawScore = 0;

      // 1. Competition draw tendency
      const compDrawRate = COMP_DRAW_RATES[comp.code] || 20;
      drawScore += compDrawRate;
      if (compDrawRate >= 25) {
        signals.push(`${comp.name} (${compDrawRate}% tasso pareggi)`);
      }

      // 2. Balance between teams (closer = more draws)
      const gap = Math.abs(homeWinProb - awayWinProb);
      if (gap < 8) {
        drawScore += 25;
        signals.push(`Squadre equilibrate (gap ${gap.toFixed(0)}%)`);
      } else if (gap < 15) {
        drawScore += 15;
        signals.push(`Abbastanza equilibrate (gap ${gap.toFixed(0)}%)`);
      } else if (gap < 25) {
        drawScore += 5;
      }
      // gap > 25 = clear favorite, no bonus

      // 3. Under-leaning matches draw more
      if (over25Prob !== null) {
        if (over25Prob < 40) {
          drawScore += 15;
          signals.push(`Partita chiusa (Over 2.5 al ${over25Prob.toFixed(0)}%)`);
        } else if (over25Prob < 50) {
          drawScore += 8;
          signals.push(`Tendenza Under (Over 2.5 al ${over25Prob.toFixed(0)}%)`);
        }
      }

      // 4. AI draw probability in the sweet spot
      if (drawProb >= 25 && drawProb <= 32) {
        drawScore += 12;
        signals.push(`Draw prob nel sweet spot (${drawProb.toFixed(1)}%)`);
      } else if (drawProb >= 20 && drawProb < 25) {
        drawScore += 5;
      } else if (drawProb > 32) {
        drawScore += 8;
        signals.push(`Draw prob alta (${drawProb.toFixed(1)}%)`);
      }

      // 5. Polymarket agreement
      if (polymarketDrawProb !== null && polymarketDrawProb > 25) {
        drawScore += 10;
        signals.push(`Polymarket concorda (X al ${polymarketDrawProb.toFixed(0)}%)`);
      }

      // 6. Both teams have moderate BTTS (40-60% = defensive but not shut-out)
      if (bttsProb !== null && bttsProb >= 35 && bttsProb <= 60) {
        drawScore += 5;
        signals.push(`BTTS moderato (${bttsProb.toFixed(0)}%)`);
      }

      allCandidates.push({
        matchId: match.id,
        homeTeam: homeTeam.shortName || homeTeam.name,
        awayTeam: awayTeam.shortName || awayTeam.name,
        homeTeamCrest: homeTeam.crest,
        awayTeamCrest: awayTeam.crest,
        competition: comp.name,
        competitionCode: comp.code,
        matchDate: match.utcDate.toISOString(),
        bet: 'X',
        drawScore,
        drawProbability: drawProb,
        over25Probability: over25Prob,
        bttsProbability: bttsProb,
        polymarketDrawProb,
        signals,
      });
    }

    // Sort by drawScore descending
    allCandidates.sort((a, b) => b.drawScore - a.drawScore);

    // Build the 3 schedine
    const schedineX: SchedinaX[] = [];

    // Helper: pick candidates with league diversity
    function pickDiverse(
      candidates: DrawCandidate[],
      minScore: number,
      minPicks: number,
      maxPicks: number,
    ): DrawCandidate[] {
      const eligible = candidates.filter(c => c.drawScore >= minScore);
      const picked: DrawCandidate[] = [];
      const usedCompetitions = new Map<string, number>(); // code -> count

      for (const candidate of eligible) {
        if (picked.length >= maxPicks) break;

        // Prefer league diversity: skip if we already have 2 from this competition
        const compCount = usedCompetitions.get(candidate.competitionCode) || 0;
        if (compCount >= 2 && picked.length < eligible.length - 1) continue;

        picked.push(candidate);
        usedCompetitions.set(candidate.competitionCode, compCount + 1);
      }

      // If diversity filtering was too aggressive, fill up from remaining
      if (picked.length < minPicks) {
        for (const candidate of eligible) {
          if (picked.length >= maxPicks) break;
          if (picked.some(p => p.matchId === candidate.matchId)) continue;
          picked.push(candidate);
        }
      }

      return picked.length >= minPicks ? picked : [];
    }

    // X SICURA: 2-3 picks, drawScore >= 70
    const sicuraPicks = pickDiverse(allCandidates, 70, 2, 3);
    if (sicuraPicks.length >= 2) {
      const combinedDrawProb = sicuraPicks.reduce(
        (acc, p) => acc * (p.drawProbability / 100), 1
      ) * 100;
      schedineX.push({
        tier: 'X_SICURA',
        label: 'X Sicura',
        description: `${sicuraPicks.length} pareggi ad alta probabilita statistica`,
        bets: sicuraPicks,
        combinedDrawProb: Math.round(combinedDrawProb * 100) / 100,
      });
    }

    // X BILANCIATA: 3-4 picks, drawScore >= 55
    const bilanciataPicks = pickDiverse(allCandidates, 55, 3, 4);
    if (bilanciataPicks.length >= 3) {
      const combinedDrawProb = bilanciataPicks.reduce(
        (acc, p) => acc * (p.drawProbability / 100), 1
      ) * 100;
      schedineX.push({
        tier: 'X_BILANCIATA',
        label: 'X Bilanciata',
        description: `${bilanciataPicks.length} pareggi con buoni segnali statistici`,
        bets: bilanciataPicks,
        combinedDrawProb: Math.round(combinedDrawProb * 100) / 100,
      });
    }

    // X RISCHIOSA: 4-5 picks, drawScore >= 40
    const rischiosaPicks = pickDiverse(allCandidates, 40, 4, 5);
    if (rischiosaPicks.length >= 4) {
      const combinedDrawProb = rischiosaPicks.reduce(
        (acc, p) => acc * (p.drawProbability / 100), 1
      ) * 100;
      schedineX.push({
        tier: 'X_RISCHIOSA',
        label: 'X Rischiosa',
        description: `${rischiosaPicks.length} pareggi per quote alte`,
        bets: rischiosaPicks,
        combinedDrawProb: Math.round(combinedDrawProb * 100) / 100,
      });
    }

    // Stats
    const matchesWithSignal = allCandidates.filter(c => c.drawScore >= 40).length;
    const averageDrawScore = allCandidates.length > 0
      ? Math.round(allCandidates.reduce((s, c) => s + c.drawScore, 0) / allCandidates.length)
      : 0;

    return NextResponse.json({
      schedineX,
      stats: {
        totalMatchesAnalyzed: allCandidates.length,
        matchesWithDrawSignal: matchesWithSignal,
        averageDrawScore,
      },
    });
  } catch (error) {
    console.error('Error generating Schedina X:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate Schedina X' } },
      { status: 500 }
    );
  }
}
