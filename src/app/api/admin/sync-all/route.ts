import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { teams, matches, competitions } from '@/src/lib/db/schema';
import { SERIE_B_TEAMS, PROTECTED_TEAM_IDS } from '@/src/lib/constants';
import { eq } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
import { footballDataService } from '@/src/lib/services/football-data';
import { apiFootballService } from '@/src/lib/services/api-football';
import { aiPredictionService } from '@/src/lib/services/ai-prediction';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).isAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    console.log('Starting full data sync...');

    const competitionsList = [
      { code: 'SA', name: 'Serie A', id: 2019 },
      { code: 'CL', name: 'Champions League', id: 2001 },
      { code: 'PL', name: 'Premier League', id: 2021 },
      { code: 'BL1', name: 'Bundesliga', id: 2002 },
      { code: 'FL1', name: 'Ligue 1', id: 2015 },
      { code: 'PD', name: 'La Liga', id: 2014 },
      { code: 'EL', name: 'Europa League', id: 2, apiFootballId: 3 },
      { code: 'ECL', name: 'Conference League', id: 848, apiFootballId: 848 },
    ];

    const results: Array<{ competition: string; status: string; error?: string }> = [];

    // Sync all competitions
    for (const comp of competitionsList) {
      try {
        // Use API-Football for Europa League and Conference League
        if ((comp as any).apiFootballId && (comp.code === 'EL' || comp.code === 'ECL')) {
          console.log(`Syncing ${comp.name} via API-Football (league ID: ${(comp as any).apiFootballId})...`);
          const now = new Date();
          const currentSeason = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
          const seasonStart = `${currentSeason}-09-01`;
          const toDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const result = await apiFootballService.getFixtures((comp as any).apiFootballId, seasonStart, toDate, currentSeason);
          let syncedCount = 0;

          // Save teams first (protect Serie B team names from being overwritten)
          for (const team of result.teams) {
            try {
              // Skip protected teams to avoid overwriting names (e.g. Inter, Sporting CP)
              if (PROTECTED_TEAM_IDS.has(team.id)) {
                console.log(`Skipping protected team ${team.id} (${team.name}) - keeping existing name`);
                continue;
              }
              await db.insert(teams).values(team).onConflictDoUpdate({
                target: teams.id,
                set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
              });
            } catch (err) {
              console.error(`Failed to save team ${team.id}:`, err);
            }
          }

          // Then save matches
          for (const match of result.matches) {
            try {
              await db.insert(matches).values(match).onConflictDoUpdate({
                target: matches.id,
                set: { ...match, lastUpdated: new Date() },
              });
              syncedCount++;
            } catch (err) {
              console.error(`Failed to save match ${match.id}:`, err);
            }
          }
          console.log(`Synced ${syncedCount} matches for ${comp.code}`);
        } else {
          await footballDataService.syncCompetitionData(comp.code);
        }
        console.log(`${comp.name} synced`);
        results.push({ competition: comp.name, status: 'synced' });

        // Sync standings for league competitions only (not cups)
        const leagueCodes = ['SA', 'PD', 'PL', 'BL1', 'FL1'];
        if (leagueCodes.includes(comp.code)) {
          try {
            await footballDataService.syncStandings(comp.code, comp.id);
            console.log(`${comp.name} standings synced`);
          } catch (error) {
            console.log(`${comp.name} standings sync failed:`, error instanceof Error ? error.message : 'Unknown error');
          }
        }
      } catch (error) {
        console.log(`${comp.name} sync failed:`, error instanceof Error ? error.message : 'Unknown error');
        results.push({
          competition: comp.name,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Generate predictions for successfully synced competitions
    for (const comp of competitionsList) {
      const syncResult = results.find((r) => r.competition === comp.name);
      if (syncResult?.status === 'synced') {
        try {
          await aiPredictionService.generatePredictionsForUpcomingMatches(comp.id, false);
          console.log(`${comp.name} predictions generated`);
        } catch (error) {
          console.log(`${comp.name} predictions failed:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }

    const successCount = results.filter((r) => r.status === 'synced').length;
    const message = `Data synchronized: ${successCount}/${competitionsList.length} competitions successful`;

    return NextResponse.json({ message, results });
  } catch (error) {
    console.error('Error syncing all data:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to sync data', details: error instanceof Error ? error.message : 'Unknown error' } },
      { status: 500 }
    );
  }
}
