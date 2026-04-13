import type { InsertCompetition, InsertTeam, InsertMatch, InsertInjury } from "@/src/lib/db/schema";
import { db } from "@/src/lib/db";
import {
  competitions, teams, matches, predictions, matchStats, injuries,
} from "@/src/lib/db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import {
  API_FOOTBALL_LEAGUES,
  NATIONAL_TEAM_COMPETITIONS,
  NATIONAL_TEAM_ID_OFFSET,
  LEAGUE_TO_COMP_MAP,
  SERIE_B_ID_MAP,
  PROTECTED_TEAM_IDS,
  CUP_TEAM_ID_MAP,
} from "@/src/lib/constants";

const API_FOOTBALL_URL = "https://api-football-v1.p.rapidapi.com/v3";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

/**
 * Get namespaced team ID to prevent conflicts between different API providers.
 * - National team IDs are offset by 1,000,000
 * - Serie B teams with ID conflicts are remapped (e.g. 498 Sampdoria → 20001)
 * - Cup teams with conflicts are remapped via CUP_TEAM_ID_MAP
 */
function getNamespacedTeamId(apiFootballTeamId: number, leagueId: number): number {
  if (NATIONAL_TEAM_COMPETITIONS.has(leagueId)) {
    return apiFootballTeamId + NATIONAL_TEAM_ID_OFFSET;
  }
  // Serie B ID remapping (e.g. 498 → 20001 to avoid overwriting Sporting CP)
  if (SERIE_B_ID_MAP[apiFootballTeamId] && leagueId === API_FOOTBALL_LEAGUES.SERIE_B) {
    return SERIE_B_ID_MAP[apiFootballTeamId];
  }
  // Cup team ID remapping (EL/ECL teams that conflict with Football-Data IDs)
  if (CUP_TEAM_ID_MAP[apiFootballTeamId]) {
    return CUP_TEAM_ID_MAP[apiFootballTeamId];
  }
  return apiFootballTeamId;
}

interface APIFootballTeam {
  id: number;
  name: string;
  logo: string;
}

interface APIFootballScore {
  home: number | null;
  away: number | null;
}

interface APIFootballFixture {
  fixture: {
    id: number;
    date: string;
    status: {
      long: string;
      short: string;
    };
  };
  league: {
    id: number;
    name: string;
    logo: string;
    country: string;
    season: number;
    round: string;
  };
  teams: {
    home: APIFootballTeam;
    away: APIFootballTeam;
  };
  goals: APIFootballScore;
  score: {
    halftime: APIFootballScore;
    fulltime: APIFootballScore;
  };
}

interface APIFootballLeague {
  league: {
    id: number;
    name: string;
    type: string;
    logo: string;
  };
}

interface APIFootballStatistics {
  team: {
    id: number;
    name: string;
    logo: string;
  };
  statistics: Array<{
    type: string;
    value: number | string | null;
  }>;
}

class APIFootballService {
  private async fetchFromAPI(endpoint: string): Promise<any> {
    const url = `${API_FOOTBALL_URL}${endpoint}`;

    const response = await fetch(url, {
      headers: {
        "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
        "X-RapidAPI-Key": RAPIDAPI_KEY || "",
      },
    });

    if (!response.ok) {
      throw new Error(`API-Football error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.response) {
      throw new Error("Invalid API-Football response");
    }

    return data.response;
  }

  // Sync competition data
  async syncLeague(leagueId: number, season: number = new Date().getFullYear()): Promise<InsertCompetition> {
    const response = await this.fetchFromAPI(`/leagues?id=${leagueId}&season=${season}`);

    if (!response || response.length === 0) {
      throw new Error(`League ${leagueId} not found`);
    }

    const leagueData: APIFootballLeague = response[0];
    const league = leagueData.league;

    return {
      id: league.id,
      name: league.name,
      code: this.getLeagueCode(league.id),
      type: league.type,
      emblem: league.logo,
    };
  }

  // Get matches for a league in date range
  async getFixtures(
    leagueId: number,
    from: string,
    to: string,
    season: number = new Date().getFullYear()
  ): Promise<{ matches: InsertMatch[]; teams: InsertTeam[] }> {
    const response = await this.fetchFromAPI(
      `/fixtures?league=${leagueId}&season=${season}&from=${from}&to=${to}`
    );

    const fixtures: APIFootballFixture[] = response;
    const teamsMap = new Map<number, InsertTeam>();
    const matchesList: InsertMatch[] = [];

    for (const fixture of fixtures) {
      // Apply namespace offset for national teams to prevent ID conflicts
      const homeTeamId = getNamespacedTeamId(fixture.teams.home.id, leagueId);
      const awayTeamId = getNamespacedTeamId(fixture.teams.away.id, leagueId);

      const homeTeam: InsertTeam = {
        id: homeTeamId,
        name: fixture.teams.home.name,
        shortName: fixture.teams.home.name,
        tla: fixture.teams.home.name.substring(0, 3).toUpperCase(),
        crest: fixture.teams.home.logo,
      };

      const awayTeam: InsertTeam = {
        id: awayTeamId,
        name: fixture.teams.away.name,
        shortName: fixture.teams.away.name,
        tla: fixture.teams.away.name.substring(0, 3).toUpperCase(),
        crest: fixture.teams.away.logo,
      };

      teamsMap.set(homeTeam.id, homeTeam);
      teamsMap.set(awayTeam.id, awayTeam);

      // Convert status
      const status = this.convertStatus(fixture.fixture.status.short);

      // Determine winner
      let winner: string | null = null;
      if (fixture.goals.home !== null && fixture.goals.away !== null) {
        if (fixture.goals.home > fixture.goals.away) {
          winner = "HOME_TEAM";
        } else if (fixture.goals.away > fixture.goals.home) {
          winner = "AWAY_TEAM";
        } else if (status === "FINISHED") {
          winner = "DRAW";
        }
      }

      // Map API-Football league ID to our competition ID
      const leagueToCompMap: Record<number, number> = {
        [API_FOOTBALL_LEAGUES.SERIE_A]: 2019,
        [API_FOOTBALL_LEAGUES.SERIE_B]: 136,
        [API_FOOTBALL_LEAGUES.PREMIER_LEAGUE]: 2021,
        [API_FOOTBALL_LEAGUES.BUNDESLIGA]: 2002,
        [API_FOOTBALL_LEAGUES.LIGUE_1]: 2015,
        [API_FOOTBALL_LEAGUES.LA_LIGA]: 2014,
        [API_FOOTBALL_LEAGUES.CHAMPIONS_LEAGUE]: 2001,
        [API_FOOTBALL_LEAGUES.EUROPA_LEAGUE]: 2,
        [API_FOOTBALL_LEAGUES.CONFERENCE_LEAGUE]: 848,
      };

      const compId = leagueToCompMap[fixture.league.id] || fixture.league.id;

      const match: InsertMatch = {
        id: fixture.fixture.id,
        competitionId: compId,
        utcDate: new Date(fixture.fixture.date),
        status,
        matchday: null,
        stage: fixture.league.round,
        homeTeamId: homeTeamId,  // Use offset ID
        awayTeamId: awayTeamId,  // Use offset ID
        homeScore: fixture.goals.home,
        awayScore: fixture.goals.away,
        homeScoreHT: fixture.score.halftime.home,
        awayScoreHT: fixture.score.halftime.away,
        winner,
        duration: "REGULAR",
        lastUpdated: new Date(),
      };

      matchesList.push(match);
    }

    return {
      matches: matchesList,
      // Filter out protected teams to prevent overwriting Football-Data names (e.g. Inter, Sporting CP)
      teams: Array.from(teamsMap.values()).filter(t => !PROTECTED_TEAM_IDS.has(t.id)),
    };
  }

  // Get standings for a league
  async getStandings(leagueId: number, season: number = new Date().getFullYear()): Promise<any> {
    try {
      const response = await this.fetchFromAPI(`/standings?league=${leagueId}&season=${season}`);
      return response.length > 0 ? response[0].league.standings[0] : [];
    } catch (error) {
      console.error(`Failed to fetch standings for league ${leagueId}:`, error);
      return [];
    }
  }

  // Get team statistics for a season
  async getTeamStatistics(leagueId: number, season: number, teamId: number): Promise<any> {
    try {
      const response = await this.fetchFromAPI(
        `/teams/statistics?league=${leagueId}&season=${season}&team=${teamId}`
      );
      return response;
    } catch (error) {
      console.error(`Failed to fetch team statistics:`, error);
      return null;
    }
  }

  // Get head-to-head matches
  async getH2H(team1Id: number, team2Id: number, last: number = 10): Promise<APIFootballFixture[]> {
    try {
      const response = await this.fetchFromAPI(`/fixtures/headtohead?h2h=${team1Id}-${team2Id}&last=${last}`);
      return response || [];
    } catch (error) {
      console.error(`Failed to fetch H2H:`, error);
      return [];
    }
  }

  // Get historical matches for a specific team
  async getTeamHistory(teamId: number, last: number = 12): Promise<APIFootballFixture[]> {
    try {
      const response = await this.fetchFromAPI(`/fixtures?team=${teamId}&last=${last}`);
      return response || [];
    } catch (error) {
      console.error(`Failed to fetch team history for team ${teamId}:`, error);
      return [];
    }
  }

  // Get injuries for a team or fixture
  async getInjuries(params: {
    teamId?: number;
    fixtureId?: number;
    leagueId?: number;
    season?: number;
  }): Promise<Array<{
    player: { id: number; name: string; photo: string; type: string; reason: string };
    team: { id: number; name: string; logo: string };
    fixture: { id: number; date: string } | null;
    league: { id: number; name: string; season: number };
  }>> {
    try {
      let endpoint = "/injuries?";
      const queryParams: string[] = [];

      if (params.fixtureId) {
        queryParams.push(`fixture=${params.fixtureId}`);
      }
      if (params.teamId) {
        queryParams.push(`team=${params.teamId}`);
      }
      if (params.leagueId) {
        queryParams.push(`league=${params.leagueId}`);
      }
      if (params.season) {
        queryParams.push(`season=${params.season}`);
      }

      if (queryParams.length === 0) {
        console.warn("getInjuries called without any parameters");
        return [];
      }

      endpoint += queryParams.join("&");
      console.log(`Fetching injuries: ${endpoint}`);

      const response = await this.fetchFromAPI(endpoint);
      return response || [];
    } catch (error) {
      console.error(`Failed to fetch injuries:`, error);
      return [];
    }
  }

  // Sync injuries for upcoming matches in a competition
  async syncInjuriesForCompetition(
    leagueId: number,
    season: number = new Date().getFullYear()
  ): Promise<{ synced: number; errors: number }> {
    try {
      console.log(`Syncing injuries for league ${leagueId}, season ${season}...`);

      const injuriesData = await this.getInjuries({ leagueId, season });

      if (!injuriesData || injuriesData.length === 0) {
        console.log(`   No injuries found for league ${leagueId}`);
        return { synced: 0, errors: 0 };
      }

      console.log(`   Found ${injuriesData.length} injury records`);

      let synced = 0;
      let errors = 0;
      let skipped = 0;

      for (const injury of injuriesData) {
        try {
          // Map API-Football team ID to our team ID
          // For national teams, apply offset
          const isNationalTeamLeague = NATIONAL_TEAM_COMPETITIONS.has(leagueId);
          const ourTeamId = isNationalTeamLeague
            ? injury.team.id + NATIONAL_TEAM_ID_OFFSET
            : injury.team.id;

          // Check if team exists in our database before inserting
          const team = await db.select().from(teams).where(eq(teams.id, ourTeamId)).limit(1).then(r => r[0] ?? null);
          if (!team) {
            // Skip injuries for teams not in our database (e.g. minor league teams)
            skipped++;
            continue;
          }

          // Skip records with missing player name
          if (!injury.player.name) {
            skipped++;
            continue;
          }

          // Determine injury type based on reason
          let type: "injury" | "suspension" | "doubtful" = "injury";
          const reasonLower = injury.player.reason?.toLowerCase() || "";
          if (reasonLower.includes("suspended") || reasonLower.includes("red card") || reasonLower.includes("yellow card")) {
            type = "suspension";
          } else if (reasonLower.includes("doubt") || reasonLower.includes("knock") || reasonLower.includes("minor")) {
            type = "doubtful";
          }

          // Determine severity
          let severity: "minor" | "major" | "long_term" | null = null;
          if (reasonLower.includes("minor") || reasonLower.includes("knock")) {
            severity = "minor";
          } else if (reasonLower.includes("long") || reasonLower.includes("acl") || reasonLower.includes("surgery")) {
            severity = "long_term";
          } else if (reasonLower.includes("fracture") || reasonLower.includes("ligament") || reasonLower.includes("muscle")) {
            severity = "major";
          }

          const injuryData: InsertInjury = {
            teamId: ourTeamId,
            playerId: injury.player.id,
            playerName: injury.player.name,
            playerPhoto: injury.player.photo,
            type,
            reason: injury.player.reason || "Unknown",
            severity,
            fixtureId: injury.fixture?.id,
            leagueId: injury.league.id,
            season: injury.league.season,
            isActive: true,
          };

          // Upsert injury: find by player + team + type
          const existing = await db
            .select()
            .from(injuries)
            .where(
              and(
                eq(injuries.teamId, injuryData.teamId),
                eq(injuries.playerName, injuryData.playerName),
                eq(injuries.type, injuryData.type)
              )
            );

          if (existing.length > 0) {
            await db
              .update(injuries)
              .set({ ...injuryData, updatedAt: new Date() })
              .where(eq(injuries.id, existing[0].id));
          } else {
            await db.insert(injuries).values(injuryData);
          }

          synced++;
        } catch (err) {
          console.error(`   Error saving injury for ${injury.player.name}:`, err);
          errors++;
        }
      }

      if (skipped > 0) {
        console.log(`   Skipped ${skipped} injuries (teams not in database)`);
      }

      console.log(`   Synced ${synced} injuries, ${errors} errors`);
      return { synced, errors };
    } catch (error) {
      console.error(`Failed to sync injuries for league ${leagueId}:`, error);
      return { synced: 0, errors: 1 };
    }
  }

  // Sync injuries for all tracked leagues
  async syncAllInjuries(): Promise<{ total: number; errors: number }> {
    const leagueIds = [
      API_FOOTBALL_LEAGUES.CHAMPIONS_LEAGUE,
      API_FOOTBALL_LEAGUES.EUROPA_LEAGUE,
      API_FOOTBALL_LEAGUES.CONFERENCE_LEAGUE,
      API_FOOTBALL_LEAGUES.SERIE_A,
      API_FOOTBALL_LEAGUES.SERIE_B,
      API_FOOTBALL_LEAGUES.PREMIER_LEAGUE,
      API_FOOTBALL_LEAGUES.BUNDESLIGA,
      API_FOOTBALL_LEAGUES.LA_LIGA,
      API_FOOTBALL_LEAGUES.LIGUE_1,
    ];

    let total = 0;
    let errors = 0;

    for (const leagueId of leagueIds) {
      const result = await this.syncInjuriesForCompetition(leagueId);
      total += result.synced;
      errors += result.errors;

      // Delay between API calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Total injuries synced: ${total}, errors: ${errors}`);
    return { total, errors };
  }

  // Get ALL fixtures for a competition/season (for comprehensive data collection)
  async getAllCompetitionFixtures(
    leagueId: number,
    season: number = 2024
  ): Promise<{ matches: InsertMatch[]; teams: InsertTeam[] }> {
    try {
      console.log(`Fetching ALL fixtures for league ${leagueId}, season ${season}...`);

      const response = await this.fetchFromAPI(`/fixtures?league=${leagueId}&season=${season}`);
      const fixtures: APIFootballFixture[] = response || [];

      console.log(`   Found ${fixtures.length} total fixtures`);

      const teamsMap = new Map<number, InsertTeam>();
      const matchesList: InsertMatch[] = [];

      for (const fixture of fixtures) {
        // Apply namespace offset for national teams to prevent ID conflicts
        const homeTeamId = getNamespacedTeamId(fixture.teams.home.id, leagueId);
        const awayTeamId = getNamespacedTeamId(fixture.teams.away.id, leagueId);

        const homeTeam: InsertTeam = {
          id: homeTeamId,
          name: fixture.teams.home.name,
          shortName: fixture.teams.home.name.substring(0, 20),
          tla: fixture.teams.home.name.substring(0, 3).toUpperCase(),
          crest: fixture.teams.home.logo,
        };

        const awayTeam: InsertTeam = {
          id: awayTeamId,
          name: fixture.teams.away.name,
          shortName: fixture.teams.away.name.substring(0, 20),
          tla: fixture.teams.away.name.substring(0, 3).toUpperCase(),
          crest: fixture.teams.away.logo,
        };

        teamsMap.set(homeTeam.id, homeTeam);
        teamsMap.set(awayTeam.id, awayTeam);

        // Convert status
        const status = this.convertStatus(fixture.fixture.status.short);

        // Determine winner
        let winner: string | null = null;
        if (fixture.goals.home !== null && fixture.goals.away !== null) {
          if (fixture.goals.home > fixture.goals.away) {
            winner = "HOME_TEAM";
          } else if (fixture.goals.away > fixture.goals.home) {
            winner = "AWAY_TEAM";
          } else if (status === "FINISHED") {
            winner = "DRAW";
          }
        }

        // For WC Qualifiers, use competitionId 32
        const compId = leagueId === API_FOOTBALL_LEAGUES.WC_QUALIFICATION_EUROPE ? 32 : leagueId;

        const match: InsertMatch = {
          id: fixture.fixture.id,
          competitionId: compId,
          utcDate: new Date(fixture.fixture.date),
          status,
          matchday: null,
          stage: fixture.league.round,
          homeTeamId: homeTeamId,
          awayTeamId: awayTeamId,
          homeScore: fixture.goals.home,
          awayScore: fixture.goals.away,
          homeScoreHT: fixture.score.halftime.home,
          awayScoreHT: fixture.score.halftime.away,
          winner,
          duration: "REGULAR",
          lastUpdated: new Date(),
        };

        matchesList.push(match);
      }

      return {
        matches: matchesList,
        teams: Array.from(teamsMap.values()).filter(t => !PROTECTED_TEAM_IDS.has(t.id)),
      };
    } catch (error) {
      console.error(`Failed to fetch all competition fixtures for league ${leagueId}:`, error);
      return { matches: [], teams: [] };
    }
  }

  // Get live fixtures (all leagues)
  async getLiveFixtures(): Promise<APIFootballFixture[]> {
    try {
      const response = await this.fetchFromAPI(`/fixtures?live=all`);
      return response || [];
    } catch (error) {
      console.error("Failed to fetch live fixtures:", error);
      return [];
    }
  }

  // Sync live scores to database
  async syncLiveScores(): Promise<{ updated: number; matches: Array<{ id: number; homeScore: number; awayScore: number }> }> {
    try {
      const liveFixtures = await this.getLiveFixtures();

      if (liveFixtures.length === 0) {
        console.log("No live fixtures from API-Football");
        return { updated: 0, matches: [] };
      }

      console.log(`Found ${liveFixtures.length} live fixtures from API-Football`);

      const updatedMatches: Array<{ id: number; homeScore: number; awayScore: number }> = [];

      // Map API-Football league IDs to our competition IDs
      const leagueToCompMap: Record<number, number> = {
        [API_FOOTBALL_LEAGUES.SERIE_A]: 2019,
        [API_FOOTBALL_LEAGUES.SERIE_B]: 136,
        [API_FOOTBALL_LEAGUES.PREMIER_LEAGUE]: 2021,
        [API_FOOTBALL_LEAGUES.BUNDESLIGA]: 2002,
        [API_FOOTBALL_LEAGUES.LIGUE_1]: 2015,
        [API_FOOTBALL_LEAGUES.LA_LIGA]: 2014,
        [API_FOOTBALL_LEAGUES.CHAMPIONS_LEAGUE]: 2001,
        [API_FOOTBALL_LEAGUES.EUROPA_LEAGUE]: 2,
        [API_FOOTBALL_LEAGUES.CONFERENCE_LEAGUE]: 848,
      };

      // Get all our potential live matches
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const potentialLiveMatches = await db
        .select()
        .from(matches)
        .where(
          and(
            gte(matches.utcDate, twoHoursAgo),
            sql`${matches.utcDate} <= ${now.toISOString()}`
          )
        )
        .orderBy(matches.utcDate);

      // Update scores for matching fixtures
      for (const fixture of liveFixtures) {
        const ourCompetitionId = leagueToCompMap[fixture.league.id];

        if (!ourCompetitionId) {
          continue; // Skip leagues we don't track
        }

        // Find matching match by team names
        const matchingCandidates = potentialLiveMatches.filter(
          m => m.competitionId === ourCompetitionId
        );

        for (const match of matchingCandidates) {
          const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then(r => r[0] ?? null);
          const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then(r => r[0] ?? null);

          if (!homeTeam || !awayTeam) continue;

          // Match by team names (flexible matching)
          const homeMatch =
            homeTeam.name.toLowerCase().includes(fixture.teams.home.name.toLowerCase()) ||
            fixture.teams.home.name.toLowerCase().includes(homeTeam.name.toLowerCase());

          const awayMatch =
            awayTeam.name.toLowerCase().includes(fixture.teams.away.name.toLowerCase()) ||
            fixture.teams.away.name.toLowerCase().includes(awayTeam.name.toLowerCase());

          if (homeMatch && awayMatch) {
            // Match found! Update scores
            const homeScore = fixture.goals.home ?? 0;
            const awayScore = fixture.goals.away ?? 0;
            const homeScoreHT = fixture.score.halftime.home ?? null;
            const awayScoreHT = fixture.score.halftime.away ?? null;

            const status = this.convertStatus(fixture.fixture.status.short);

            await db
              .update(matches)
              .set({
                homeScore,
                awayScore,
                homeScoreHT,
                awayScoreHT,
                status,
                lastUpdated: new Date(),
              })
              .where(eq(matches.id, match.id));

            updatedMatches.push({ id: match.id, homeScore, awayScore });
            console.log(`Updated match ${match.id}: ${homeTeam.shortName} ${homeScore}-${awayScore} ${awayTeam.shortName}`);
            break;
          }
        }
      }

      return { updated: updatedMatches.length, matches: updatedMatches };
    } catch (error) {
      console.error("Error syncing live scores:", error);
      throw error;
    }
  }

  // Helper: Convert API-Football status to our format
  private convertStatus(apiStatus: string): string {
    const statusMap: Record<string, string> = {
      "TBD": "SCHEDULED",
      "NS": "SCHEDULED",
      "1H": "IN_PLAY",
      "HT": "PAUSED",  // Fixed: HT should be PAUSED, not IN_PLAY
      "2H": "IN_PLAY",
      "ET": "IN_PLAY",
      "P": "IN_PLAY",
      "FT": "FINISHED",
      "AET": "FINISHED",
      "PEN": "FINISHED",
      "PST": "POSTPONED",
      "CANC": "CANCELLED",
      "ABD": "CANCELLED",
      "AWD": "AWARDED",
      "WO": "AWARDED",
    };

    return statusMap[apiStatus] || "SCHEDULED";
  }

  // Get league code for our database
  private getLeagueCode(leagueId: number): string {
    const codeMap: Record<number, string> = {
      [API_FOOTBALL_LEAGUES.SERIE_A]: "SA",
      [API_FOOTBALL_LEAGUES.SERIE_B]: "SB",
      [API_FOOTBALL_LEAGUES.CHAMPIONS_LEAGUE]: "CL",
      [API_FOOTBALL_LEAGUES.EUROPA_LEAGUE]: "EL",
      [API_FOOTBALL_LEAGUES.CONFERENCE_LEAGUE]: "ECL",
      [API_FOOTBALL_LEAGUES.PREMIER_LEAGUE]: "PL",
      [API_FOOTBALL_LEAGUES.LA_LIGA]: "PD",
      [API_FOOTBALL_LEAGUES.BUNDESLIGA]: "BL1",
      [API_FOOTBALL_LEAGUES.LIGUE_1]: "FL1",
      [API_FOOTBALL_LEAGUES.WC_QUALIFICATION_EUROPE]: "WCQ_EU",
    };
    return codeMap[leagueId] || "UNK";
  }

  // NEW: Get match statistics (cards, corners, etc.)
  async getMatchStatistics(fixtureId: number): Promise<{
    homeStats: Record<string, number | null>;
    awayStats: Record<string, number | null>;
  } | null> {
    try {
      const response: APIFootballStatistics[] = await this.fetchFromAPI(
        `/fixtures/statistics?fixture=${fixtureId}`
      );

      if (!response || response.length < 2) {
        console.log(`No statistics found for fixture ${fixtureId}`);
        return null;
      }

      const homeData = response[0];
      const awayData = response[1];

      // Extract specific statistics
      const extractStat = (stats: Array<{ type: string; value: number | string | null }>, type: string): number | null => {
        const stat = stats.find(s => s.type === type);
        if (!stat || stat.value === null) return null;
        return typeof stat.value === 'number' ? stat.value : parseInt(stat.value as string, 10) || null;
      };

      const homeStats = {
        corners: extractStat(homeData.statistics, "Corner Kicks"),
        yellowCards: extractStat(homeData.statistics, "Yellow Cards"),
        redCards: extractStat(homeData.statistics, "Red Cards"),
        shots: extractStat(homeData.statistics, "Total Shots"),
        shotsOnTarget: extractStat(homeData.statistics, "Shots on Goal"),
        possession: extractStat(homeData.statistics, "Ball Possession"),
        fouls: extractStat(homeData.statistics, "Fouls"),
      };

      const awayStats = {
        corners: extractStat(awayData.statistics, "Corner Kicks"),
        yellowCards: extractStat(awayData.statistics, "Yellow Cards"),
        redCards: extractStat(awayData.statistics, "Red Cards"),
        shots: extractStat(awayData.statistics, "Total Shots"),
        shotsOnTarget: extractStat(awayData.statistics, "Shots on Goal"),
        possession: extractStat(awayData.statistics, "Ball Possession"),
        fouls: extractStat(awayData.statistics, "Fouls"),
      };

      return { homeStats, awayStats };
    } catch (error) {
      console.error(`Failed to fetch match statistics for fixture ${fixtureId}:`, error);
      return null;
    }
  }

  // Helper: Normalize team name for matching across APIs
  private normalizeTeamName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD') // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/\./g, '') // Remove dots (e.g., "F.C." -> "FC")
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  // Helper: Check if team names match with fuzzy logic
  private teamNamesMatch(name1: string, name2: string): boolean {
    const norm1 = this.normalizeTeamName(name1);
    const norm2 = this.normalizeTeamName(name2);

    // Exact match after normalization
    if (norm1 === norm2) return true;

    // Check if one contains the other (handles "Manchester United" vs "Man United")
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

    // Common abbreviations mapping
    const abbreviations: Record<string, string[]> = {
      'manchester united': ['man united', 'manchester utd'],
      'manchester city': ['man city'],
      'tottenham hotspur': ['tottenham', 'spurs'],
      'newcastle united': ['newcastle'],
      'west ham united': ['west ham'],
      'brighton and hove albion': ['brighton'],
      'wolverhampton wanderers': ['wolves', 'wolverhampton'],
      'ac milan': ['milan'],
      'inter milan': ['inter', 'internazionale'],
      'hellas verona': ['verona'],
      'athletic club': ['athletic bilbao'],
      'atletico madrid': ['atletico', 'atl madrid'],
      'real madrid': ['real'],
      'paris saint germain': ['psg', 'paris sg'],
      'bayern munich': ['bayern', 'fc bayern'],
    };

    // Check abbreviations
    for (const [full, abbrevs] of Object.entries(abbreviations)) {
      if ((norm1 === full && abbrevs.includes(norm2)) ||
          (norm2 === full && abbrevs.includes(norm1))) {
        return true;
      }
    }

    return false;
  }

  // NEW: Search for fixture ID by team names and date (cross-API mapping)
  async searchFixtureByTeamsAndDate(
    homeTeamName: string,
    awayTeamName: string,
    matchDate: Date,
    leagueId?: number
  ): Promise<number | null> {
    try {
      // Search with +/-2 hour time window to handle timezone differences
      const startDate = new Date(matchDate);
      startDate.setHours(startDate.getHours() - 2);
      const endDate = new Date(matchDate);
      endDate.setHours(endDate.getHours() + 2);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // CRITICAL FIX: European football seasons span two calendar years (Aug 2024 - May 2025 = season 2024)
      const matchMonth = matchDate.getMonth(); // 0-indexed (0=Jan, 7=Aug)
      const matchYear = matchDate.getFullYear();
      const season = matchMonth < 7 ? matchYear - 1 : matchYear; // Jan-Jun -> previous year, Jul-Dec -> current year

      let endpoint = `/fixtures?from=${startDateStr}&to=${endDateStr}`;
      if (leagueId) {
        endpoint += `&league=${leagueId}&season=${season}`;
      }

      const fixtures: APIFootballFixture[] = await this.fetchFromAPI(endpoint);

      if (!fixtures || fixtures.length === 0) {
        console.log(`No fixtures found for date range ${startDateStr} to ${endDateStr}`);
        return null;
      }

      // Find matching fixture
      for (const fixture of fixtures) {
        const homeMatch = this.teamNamesMatch(fixture.teams.home.name, homeTeamName);
        const awayMatch = this.teamNamesMatch(fixture.teams.away.name, awayTeamName);

        if (homeMatch && awayMatch) {
          console.log(`Match found! ${homeTeamName} vs ${awayTeamName} -> Fixture ID ${fixture.fixture.id}`);
          return fixture.fixture.id;
        }
      }

      console.log(`No match found for ${homeTeamName} vs ${awayTeamName} on ${startDateStr}`);
      return null;
    } catch (error) {
      console.error(`Failed to search fixture for ${homeTeamName} vs ${awayTeamName}:`, error);
      return null;
    }
  }

  // NEW: Sync statistics with cross-API mapping (for Football-Data.org matches)
  async syncStatisticsWithCrossAPIMapping(
    daysBack: number = 7
  ): Promise<{ mapped: number; updated: number; failed: number }> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      // Get finished matches without statistics
      const matchesList = await db
        .select()
        .from(matches)
        .where(
          and(
            gte(matches.utcDate, startDate),
            sql`${matches.utcDate} <= ${endDate.toISOString()}`
          )
        )
        .orderBy(matches.utcDate);
      const finishedMatches = matchesList.filter(m => m.status === "FINISHED");

      console.log(`Cross-API mapping: checking ${finishedMatches.length} finished matches...`);

      let mapped = 0;
      let updated = 0;
      let failed = 0;

      for (const match of finishedMatches) {
        try {
          // Skip if already has statistics
          const existingStats = await db.select().from(matchStats).where(eq(matchStats.matchId, match.id)).limit(1).then(r => r[0] ?? null);
          if (existingStats?.homeCorners !== null && existingStats?.homeYellowCards !== null) {
            continue;
          }

          // Get team names
          const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then(r => r[0] ?? null);
          const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then(r => r[0] ?? null);

          if (!homeTeam || !awayTeam) {
            console.log(`Missing team data for match ${match.id}`);
            failed++;
            continue;
          }

          // Try to find API-Football fixture ID if not already mapped
          let fixtureId = match.apiFootballFixtureId;

          if (!fixtureId) {
            // Map Football-Data.org competition ID to API-Football league ID
            const leagueIdMap: Record<number, number> = {
              2021: API_FOOTBALL_LEAGUES.PREMIER_LEAGUE, // 39
              2014: API_FOOTBALL_LEAGUES.LA_LIGA, // 140
              2002: API_FOOTBALL_LEAGUES.BUNDESLIGA, // 78
              2019: API_FOOTBALL_LEAGUES.SERIE_A, // 135
              2015: API_FOOTBALL_LEAGUES.LIGUE_1, // 61
              2001: API_FOOTBALL_LEAGUES.CHAMPIONS_LEAGUE, // 2
              2: API_FOOTBALL_LEAGUES.EUROPA_LEAGUE, // 3
              848: API_FOOTBALL_LEAGUES.CONFERENCE_LEAGUE, // 848
              136: API_FOOTBALL_LEAGUES.SERIE_B, // 136
            };

            const leagueId = leagueIdMap[match.competitionId];

            // CRITICAL FIX: ALWAYS pass leagueId to enable season parameter
            if (!leagueId) {
              console.log(`No API-Football league mapping for competition ${match.competitionId}`);
              failed++;
              continue;
            }

            fixtureId = await this.searchFixtureByTeamsAndDate(
              homeTeam.name,
              awayTeam.name,
              new Date(match.utcDate),
              leagueId // Now always passed!
            );

            if (fixtureId) {
              // Update match with API-Football fixture ID
              await db.insert(matches).values({
                ...match,
                apiFootballFixtureId: fixtureId,
              }).onConflictDoUpdate({
                target: matches.id,
                set: { ...match, apiFootballFixtureId: fixtureId, lastUpdated: new Date() },
              });
              mapped++;
              console.log(`Mapped match ${match.id} -> API-Football fixture ${fixtureId}`);
            } else {
              console.log(`Could not find fixture for ${homeTeam.name} vs ${awayTeam.name}`);
              failed++;
              continue;
            }
          }

          // Fetch statistics using fixture ID
          const stats = await this.getMatchStatistics(fixtureId);

          if (!stats) {
            console.log(`No statistics for fixture ${fixtureId}`);
            failed++;
            continue;
          }

          const { homeStats, awayStats } = stats;

          // Save to match_stats table
          const statsData = {
            matchId: match.id,
            homeCorners: homeStats.corners,
            awayCorners: awayStats.corners,
            homeYellowCards: homeStats.yellowCards,
            awayYellowCards: awayStats.yellowCards,
            homeRedCards: homeStats.redCards,
            awayRedCards: awayStats.redCards,
            homeShots: homeStats.shots,
            awayShotsOnTarget: awayStats.shotsOnTarget,
            homeShotsOnTarget: homeStats.shotsOnTarget,
            awayShots: awayStats.shots,
            homePossession: homeStats.possession,
            awayPossession: awayStats.possession,
            homeFouls: homeStats.fouls,
            awayFouls: awayStats.fouls,
          };

          const existingMatchStats = await db.select().from(matchStats).where(eq(matchStats.matchId, match.id)).limit(1).then(r => r[0] ?? null);
          if (existingMatchStats) {
            await db.update(matchStats).set(statsData).where(eq(matchStats.matchId, match.id));
          } else {
            await db.insert(matchStats).values(statsData);
          }

          // Calculate totals and update prediction
          const totalCards = (homeStats.yellowCards || 0) + (awayStats.yellowCards || 0) +
                           (homeStats.redCards || 0) + (awayStats.redCards || 0);
          const totalCorners = (homeStats.corners || 0) + (awayStats.corners || 0);

          const prediction = await db
            .select()
            .from(predictions)
            .where(eq(predictions.matchId, match.id))
            .orderBy(desc(predictions.createdAt))
            .limit(1)
            .then(r => r[0] ?? null);
          if (prediction) {
            await db.update(predictions).set({
              actualTotalCards: totalCards,
              actualTotalCorners: totalCorners,
            }).where(eq(predictions.id, prediction.id));
          }

          updated++;
          console.log(`Stats synced for ${homeTeam.name} vs ${awayTeam.name}: ${totalCorners} corners, ${totalCards} cards`);

          // CRITICAL FIX: API-Football RapidAPI quota is 10 req/min -> 6000ms delay minimum
          await new Promise(resolve => setTimeout(resolve, 6000));
        } catch (error) {
          console.error(`Failed to process match ${match.id}:`, error);
          failed++;
        }
      }

      console.log(`Cross-API mapping complete: ${mapped} mapped, ${updated} updated, ${failed} failed`);
      return { mapped, updated, failed };
    } catch (error) {
      console.error("Error in cross-API statistics sync:", error);
      throw error;
    }
  }

  // NEW: Sync statistics for matches by date
  async syncMatchStatistics(date: Date): Promise<{ updated: number; failed: number }> {
    try {
      // Get all finished matches from the date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const matchesList = await db
        .select()
        .from(matches)
        .where(
          and(
            gte(matches.utcDate, startOfDay),
            sql`${matches.utcDate} <= ${endOfDay.toISOString()}`
          )
        )
        .orderBy(matches.utcDate);
      const finishedMatches = matchesList.filter(m => m.status === "FINISHED");

      console.log(`Found ${finishedMatches.length} finished matches on ${date.toISOString().split('T')[0]}`);

      let updated = 0;
      let failed = 0;

      for (const match of finishedMatches) {
        try {
          const stats = await this.getMatchStatistics(match.id);

          if (!stats) {
            console.log(`No statistics for match ${match.id}`);
            failed++;
            continue;
          }

          const { homeStats, awayStats } = stats;

          // Save to match_stats table
          const statsData = {
            matchId: match.id,
            homeCorners: homeStats.corners,
            awayCorners: awayStats.corners,
            homeYellowCards: homeStats.yellowCards,
            awayYellowCards: awayStats.yellowCards,
            homeRedCards: homeStats.redCards,
            awayRedCards: awayStats.redCards,
            homeShots: homeStats.shots,
            awayShotsOnTarget: awayStats.shotsOnTarget,
            homeShotsOnTarget: homeStats.shotsOnTarget,
            awayShots: awayStats.shots,
            homePossession: homeStats.possession,
            awayPossession: awayStats.possession,
            homeFouls: homeStats.fouls,
            awayFouls: awayStats.fouls,
          };

          const existingMatchStats = await db.select().from(matchStats).where(eq(matchStats.matchId, match.id)).limit(1).then(r => r[0] ?? null);
          if (existingMatchStats) {
            await db.update(matchStats).set(statsData).where(eq(matchStats.matchId, match.id));
          } else {
            await db.insert(matchStats).values(statsData);
          }

          // Calculate total cards and corners
          const totalCards = (homeStats.yellowCards || 0) + (awayStats.yellowCards || 0) +
                           (homeStats.redCards || 0) + (awayStats.redCards || 0);
          const totalCorners = (homeStats.corners || 0) + (awayStats.corners || 0);

          // Update prediction with actual values
          const prediction = await db
            .select()
            .from(predictions)
            .where(eq(predictions.matchId, match.id))
            .orderBy(desc(predictions.createdAt))
            .limit(1)
            .then(r => r[0] ?? null);
          if (prediction) {
            await db.update(predictions).set({
              actualTotalCards: totalCards,
              actualTotalCorners: totalCorners,
            }).where(eq(predictions.id, prediction.id));
          }

          updated++;
          console.log(`Updated stats for match ${match.id}: ${totalCorners} corners, ${totalCards} cards`);

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`Failed to sync stats for match ${match.id}:`, error);
          failed++;
        }
      }

      return { updated, failed };
    } catch (error) {
      console.error("Error syncing match statistics:", error);
      throw error;
    }
  }
}

export const apiFootballService = new APIFootballService();
