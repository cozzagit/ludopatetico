import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, teams } from '@/src/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

interface TeamStreak {
  teamId: number;
  teamName: string;
  teamCrest: string | null;
  winStreak: number;
  drawStreak: number;
  lossStreak: number;
  over25Rate: number;
  bttsRate: number;
  cleanSheetRate: number;
  scoringRate: number;
  matchesAnalyzed: number;
  isSignificant: boolean;
}

function calculateStreaks(
  teamId: number,
  teamName: string,
  teamCrest: string | null,
  recentMatches: Array<{
    homeTeamId: number;
    awayTeamId: number;
    homeScore: number | null;
    awayScore: number | null;
    winner: string | null;
  }>
): TeamStreak {
  let winStreak = 0;
  let drawStreak = 0;
  let lossStreak = 0;
  let over25Count = 0;
  let bttsCount = 0;
  let cleanSheetCount = 0;
  let scoringCount = 0;

  const total = recentMatches.length;

  // Calculate consecutive streaks from most recent
  let winStreakActive = true;
  let drawStreakActive = true;
  let lossStreakActive = true;

  for (const m of recentMatches) {
    if (m.homeScore === null || m.awayScore === null) continue;

    const isHome = m.homeTeamId === teamId;
    const teamGoals = isHome ? m.homeScore : m.awayScore;
    const oppGoals = isHome ? m.awayScore : m.homeScore;
    const totalGoals = m.homeScore + m.awayScore;

    // Determine result
    const isWin = (isHome && m.winner === 'HOME_TEAM') || (!isHome && m.winner === 'AWAY_TEAM');
    const isDraw = m.winner === 'DRAW';
    const isLoss = !isWin && !isDraw;

    // Streaks (consecutive from most recent)
    if (winStreakActive && isWin) winStreak++;
    else winStreakActive = false;

    if (drawStreakActive && isDraw) drawStreak++;
    else drawStreakActive = false;

    if (lossStreakActive && isLoss) lossStreak++;
    else lossStreakActive = false;

    // Rates
    if (totalGoals > 2) over25Count++;
    if (m.homeScore > 0 && m.awayScore > 0) bttsCount++;
    if (oppGoals === 0) cleanSheetCount++;
    if (teamGoals > 0) scoringCount++;
  }

  const over25Rate = total > 0 ? (over25Count / total) * 100 : 0;
  const bttsRate = total > 0 ? (bttsCount / total) * 100 : 0;
  const cleanSheetRate = total > 0 ? (cleanSheetCount / total) * 100 : 0;
  const scoringRate = total > 0 ? (scoringCount / total) * 100 : 0;

  const isSignificant =
    winStreak >= 3 ||
    drawStreak >= 2 ||
    lossStreak >= 3 ||
    over25Rate >= 70 ||
    bttsRate >= 70;

  return {
    teamId,
    teamName,
    teamCrest,
    winStreak,
    drawStreak,
    lossStreak,
    over25Rate,
    bttsRate,
    cleanSheetRate,
    scoringRate,
    matchesAnalyzed: total,
    isSignificant,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamIdParam = searchParams.get('teamId');

    if (teamIdParam) {
      // Single team mode
      const teamId = parseInt(teamIdParam, 10);
      if (isNaN(teamId)) {
        return NextResponse.json(
          { error: { code: 'INVALID_PARAM', message: 'teamId deve essere un numero' } },
          { status: 400 }
        );
      }

      const team = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1).then(r => r[0]);
      if (!team) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Squadra non trovata' } },
          { status: 404 }
        );
      }

      const recentMatches = await db
        .select({
          homeTeamId: matches.homeTeamId,
          awayTeamId: matches.awayTeamId,
          homeScore: matches.homeScore,
          awayScore: matches.awayScore,
          winner: matches.winner,
        })
        .from(matches)
        .where(
          sql`${matches.status} = 'FINISHED' AND (${matches.homeTeamId} = ${teamId} OR ${matches.awayTeamId} = ${teamId})`
        )
        .orderBy(desc(matches.utcDate))
        .limit(10);

      if (recentMatches.length < 3) {
        return NextResponse.json({
          streak: null,
          message: 'Dati insufficienti (meno di 3 partite concluse)',
        });
      }

      const streak = calculateStreaks(teamId, team.shortName || team.name, team.crest, recentMatches);
      return NextResponse.json({ streak });
    }

    // All significant streaks mode — get teams with recent FINISHED matches
    // Get all distinct teams from recent finished matches
    const recentTeamIds = await db
      .select({ teamId: matches.homeTeamId })
      .from(matches)
      .where(eq(matches.status, 'FINISHED'))
      .orderBy(desc(matches.utcDate))
      .limit(200)
      .then(rows => {
        const ids = new Set<number>();
        rows.forEach(r => ids.add(r.teamId));
        return [...ids];
      });

    // Also get away team IDs
    const awayTeamIds = await db
      .select({ teamId: matches.awayTeamId })
      .from(matches)
      .where(eq(matches.status, 'FINISHED'))
      .orderBy(desc(matches.utcDate))
      .limit(200)
      .then(rows => {
        const ids = new Set<number>();
        rows.forEach(r => ids.add(r.teamId));
        return [...ids];
      });

    const allTeamIds = [...new Set([...recentTeamIds, ...awayTeamIds])];

    const allStreaks: TeamStreak[] = [];

    for (const teamId of allTeamIds) {
      const team = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1).then(r => r[0]);
      if (!team) continue;

      const recentMatches = await db
        .select({
          homeTeamId: matches.homeTeamId,
          awayTeamId: matches.awayTeamId,
          homeScore: matches.homeScore,
          awayScore: matches.awayScore,
          winner: matches.winner,
        })
        .from(matches)
        .where(
          sql`${matches.status} = 'FINISHED' AND (${matches.homeTeamId} = ${teamId} OR ${matches.awayTeamId} = ${teamId})`
        )
        .orderBy(desc(matches.utcDate))
        .limit(10);

      if (recentMatches.length < 5) continue;

      const streak = calculateStreaks(teamId, team.shortName || team.name, team.crest, recentMatches);
      if (streak.isSignificant) {
        allStreaks.push(streak);
      }
    }

    // Sort by significance: highest streak first, then rates
    allStreaks.sort((a, b) => {
      const aScore = Math.max(a.winStreak * 3, a.lossStreak * 3, a.drawStreak * 4) + a.over25Rate / 10 + a.bttsRate / 10;
      const bScore = Math.max(b.winStreak * 3, b.lossStreak * 3, b.drawStreak * 4) + b.over25Rate / 10 + b.bttsRate / 10;
      return bScore - aScore;
    });

    return NextResponse.json({
      streaks: allStreaks,
      total: allStreaks.length,
    });
  } catch (error) {
    console.error('Error calculating team streaks:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Errore nel calcolo degli streak' } },
      { status: 500 }
    );
  }
}
