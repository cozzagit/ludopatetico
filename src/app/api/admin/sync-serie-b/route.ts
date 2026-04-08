import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { teams, matches, standings } from '@/src/lib/db/schema';
import { auth } from '@/src/lib/auth';
import { apiFootballService } from '@/src/lib/services/api-football';
import { API_FOOTBALL_LEAGUES } from '@/src/lib/constants';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).isAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    console.log('Starting Serie B sync via API-Football...');

    const today = new Date();
    const nextTwoMonths = new Date(today);
    nextTwoMonths.setMonth(nextTwoMonths.getMonth() + 2);

    const from = today.toISOString().split('T')[0];
    const to = nextTwoMonths.toISOString().split('T')[0];
    const season = 2025; // Serie B 2025/26 season

    console.log(`Syncing Serie B (API-Football ID: ${API_FOOTBALL_LEAGUES.SERIE_B})...`);
    const serieBData = await apiFootballService.getFixtures(
      API_FOOTBALL_LEAGUES.SERIE_B,
      from,
      to,
      season
    );

    // Insert teams
    for (const team of serieBData.teams) {
      await db.insert(teams).values(team).onConflictDoUpdate({
        target: teams.id,
        set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
      });
    }

    // Insert matches
    for (const match of serieBData.matches) {
      await db.insert(matches).values(match).onConflictDoUpdate({
        target: matches.id,
        set: { ...match, lastUpdated: new Date() },
      });
    }

    console.log(`Serie B synced: ${serieBData.matches.length} matches, ${serieBData.teams.length} teams`);

    // Try to sync standings
    let standingsCount = 0;
    try {
      const standingsData = await apiFootballService.getStandings(API_FOOTBALL_LEAGUES.SERIE_B, season);

      if (standingsData && standingsData.length > 0) {
        for (const standing of standingsData) {
          await db.insert(standings).values({
            competitionId: 136,
            season: season,
            teamId: standing.team.id,
            position: standing.rank,
            playedGames: standing.all.played,
            won: standing.all.win,
            draw: standing.all.draw,
            lost: standing.all.lose,
            points: standing.points,
            goalsFor: standing.all.goals.for,
            goalsAgainst: standing.all.goals.against,
            goalDifference: standing.goalsDiff,
          }).onConflictDoNothing();
        }
        standingsCount = standingsData.length;
        console.log(`Serie B standings synced: ${standingsCount} teams`);
      }
    } catch (standingsError) {
      console.warn('Serie B standings sync failed (non-critical):', standingsError);
    }

    return NextResponse.json({
      message: `Serie B sincronizzata: ${serieBData.matches.length} partite, ${serieBData.teams.length} squadre${standingsCount > 0 ? `, ${standingsCount} posizioni in classifica` : ''}`,
      matches: serieBData.matches.length,
      teams: serieBData.teams.length,
      standings: standingsCount,
    });
  } catch (error) {
    console.error('Error syncing Serie B:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Errore sincronizzazione Serie B', details: error instanceof Error ? error.message : 'Unknown error' } },
      { status: 500 }
    );
  }
}
