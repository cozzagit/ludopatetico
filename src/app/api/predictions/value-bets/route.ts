import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, teams, competitions, predictions, marketOdds } from '@/src/lib/db/schema';
import { eq, gte, and, isNotNull } from 'drizzle-orm';

interface ValueBet {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  competition: string;
  competitionCode: string;
  utcDate: string;
  marketType: string;
  marketLabel: string;
  aiProbability: number;
  polymarketProbability: number;
  edge: number;
  absEdge: number;
  direction: 'VALUE' | 'CAUTION';
  signalStrength: 'low' | 'medium' | 'high';
}

const MARKET_LABELS: Record<string, string> = {
  '1X2_HOME': 'Vittoria Casa (1)',
  '1X2_AWAY': 'Vittoria Trasferta (2)',
  'OVER_25': 'Over 2.5 Gol',
  'BTTS_YES': 'GG (Goal)',
};

function getSignalStrength(absEdge: number): 'low' | 'medium' | 'high' {
  if (absEdge >= 18) return 'high';
  if (absEdge >= 12) return 'medium';
  return 'low';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const minEdge = parseFloat(searchParams.get('minEdge') || '8');

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch upcoming matches with predictions that have market odds
    const rows = await db
      .select({
        prediction: predictions,
        match: matches,
        mktOdds: marketOdds,
      })
      .from(predictions)
      .innerJoin(matches, eq(predictions.matchId, matches.id))
      .innerJoin(marketOdds, eq(marketOdds.matchId, matches.id))
      .where(
        and(
          gte(matches.utcDate, now),
          isNotNull(marketOdds.homeWinProb)
        )
      )
      .limit(300);

    // Filter to next 7 days
    const filtered = rows.filter(r => new Date(r.match.utcDate) <= weekFromNow);

    const allValueBets: ValueBet[] = [];

    for (const { prediction: pred, match, mktOdds: mkt } of filtered) {
      // Get team and competition info
      const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then(r => r[0]);
      const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then(r => r[0]);
      const comp = await db.select().from(competitions).where(eq(competitions.id, match.competitionId)).limit(1).then(r => r[0]);

      if (!homeTeam || !awayTeam || !comp) continue;

      const baseBet = {
        matchId: match.id,
        homeTeam: homeTeam.shortName || homeTeam.name,
        awayTeam: awayTeam.shortName || awayTeam.name,
        homeTeamCrest: homeTeam.crest,
        awayTeamCrest: awayTeam.crest,
        competition: comp.name,
        competitionCode: comp.code,
        utcDate: match.utcDate.toISOString(),
      };

      // 1X2 HOME
      if (mkt.homeWinProb) {
        const aiProb = parseFloat(pred.homeWinProbability);
        const mktProb = parseFloat(mkt.homeWinProb) * 100;
        const edge = aiProb - mktProb;
        const absEdge = Math.abs(edge);

        if (absEdge >= minEdge) {
          allValueBets.push({
            ...baseBet,
            marketType: '1X2_HOME',
            marketLabel: MARKET_LABELS['1X2_HOME'],
            aiProbability: aiProb,
            polymarketProbability: mktProb,
            edge,
            absEdge,
            direction: edge > 0 ? 'VALUE' : 'CAUTION',
            signalStrength: getSignalStrength(absEdge),
          });
        }
      }

      // 1X2 AWAY
      if (mkt.awayWinProb) {
        const aiProb = parseFloat(pred.awayWinProbability);
        const mktProb = parseFloat(mkt.awayWinProb) * 100;
        const edge = aiProb - mktProb;
        const absEdge = Math.abs(edge);

        if (absEdge >= minEdge) {
          allValueBets.push({
            ...baseBet,
            marketType: '1X2_AWAY',
            marketLabel: MARKET_LABELS['1X2_AWAY'],
            aiProbability: aiProb,
            polymarketProbability: mktProb,
            edge,
            absEdge,
            direction: edge > 0 ? 'VALUE' : 'CAUTION',
            signalStrength: getSignalStrength(absEdge),
          });
        }
      }

      // OVER 2.5
      if (pred.over25Probability && mkt.over25Prob) {
        const aiProb = parseFloat(pred.over25Probability);
        const mktProb = parseFloat(mkt.over25Prob) * 100;
        const edge = aiProb - mktProb;
        const absEdge = Math.abs(edge);

        if (absEdge >= minEdge) {
          allValueBets.push({
            ...baseBet,
            marketType: 'OVER_25',
            marketLabel: MARKET_LABELS['OVER_25'],
            aiProbability: aiProb,
            polymarketProbability: mktProb,
            edge,
            absEdge,
            direction: edge > 0 ? 'VALUE' : 'CAUTION',
            signalStrength: getSignalStrength(absEdge),
          });
        }
      }

      // BTTS YES
      if (pred.bttsYesProbability && mkt.bttsYesProb) {
        const aiProb = parseFloat(pred.bttsYesProbability);
        const mktProb = parseFloat(mkt.bttsYesProb) * 100;
        const edge = aiProb - mktProb;
        const absEdge = Math.abs(edge);

        if (absEdge >= minEdge) {
          allValueBets.push({
            ...baseBet,
            marketType: 'BTTS_YES',
            marketLabel: MARKET_LABELS['BTTS_YES'],
            aiProbability: aiProb,
            polymarketProbability: mktProb,
            edge,
            absEdge,
            direction: edge > 0 ? 'VALUE' : 'CAUTION',
            signalStrength: getSignalStrength(absEdge),
          });
        }
      }
    }

    // Sort by absolute edge descending
    allValueBets.sort((a, b) => b.absEdge - a.absEdge);

    return NextResponse.json({
      valueBets: allValueBets,
      total: allValueBets.length,
      minEdge,
    });
  } catch (error) {
    console.error('Error finding value bets:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Errore nel calcolo delle value bets' } },
      { status: 500 }
    );
  }
}
