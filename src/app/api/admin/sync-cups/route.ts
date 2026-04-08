import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { teams, matches } from '@/src/lib/db/schema';
import { auth } from '@/src/lib/auth';
import { apiFootballService } from '@/src/lib/services/api-football';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).isAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    console.log('Starting European cups sync via API-Football...');

    const results: Array<{ competition: string; status: string; matches?: number; error?: string }> = [];
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    // Include a few days back
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - 2);
    const from = fromDate.toISOString().split('T')[0];
    const to = nextMonth.toISOString().split('T')[0];

    // Football season: Aug-Dec = current year, Jan-Jul = previous year
    const season = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;

    // Sync Europa League (API-Football ID: 3, DB ID: 2)
    try {
      console.log('Syncing Europa League (API-Football ID: 3)...');
      const europaData = await apiFootballService.getFixtures(3, from, to, season);

      for (const team of europaData.teams) {
        await db.insert(teams).values(team).onConflictDoUpdate({
          target: teams.id,
          set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
        });
      }

      for (const match of europaData.matches) {
        await db.insert(matches).values({ ...match, competitionId: 2 }).onConflictDoUpdate({
          target: matches.id,
          set: { ...match, competitionId: 2, lastUpdated: new Date() },
        });
      }

      console.log(`Europa League synced: ${europaData.matches.length} matches`);
      results.push({ competition: 'Europa League', status: 'synced', matches: europaData.matches.length });
    } catch (error) {
      console.error('Europa League sync failed:', error);
      results.push({ competition: 'Europa League', status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' });
    }

    // Sync Conference League (API-Football ID: 848, DB ID: 848)
    try {
      console.log('Syncing Conference League (API-Football ID: 848)...');
      const confData = await apiFootballService.getFixtures(848, from, to, season);

      for (const team of confData.teams) {
        await db.insert(teams).values(team).onConflictDoUpdate({
          target: teams.id,
          set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
        });
      }

      for (const match of confData.matches) {
        await db.insert(matches).values({ ...match, competitionId: 848 }).onConflictDoUpdate({
          target: matches.id,
          set: { ...match, competitionId: 848, lastUpdated: new Date() },
        });
      }

      console.log(`Conference League synced: ${confData.matches.length} matches`);
      results.push({ competition: 'Conference League', status: 'synced', matches: confData.matches.length });
    } catch (error) {
      console.error('Conference League sync failed:', error);
      results.push({ competition: 'Conference League', status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' });
    }

    const successCount = results.filter((r) => r.status === 'synced').length;
    const totalMatches = results.reduce((sum, r) => sum + (r.matches || 0), 0);

    return NextResponse.json({
      message: `Coppe europee sincronizzate: ${successCount}/2, ${totalMatches} partite totali`,
      results,
    });
  } catch (error) {
    console.error('Error syncing cups:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Errore sincronizzazione coppe', details: error instanceof Error ? error.message : 'Unknown error' } },
      { status: 500 }
    );
  }
}
