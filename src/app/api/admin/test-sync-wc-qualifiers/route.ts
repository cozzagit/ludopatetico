import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { teams, matches, competitions } from '@/src/lib/db/schema';
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

    console.log('Testing World Cup Qualifiers Europe sync...');

    const today = new Date();
    const nextSixMonths = new Date(today);
    nextSixMonths.setMonth(nextSixMonths.getMonth() + 6);

    const from = today.toISOString().split('T')[0];
    const to = nextSixMonths.toISOString().split('T')[0];
    const season = 2024; // WC Qualifiers 2026 stored as season 2024

    console.log(`Syncing WC Qualifiers Europe (API-Football ID: ${API_FOOTBALL_LEAGUES.WC_QUALIFICATION_EUROPE}, season: ${season})...`);

    // First, sync the competition itself
    const competition = await apiFootballService.syncLeague(API_FOOTBALL_LEAGUES.WC_QUALIFICATION_EUROPE, season);
    await db.insert(competitions).values(competition).onConflictDoUpdate({
      target: competitions.id,
      set: { name: competition.name, code: competition.code, type: competition.type, emblem: competition.emblem },
    });
    console.log(`Competition synced: ${competition.name}`);

    // Then sync matches
    const wcqData = await apiFootballService.getFixtures(
      API_FOOTBALL_LEAGUES.WC_QUALIFICATION_EUROPE,
      from,
      to,
      season
    );

    // Insert teams
    for (const team of wcqData.teams) {
      await db.insert(teams).values(team).onConflictDoUpdate({
        target: teams.id,
        set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
      });
    }

    // Insert matches
    for (const match of wcqData.matches) {
      await db.insert(matches).values(match).onConflictDoUpdate({
        target: matches.id,
        set: { ...match, lastUpdated: new Date() },
      });
    }

    console.log(`WC Qualifiers synced: ${wcqData.matches.length} matches, ${wcqData.teams.length} teams`);

    return NextResponse.json({
      message: 'Qualificazioni mondiali UEFA sincronizzate!',
      competition: competition.name,
      matches: wcqData.matches.length,
      teams: wcqData.teams.length,
      dateRange: `${from} -> ${to}`,
      season: season,
    });
  } catch (error) {
    console.error('Error syncing WC Qualifiers:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Errore sincronizzazione qualificazioni mondiali', details: error instanceof Error ? error.message : 'Unknown error' } },
      { status: 500 }
    );
  }
}
