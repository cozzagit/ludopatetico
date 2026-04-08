import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { teams, matches, competitions, standings } from '@/src/lib/db/schema';
import { auth } from '@/src/lib/auth';
import { footballDataService } from '@/src/lib/services/football-data';
import { apiFootballService } from '@/src/lib/services/api-football';
import { API_FOOTBALL_LEAGUES } from '@/src/lib/constants';

type CompetitionConfig = {
  name: string;
  hasStandings: boolean;
  provider: 'football-data' | 'api-football';
  code?: string;
  apiFootballLeagueId?: number;
  season?: number;
};

function getCurrentSeason(): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  // If we're in Jan-Jul, the season is still the previous year
  return currentMonth < 7 ? currentYear - 1 : currentYear;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Non autenticato' } },
        { status: 401 }
      );
    }

    const { id } = await params;
    const competitionId = parseInt(id);
    const currentSeason = getCurrentSeason();

    const competitionSyncConfig: Record<number, CompetitionConfig> = {
      // Football-Data.org competitions
      2019: { name: 'Serie A', hasStandings: true, provider: 'football-data', code: 'SA' },
      2021: { name: 'Premier League', hasStandings: true, provider: 'football-data', code: 'PL' },
      2002: { name: 'Bundesliga', hasStandings: true, provider: 'football-data', code: 'BL1' },
      2015: { name: 'Ligue 1', hasStandings: true, provider: 'football-data', code: 'FL1' },
      2014: { name: 'La Liga', hasStandings: true, provider: 'football-data', code: 'PD' },
      2001: { name: 'Champions League', hasStandings: false, provider: 'football-data', code: 'CL' },
      // API-Football competitions
      136: { name: 'Serie B', hasStandings: true, provider: 'api-football', apiFootballLeagueId: API_FOOTBALL_LEAGUES.SERIE_B, season: currentSeason },
      32: { name: 'World Cup - Qualification Europe', hasStandings: false, provider: 'api-football', apiFootballLeagueId: API_FOOTBALL_LEAGUES.WC_QUALIFICATION_EUROPE, season: 2024 },
      2: { name: 'Europa League', hasStandings: false, provider: 'api-football', apiFootballLeagueId: API_FOOTBALL_LEAGUES.EUROPA_LEAGUE, season: 2024 },
      848: { name: 'Conference League', hasStandings: false, provider: 'api-football', apiFootballLeagueId: API_FOOTBALL_LEAGUES.CONFERENCE_LEAGUE, season: 2024 },
    };

    const config = competitionSyncConfig[competitionId];
    if (!config) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Competition not found' } },
        { status: 404 }
      );
    }

    console.log(`Starting sync for ${config.name} (provider: ${config.provider})...`);

    let matchesSynced = false;
    let standingsSynced = false;

    if (config.provider === 'football-data') {
      if (!config.code) {
        return NextResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Missing Football-Data code' } },
          { status: 500 }
        );
      }

      // Sync matches
      await footballDataService.syncCompetitionData(config.code);
      matchesSynced = true;
      console.log(`${config.name} matches synced`);

      // Sync standings if applicable
      if (config.hasStandings) {
        await footballDataService.syncStandings(config.code, competitionId);
        standingsSynced = true;
        console.log(`${config.name} standings synced`);
      } else {
        standingsSynced = true;
      }
    } else if (config.provider === 'api-football') {
      if (!config.apiFootballLeagueId || !config.season) {
        return NextResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Missing API-Football league ID or season' } },
          { status: 500 }
        );
      }

      const today = new Date();
      const pastSixMonths = new Date(today);
      pastSixMonths.setMonth(pastSixMonths.getMonth() - 6);
      const nextSixMonths = new Date(today);
      nextSixMonths.setMonth(nextSixMonths.getMonth() + 6);

      const from = pastSixMonths.toISOString().split('T')[0];
      const to = nextSixMonths.toISOString().split('T')[0];

      // Sync league/competition metadata
      const competition = await apiFootballService.syncLeague(config.apiFootballLeagueId, config.season);
      await db.insert(competitions).values(competition).onConflictDoUpdate({
        target: competitions.id,
        set: { name: competition.name, code: competition.code, type: competition.type, emblem: competition.emblem },
      });
      console.log(`${config.name} competition metadata synced`);

      // Sync fixtures and teams
      const fixturesData = await apiFootballService.getFixtures(
        config.apiFootballLeagueId,
        from,
        to,
        config.season
      );

      for (const team of fixturesData.teams) {
        await db.insert(teams).values(team).onConflictDoUpdate({
          target: teams.id,
          set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
        });
      }

      for (const match of fixturesData.matches) {
        await db.insert(matches).values(match).onConflictDoUpdate({
          target: matches.id,
          set: { ...match, lastUpdated: new Date() },
        });
      }

      matchesSynced = true;
      console.log(`${config.name} synced ${fixturesData.matches.length} matches, ${fixturesData.teams.length} teams`);

      // Sync standings if applicable
      if (config.hasStandings) {
        const standingsData = await apiFootballService.getStandings(config.apiFootballLeagueId, config.season);

        if (standingsData && standingsData.length > 0) {
          for (const standing of standingsData) {
            // Simple insert (upsert not critical here)
            await db.insert(standings).values({
              competitionId,
              season: config.season,
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
        }

        standingsSynced = true;
        console.log(`${config.name} synced ${standingsData.length} standings entries`);
      } else {
        standingsSynced = true;
      }
    }

    return NextResponse.json({
      message: `${config.name} sincronizzato con successo`,
      matchesSynced,
      standingsSynced,
      hasStandings: config.hasStandings,
      provider: config.provider,
    });
  } catch (error: any) {
    console.error('Error syncing competition:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message || 'Errore durante la sincronizzazione' } },
      { status: 500 }
    );
  }
}
