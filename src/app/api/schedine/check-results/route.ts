import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { savedSchedine, matches, teams } from '@/src/lib/db/schema';
import { eq, or, isNull, gt, inArray } from 'drizzle-orm';
import { footballDataService } from '@/src/lib/services/football-data';
import { apiFootballService } from '@/src/lib/services/api-football';
import { COMP_CODE_MAP, API_FOOTBALL_LEAGUES } from '@/src/lib/constants';
import { learningSystem } from '@/src/lib/services/learning-system';

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

    // === STEP 1: Sync match results from external APIs ===
    // Find which competitions need syncing (matches that are not FINISHED yet)
    const allMatchIdArray = [...allMatchIds];
    const preCheckRows = allMatchIdArray.length > 0
      ? await db.select().from(matches).where(inArray(matches.id, allMatchIdArray))
      : [];

    // Collect competitions with unfinished matches that started 2+ hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const competitionsToSync = new Set<number>();
    for (const match of preCheckRows) {
      if (match.status !== 'FINISHED' && new Date(match.utcDate) < twoHoursAgo) {
        competitionsToSync.add(match.competitionId);
      }
    }

    // Sync each competition's results
    const footballDataComps = ['SA', 'PL', 'BL1', 'FL1', 'PD', 'CL'];
    for (const compId of competitionsToSync) {
      try {
        const compCode = COMP_CODE_MAP[compId];
        if (compCode && footballDataComps.includes(compCode)) {
          await footballDataService.syncFinishedMatches(compCode, 14);
        } else if (compId === 136) {
          // Serie B via API-Football
          const twoWeeksAgo = new Date();
          twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
          const today = new Date();
          const { matches: apiMatches, teams: apiTeams } = await apiFootballService.getFixtures(
            API_FOOTBALL_LEAGUES.SERIE_B,
            twoWeeksAgo.toISOString().split('T')[0],
            today.toISOString().split('T')[0],
            2025
          );
          for (const team of apiTeams) {
            await db.insert(teams).values(team).onConflictDoUpdate({
              target: teams.id,
              set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
            });
          }
          for (const m of apiMatches) {
            await db.insert(matches).values(m).onConflictDoUpdate({
              target: matches.id,
              set: { ...m, lastUpdated: new Date() },
            });
          }
        } else if (compId === 2 || compId === 848) {
          // Europa League / Conference League via API-Football
          const leagueId = compId === 2 ? API_FOOTBALL_LEAGUES.EUROPA_LEAGUE : API_FOOTBALL_LEAGUES.CONFERENCE_LEAGUE;
          const twoWeeksAgo = new Date();
          twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
          const today = new Date();
          const { matches: apiMatches, teams: apiTeams } = await apiFootballService.getFixtures(
            leagueId,
            twoWeeksAgo.toISOString().split('T')[0],
            today.toISOString().split('T')[0],
            2025
          );
          for (const team of apiTeams) {
            await db.insert(teams).values(team).onConflictDoUpdate({
              target: teams.id,
              set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
            });
          }
          for (const m of apiMatches) {
            await db.insert(matches).values(m).onConflictDoUpdate({
              target: matches.id,
              set: { ...m, lastUpdated: new Date() },
            });
          }
        } else if (compId === 32) {
          // WC Qualifiers Europe via API-Football
          const twoWeeksAgo = new Date();
          twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
          const today = new Date();
          const { matches: apiMatches, teams: apiTeams } = await apiFootballService.getFixtures(
            API_FOOTBALL_LEAGUES.WC_QUALIFICATION_EUROPE,
            twoWeeksAgo.toISOString().split('T')[0],
            today.toISOString().split('T')[0],
            2024
          );
          for (const team of apiTeams) {
            await db.insert(teams).values(team).onConflictDoUpdate({
              target: teams.id,
              set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
            });
          }
          for (const m of apiMatches) {
            await db.insert(matches).values(m).onConflictDoUpdate({
              target: matches.id,
              set: { ...m, lastUpdated: new Date() },
            });
          }
        }
      } catch (error) {
        console.error(`Error syncing competition ${compId} for schedine check:`, error);
      }
    }

    // === STEP 2: Fetch updated matches and verify schedine ===
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

      // Near-miss learning: if exactly 1 bet was wrong (quasi_vinta),
      // apply extra learning penalty to the failing bet type + competition
      if (pending === 0 && wrong === 1 && correct >= 2) {
        const wrongBetData: Array<{
          betType: string;
          competitionId: number;
          homeTeamId: number;
          awayTeamId: number;
          probability: number;
        }> = [];

        for (let bi = 0; bi < bets.length; bi++) {
          if (betResults[bi]?.correct === false) {
            const bet = bets[bi];
            const match = matchMap.get(bet.matchId);
            if (match) {
              wrongBetData.push({
                betType: bet.betType || bet.bet || 'X',
                competitionId: match.competitionId,
                homeTeamId: match.homeTeamId,
                awayTeamId: match.awayTeamId,
                probability: (bet as Record<string, unknown>).probability as number || 50,
              });
            }
          }
        }

        if (wrongBetData.length > 0) {
          try {
            await learningSystem.learnFromNearMiss(wrongBetData);
          } catch (e) {
            console.error('Near-miss learning error:', e);
          }
        }
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
