import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { savedSchedine, matches } from '@/src/lib/db/schema';
import { eq, or, isNull, gt, inArray } from 'drizzle-orm';

interface BetResult {
  matchId: number;
  correct: boolean | null; // null = pending
  actualResult: string | null; // e.g. "HOME_TEAM", "DRAW", "AWAY_TEAM" or score
  matchStatus: string;
  homeScore: number | null;
  awayScore: number | null;
}

/**
 * Check if a standard bet was correct based on match result.
 */
function checkBetResult(
  betType: string,
  homeScore: number,
  awayScore: number,
  winner: string | null
): boolean {
  const totalGoals = homeScore + awayScore;
  const isDraw = homeScore === awayScore;

  switch (betType) {
    case '1X2_HOME':
      return winner === 'HOME_TEAM';
    case '1X2_DRAW':
    case 'X':
      return isDraw;
    case '1X2_AWAY':
      return winner === 'AWAY_TEAM';
    case 'OVER_15':
      return totalGoals > 1;
    case 'OVER_25':
      return totalGoals > 2;
    case 'OVER_35':
      return totalGoals > 3;
    case 'UNDER_25':
      return totalGoals < 3;
    case 'BTTS_YES':
      return homeScore > 0 && awayScore > 0;
    case 'BTTS_NO':
      return homeScore === 0 || awayScore === 0;
    case 'DC_1X':
      return winner === 'HOME_TEAM' || isDraw;
    case 'DC_X2':
      return winner === 'AWAY_TEAM' || isDraw;
    case 'DC_12':
      return winner === 'HOME_TEAM' || winner === 'AWAY_TEAM';
    default:
      return false;
  }
}

export async function POST() {
  try {
    // Get all schedine that need checking (never checked or still have pending bets)
    const pendingSchedine = await db
      .select()
      .from(savedSchedine)
      .where(
        or(
          isNull(savedSchedine.checkedAt),
          gt(savedSchedine.pendingBets, 0)
        )
      );

    if (pendingSchedine.length === 0) {
      return NextResponse.json({
        checked: 0,
        message: 'No pending schedine to check',
      });
    }

    let checkedCount = 0;
    let updatedCount = 0;

    // Collect all unique matchIds we need to check
    const allMatchIds = new Set<number>();
    for (const schedina of pendingSchedine) {
      const bets = schedina.bets as Array<{ matchId: number }>;
      for (const bet of bets) {
        allMatchIds.add(bet.matchId);
      }
    }

    // Batch-fetch all needed matches in a single query
    const allMatchIdArray = [...allMatchIds];
    const allMatchRows = allMatchIdArray.length > 0
      ? await db.select().from(matches).where(inArray(matches.id, allMatchIdArray))
      : [];
    const matchMap = new Map<number, typeof matches.$inferSelect>(
      allMatchRows.map(m => [m.id, m])
    );

    // Check each schedina
    for (const schedina of pendingSchedine) {
      const bets = schedina.bets as Array<{
        matchId: number;
        betType: string;
        bet?: string; // For X bets, the field is "bet" = "X"
        homeTeam: string;
        awayTeam: string;
      }>;

      const betResults: BetResult[] = [];
      let correct = 0;
      let wrong = 0;
      let pending = 0;

      for (const bet of bets) {
        const match = matchMap.get(bet.matchId);

        if (!match || match.status !== 'FINISHED') {
          // Match not finished yet
          betResults.push({
            matchId: bet.matchId,
            correct: null,
            actualResult: match?.status || 'UNKNOWN',
            matchStatus: match?.status || 'UNKNOWN',
            homeScore: match?.homeScore ?? null,
            awayScore: match?.awayScore ?? null,
          });
          pending++;
          continue;
        }

        const homeScore = match.homeScore ?? 0;
        const awayScore = match.awayScore ?? 0;
        const winner = match.winner;

        // Determine bet type — standard bets use "betType", X bets use "bet" field
        const betType = bet.betType || bet.bet || 'X';
        const isCorrect = checkBetResult(betType, homeScore, awayScore, winner);

        betResults.push({
          matchId: bet.matchId,
          correct: isCorrect,
          actualResult: `${homeScore}-${awayScore} (${winner || 'DRAW'})`,
          matchStatus: 'FINISHED',
          homeScore,
          awayScore,
        });

        if (isCorrect) {
          correct++;
        } else {
          wrong++;
        }
      }

      // Determine overall win: all bets must be correct AND no pending
      const isWin = pending === 0 && wrong === 0 && correct > 0;

      await db
        .update(savedSchedine)
        .set({
          checkedAt: new Date(),
          correctBets: correct,
          wrongBets: wrong,
          pendingBets: pending,
          isWin: pending > 0 ? null : isWin,
          betResults,
        })
        .where(eq(savedSchedine.id, schedina.id));

      checkedCount++;
      if (correct > 0 || wrong > 0) {
        updatedCount++;
      }
    }

    return NextResponse.json({
      checked: checkedCount,
      updated: updatedCount,
      message: `Checked ${checkedCount} schedine, ${updatedCount} had result updates`,
    });
  } catch (error) {
    console.error('Error checking schedine results:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to check results' } },
      { status: 500 }
    );
  }
}
