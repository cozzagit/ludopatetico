import type { InsertCompetition, InsertTeam, InsertMatch } from "@/src/lib/db/schema";
import { db } from "@/src/lib/db";
import {
  competitions, teams, matches, predictions, teamForm, matchStats, standings,
} from "@/src/lib/db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { LIGUE1_ID_MAP, SERIE_B_TEAMS } from "@/src/lib/constants";

const FOOTBALL_DATA_API_URL = "https://api.football-data.org/v4";
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

/**
 * DUPLICATE TEAM ID HANDLING - LIGUE 1 / SERIE B
 *
 * Problem:
 * Football-Data API uses the same team IDs across different competitions.
 * For example, team ID 511 is used for both "Toulouse FC" (Ligue 1) and "Empoli" (Serie B).
 * When syncing, the API overwrites team names in the database, causing Italian teams
 * to appear in Ligue 1 and French teams to appear in Serie B.
 *
 * Solution Implemented (Nov 2025):
 * - Created custom team IDs for Ligue 1 French teams:
 *   * 10001: OGC Nice (API ID: 522)
 *   * 10002: Toulouse FC (API ID: 511)
 *   * 10003: Stade Brestois 29 (API ID: 512)
 *   * 10004: FC Lorient (API ID: 525)
 *
 * - Original IDs 511, 512, 522, 525 are preserved for Italian Serie B teams:
 *   * 511: Empoli
 *   * 512: Frosinone
 *   * 522: Palermo
 *   * 525: Pescara
 */

interface FootballDataCompetition {
  id: number;
  name: string;
  code: string;
  type: string;
  emblem: string;
}

interface FootballDataTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

interface FootballDataScore {
  home: number | null;
  away: number | null;
}

interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  stage: string;
  homeTeam: FootballDataTeam;
  awayTeam: FootballDataTeam;
  score: {
    winner: string | null;
    duration: string;
    fullTime: FootballDataScore;
    halfTime: FootballDataScore;
  };
}

interface FootballDataMatchesResponse {
  matches: FootballDataMatch[];
}

interface FootballDataStandings {
  standings: Array<{
    table: Array<{
      position: number;
      team: FootballDataTeam;
      playedGames: number;
      won: number;
      draw: number;
      lost: number;
      points: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
    }>;
  }>;
}

class FootballDataService {
  private async fetchFromAPI(endpoint: string, retries = 0): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    let response: Response;
    try {
      response = await fetch(`${FOOTBALL_DATA_API_URL}${endpoint}`, {
        headers: { "X-Auth-Token": API_KEY || "" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      if (response.status === 429) {
        if (retries < 2) {
          const waitTime = (retries + 1) * 3000;
          console.log(`Rate limit hit, waiting ${waitTime}ms before retry ${retries + 1}/2...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.fetchFromAPI(endpoint, retries + 1);
        }
        throw new Error(`RATE_LIMIT: L'API football-data.org ha raggiunto il limite di richieste. Riprova tra qualche minuto.`);
      }
      throw new Error(`Football Data API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async getCompetition(competitionCode: string): Promise<InsertCompetition> {
    const data: FootballDataCompetition = await this.fetchFromAPI(`/competitions/${competitionCode}`);

    return {
      id: data.id,
      name: data.name,
      code: data.code,
      type: data.type,
      emblem: data.emblem,
    };
  }

  async getTeams(competitionCode: string): Promise<InsertTeam[]> {
    const data = await this.fetchFromAPI(`/competitions/${competitionCode}/teams`);

    return data.teams.map((team: FootballDataTeam) => ({
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      tla: team.tla,
      crest: team.crest,
    }));
  }

  async getMatches(competitionCode: string, dateFrom?: string, dateTo?: string): Promise<{
    competition: InsertCompetition;
    matches: Array<InsertMatch & { homeTeam: InsertTeam; awayTeam: InsertTeam }>;
  }> {
    let endpoint = `/competitions/${competitionCode}/matches`;
    const params = new URLSearchParams();

    if (dateFrom) params.append("dateFrom", dateFrom);
    if (dateTo) params.append("dateTo", dateTo);

    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    const data: FootballDataMatchesResponse & { competition: FootballDataCompetition } =
      await this.fetchFromAPI(endpoint);

    const competition: InsertCompetition = {
      id: data.competition.id,
      name: data.competition.name,
      code: data.competition.code,
      type: data.competition.type,
      emblem: data.competition.emblem,
    };

    const matchesList = data.matches.map((match: FootballDataMatch) => ({
      id: match.id,
      competitionId: data.competition.id,
      utcDate: new Date(match.utcDate),
      status: match.status,
      matchday: match.matchday,
      stage: match.stage,
      homeTeamId: match.homeTeam.id,
      awayTeamId: match.awayTeam.id,
      homeScore: match.score.fullTime.home,
      awayScore: match.score.fullTime.away,
      // Extract half-time scores for HT predictions accuracy
      homeScoreHT: match.score.halfTime?.home ?? null,
      awayScoreHT: match.score.halfTime?.away ?? null,
      winner: match.score.winner,
      duration: match.score.duration,
      lastUpdated: new Date(),
      homeTeam: {
        id: match.homeTeam.id,
        name: match.homeTeam.name,
        shortName: match.homeTeam.shortName,
        tla: match.homeTeam.tla,
        crest: match.homeTeam.crest,
      },
      awayTeam: {
        id: match.awayTeam.id,
        name: match.awayTeam.name,
        shortName: match.awayTeam.shortName,
        tla: match.awayTeam.tla,
        crest: match.awayTeam.crest,
      },
    }));

    return { competition, matches: matchesList };
  }

  async getLiveMatches(): Promise<Array<InsertMatch & { homeTeam: InsertTeam; awayTeam: InsertTeam; competition: InsertCompetition }>> {
    // FALLBACK: Consider matches as LIVE if:
    // 1. They have a prediction (user is interested)
    // 2. Start time has passed (match should have started)
    // 3. Start time + 2 hours hasn't passed yet (match should still be ongoing)

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Get matches that should be live based on time
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

    // Filter to only include matches with predictions and not finished
    const liveMatchesWithPredictions = [];
    for (const match of potentialLiveMatches) {
      // Skip if already finished
      if (match.status === 'FINISHED') continue;

      // Check if match has a prediction
      const prediction = await db
        .select()
        .from(predictions)
        .where(eq(predictions.matchId, match.id))
        .orderBy(desc(predictions.createdAt))
        .limit(1)
        .then(r => r[0] ?? null);
      if (!prediction) continue;

      // Get team and competition data
      const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then(r => r[0] ?? null);
      const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then(r => r[0] ?? null);
      const competition = await db.select().from(competitions).where(eq(competitions.id, match.competitionId)).limit(1).then(r => r[0] ?? null);

      if (homeTeam && awayTeam && competition) {
        liveMatchesWithPredictions.push({
          ...match,
          homeTeam,
          awayTeam,
          competition,
        });
      }
    }

    console.log(`Fallback live matches: ${liveMatchesWithPredictions.length} matches in progress (started but not finished)`);
    return liveMatchesWithPredictions;
  }

  async getUpcomingMatches(competitionCode: string, days: number = 7): Promise<{
    competition: InsertCompetition;
    matches: Array<InsertMatch & { homeTeam: InsertTeam; awayTeam: InsertTeam }>;
  }> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    const dateFrom = today.toISOString().split("T")[0];
    const dateTo = futureDate.toISOString().split("T")[0];

    return await this.getMatches(competitionCode, dateFrom, dateTo);
  }

  async getFinishedMatches(competitionCode: string, daysBack: number = 7): Promise<{
    competition: InsertCompetition;
    matches: Array<InsertMatch & { homeTeam: InsertTeam; awayTeam: InsertTeam }>;
  }> {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - daysBack);

    const dateFrom = pastDate.toISOString().split("T")[0];
    const dateTo = today.toISOString().split("T")[0];

    return await this.getMatches(competitionCode, dateFrom, dateTo);
  }

  async getStandings(competitionCode: string): Promise<FootballDataStandings> {
    return await this.fetchFromAPI(`/competitions/${competitionCode}/standings`);
  }

  async getMatch(matchId: number): Promise<FootballDataMatch> {
    return await this.fetchFromAPI(`/matches/${matchId}`);
  }

  async syncCompetitionData(competitionCode: string): Promise<void> {
    // Ligue 1 (FL1) Team ID Remapping - Auto-fix for duplicate IDs with Serie B
    const isLigue1 = competitionCode === 'FL1';

    const competition = await this.getCompetition(competitionCode);
    await db.insert(competitions).values(competition).onConflictDoUpdate({
      target: competitions.id,
      set: { name: competition.name, code: competition.code, type: competition.type, emblem: competition.emblem },
    });

    const teamsList = await this.getTeams(competitionCode);
    for (const team of teamsList) {
      if (isLigue1 && LIGUE1_ID_MAP[team.id]) {
        // For Ligue 1: Create custom ID team instead of overwriting
        const customId = LIGUE1_ID_MAP[team.id];
        await db.insert(teams).values({
          id: customId,
          name: team.name,
          shortName: team.shortName,
          tla: team.tla,
          crest: team.crest,
        }).onConflictDoUpdate({
          target: teams.id,
          set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
        });
        console.log(`Remapped ${team.name} from API ID ${team.id} to custom ID ${customId}`);
      } else {
        await db.insert(teams).values(team).onConflictDoUpdate({
          target: teams.id,
          set: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
        });
      }
    }

    const { matches: matchesList } = await this.getUpcomingMatches(competitionCode, 30);

    for (const match of matchesList) {
      // Skip matches with TBD teams (knockout rounds where teams are not yet determined)
      if (!match.homeTeam.id || !match.awayTeam.id) {
        console.log(`Skipping match ${match.id}: team(s) TBD (knockout round)`);
        continue;
      }

      // Handle team IDs with remapping for Ligue 1
      const homeTeamId = isLigue1 && LIGUE1_ID_MAP[match.homeTeam.id]
        ? LIGUE1_ID_MAP[match.homeTeam.id]
        : match.homeTeam.id;
      const awayTeamId = isLigue1 && LIGUE1_ID_MAP[match.awayTeam.id]
        ? LIGUE1_ID_MAP[match.awayTeam.id]
        : match.awayTeam.id;

      // Upsert teams with correct IDs
      if (isLigue1 && LIGUE1_ID_MAP[match.homeTeam.id]) {
        await db.insert(teams).values({ ...match.homeTeam, id: homeTeamId }).onConflictDoUpdate({
          target: teams.id,
          set: { name: match.homeTeam.name, shortName: match.homeTeam.shortName, tla: match.homeTeam.tla, crest: match.homeTeam.crest },
        });
      } else {
        await db.insert(teams).values(match.homeTeam).onConflictDoUpdate({
          target: teams.id,
          set: { name: match.homeTeam.name, shortName: match.homeTeam.shortName, tla: match.homeTeam.tla, crest: match.homeTeam.crest },
        });
      }

      if (isLigue1 && LIGUE1_ID_MAP[match.awayTeam.id]) {
        await db.insert(teams).values({ ...match.awayTeam, id: awayTeamId }).onConflictDoUpdate({
          target: teams.id,
          set: { name: match.awayTeam.name, shortName: match.awayTeam.shortName, tla: match.awayTeam.tla, crest: match.awayTeam.crest },
        });
      } else {
        await db.insert(teams).values(match.awayTeam).onConflictDoUpdate({
          target: teams.id,
          set: { name: match.awayTeam.name, shortName: match.awayTeam.shortName, tla: match.awayTeam.tla, crest: match.awayTeam.crest },
        });
      }

      // Insert match with remapped team IDs
      const { homeTeam: _ht, awayTeam: _at, ...matchData } = match;
      await db.insert(matches).values({
        ...matchData,
        homeTeamId,
        awayTeamId,
      }).onConflictDoUpdate({
        target: matches.id,
        set: { ...matchData, homeTeamId, awayTeamId, lastUpdated: new Date() },
      });
    }

    // CRITICAL: Restore Italian Serie B team names after Ligue 1 sync
    if (isLigue1) {
      console.log("Restoring Italian Serie B team names...");
      for (const [id, teamData] of Object.entries(SERIE_B_TEAMS)) {
        await db.update(teams)
          .set(teamData)
          .where(eq(teams.id, parseInt(id)));
      }
      console.log("Serie B team names restored");
    }

    console.log(`Synced ${matchesList.length} matches for ${competitionCode}`);
  }

  async syncFinishedMatches(competitionCode: string, daysBack: number = 7): Promise<void> {
    // Ligue 1 ID Remapping - Same as syncCompetitionData
    const isLigue1 = competitionCode === 'FL1';

    console.log(`Syncing finished matches for ${competitionCode} from last ${daysBack} days...`);
    const { matches: matchesList } = await this.getFinishedMatches(competitionCode, daysBack);

    for (const match of matchesList) {
      // Skip matches with TBD teams
      if (!match.homeTeam.id || !match.awayTeam.id) {
        console.log(`Skipping finished match ${match.id}: team(s) TBD`);
        continue;
      }

      // Apply Ligue 1 remapping if needed
      const homeTeamId = isLigue1 && LIGUE1_ID_MAP[match.homeTeam.id]
        ? LIGUE1_ID_MAP[match.homeTeam.id]
        : match.homeTeam.id;
      const awayTeamId = isLigue1 && LIGUE1_ID_MAP[match.awayTeam.id]
        ? LIGUE1_ID_MAP[match.awayTeam.id]
        : match.awayTeam.id;

      // Upsert teams with remapped IDs
      if (isLigue1 && LIGUE1_ID_MAP[match.homeTeam.id]) {
        await db.insert(teams).values({ ...match.homeTeam, id: homeTeamId }).onConflictDoUpdate({
          target: teams.id,
          set: { name: match.homeTeam.name, shortName: match.homeTeam.shortName, tla: match.homeTeam.tla, crest: match.homeTeam.crest },
        });
      } else {
        await db.insert(teams).values(match.homeTeam).onConflictDoUpdate({
          target: teams.id,
          set: { name: match.homeTeam.name, shortName: match.homeTeam.shortName, tla: match.homeTeam.tla, crest: match.homeTeam.crest },
        });
      }

      if (isLigue1 && LIGUE1_ID_MAP[match.awayTeam.id]) {
        await db.insert(teams).values({ ...match.awayTeam, id: awayTeamId }).onConflictDoUpdate({
          target: teams.id,
          set: { name: match.awayTeam.name, shortName: match.awayTeam.shortName, tla: match.awayTeam.tla, crest: match.awayTeam.crest },
        });
      } else {
        await db.insert(teams).values(match.awayTeam).onConflictDoUpdate({
          target: teams.id,
          set: { name: match.awayTeam.name, shortName: match.awayTeam.shortName, tla: match.awayTeam.tla, crest: match.awayTeam.crest },
        });
      }

      // Upsert match with remapped team IDs
      const { homeTeam: _ht, awayTeam: _at, ...matchData } = match;
      await db.insert(matches).values({
        ...matchData,
        homeTeamId,
        awayTeamId,
      }).onConflictDoUpdate({
        target: matches.id,
        set: { ...matchData, homeTeamId, awayTeamId, lastUpdated: new Date() },
      });

      // Update prediction accuracy if match is finished
      if (match.status === 'FINISHED' && match.homeScore !== null && match.awayScore !== null && match.homeScore !== undefined && match.awayScore !== undefined) {
        await this.updatePredictionAccuracy(
          match.id,
          match.homeScore,
          match.awayScore,
          match.winner ?? null,
          match.homeScoreHT ?? null,
          match.awayScoreHT ?? null
        );
      }
    }

    // CRITICAL: Restore Italian Serie B team names after Ligue 1 sync
    if (isLigue1 && matchesList.length > 0) {
      console.log("Restoring Italian Serie B team names...");
      for (const [id, teamData] of Object.entries(SERIE_B_TEAMS)) {
        await db.update(teams)
          .set(teamData)
          .where(eq(teams.id, parseInt(id)));
      }
      console.log("Serie B team names restored");
    }

    console.log(`Completed syncing ${matchesList.length} finished matches for ${competitionCode}`);
  }

  async syncStandings(competitionCode: string, competitionId: number): Promise<void> {
    // Ligue 1 ID Remapping
    const isLigue1 = competitionCode === 'FL1';

    console.log(`Syncing standings for ${competitionCode}...`);
    const standingsData = await this.getStandings(competitionCode);

    if (!standingsData.standings || standingsData.standings.length === 0) {
      console.log(`No standings data available for ${competitionCode}`);
      return;
    }

    // Get current season (use current year for simplicity)
    const currentSeason = new Date().getFullYear();

    // Clear existing standings for this competition and season
    await db.delete(standings).where(and(eq(standings.competitionId, competitionId), eq(standings.season, currentSeason)));

    // Insert new standings (football-data API returns standings[0].table for league competitions)
    const table = standingsData.standings[0]?.table || [];

    for (const entry of table) {
      // Apply ID remapping for Ligue 1
      const teamId = isLigue1 && LIGUE1_ID_MAP[entry.team.id]
        ? LIGUE1_ID_MAP[entry.team.id]
        : entry.team.id;

      // Upsert team first with correct ID
      await db.insert(teams).values({
        id: teamId,
        name: entry.team.name,
        shortName: entry.team.shortName,
        tla: entry.team.tla,
        crest: entry.team.crest,
      }).onConflictDoUpdate({
        target: teams.id,
        set: { name: entry.team.name, shortName: entry.team.shortName, tla: entry.team.tla, crest: entry.team.crest },
      });

      // Insert standing entry with remapped team ID
      const standingData = {
        competitionId,
        season: currentSeason,
        teamId: teamId,
        position: entry.position,
        playedGames: entry.playedGames,
        won: entry.won,
        draw: entry.draw,
        lost: entry.lost,
        points: entry.points,
        goalsFor: entry.goalsFor,
        goalsAgainst: entry.goalsAgainst,
        goalDifference: entry.goalDifference,
      };

      // Check if standing exists
      const existing = await db
        .select()
        .from(standings)
        .where(
          and(
            eq(standings.competitionId, competitionId),
            eq(standings.season, currentSeason),
            eq(standings.teamId, teamId)
          )
        );

      if (existing.length > 0) {
        await db.update(standings)
          .set({ ...standingData, lastUpdated: new Date() })
          .where(eq(standings.id, existing[0].id));
      } else {
        await db.insert(standings).values(standingData);
      }
    }

    // CRITICAL: Restore Italian Serie B team names after Ligue 1 sync
    if (isLigue1) {
      console.log("Restoring Italian Serie B team names in standings sync...");
      for (const [id, teamData] of Object.entries(SERIE_B_TEAMS)) {
        await db.update(teams)
          .set(teamData)
          .where(eq(teams.id, parseInt(id)));
      }
      console.log("Serie B team names restored");
    }

    console.log(`Synced ${table.length} standings entries for ${competitionCode}`);
  }

  async updateTeamFormAfterMatch(
    matchId: number,
    homeTeamId: number,
    awayTeamId: number,
    competitionId: number,
    homeScore: number,
    awayScore: number
  ): Promise<void> {
    // Determine match result from perspective of each team
    let homeResult: 'W' | 'D' | 'L';
    let awayResult: 'W' | 'D' | 'L';

    if (homeScore > awayScore) {
      homeResult = 'W';
      awayResult = 'L';
    } else if (homeScore < awayScore) {
      homeResult = 'L';
      awayResult = 'W';
    } else {
      homeResult = 'D';
      awayResult = 'D';
    }

    // Update home team form
    let homeTeamFormRecord = await db
      .select()
      .from(teamForm)
      .where(and(eq(teamForm.teamId, homeTeamId), eq(teamForm.competitionId, competitionId)))
      .limit(1)
      .then(r => r[0] ?? null);

    // Initialize team form if it doesn't exist (first match of the season)
    if (!homeTeamFormRecord) {
      console.log(`Team form not found for team ${homeTeamId}, initializing...`);
      const formData = {
        teamId: homeTeamId,
        competitionId: competitionId,
        recentForm: '',
        wins: 0,
        draws: 0,
        losses: 0,
        goalsScored: 0,
        goalsConceded: 0,
      };
      const inserted = await db.insert(teamForm).values(formData).returning();
      homeTeamFormRecord = inserted[0];
    }

    // Update recent_form: add new result to the right, remove oldest if already 5
    let newHomeForm = homeTeamFormRecord.recentForm + homeResult;
    if (newHomeForm.length > 5) {
      newHomeForm = newHomeForm.slice(-5); // Keep only last 5
    }

    // Update counters
    const newHomeWins = homeTeamFormRecord.wins + (homeResult === 'W' ? 1 : 0);
    const newHomeDraws = homeTeamFormRecord.draws + (homeResult === 'D' ? 1 : 0);
    const newHomeLosses = homeTeamFormRecord.losses + (homeResult === 'L' ? 1 : 0);

    await db.update(teamForm)
      .set({
        recentForm: newHomeForm,
        wins: newHomeWins,
        draws: newHomeDraws,
        losses: newHomeLosses,
        goalsScored: homeTeamFormRecord.goalsScored + homeScore,
        goalsConceded: homeTeamFormRecord.goalsConceded + awayScore,
        lastUpdated: new Date(),
      })
      .where(and(eq(teamForm.teamId, homeTeamId), eq(teamForm.competitionId, competitionId)));

    console.log(`Updated home team (${homeTeamId}) form: ${homeTeamFormRecord.recentForm} -> ${newHomeForm}`);

    // Update away team form
    let awayTeamFormRecord = await db
      .select()
      .from(teamForm)
      .where(and(eq(teamForm.teamId, awayTeamId), eq(teamForm.competitionId, competitionId)))
      .limit(1)
      .then(r => r[0] ?? null);

    // Initialize team form if it doesn't exist (first match of the season)
    if (!awayTeamFormRecord) {
      console.log(`Team form not found for team ${awayTeamId}, initializing...`);
      const formData = {
        teamId: awayTeamId,
        competitionId: competitionId,
        recentForm: '',
        wins: 0,
        draws: 0,
        losses: 0,
        goalsScored: 0,
        goalsConceded: 0,
      };
      const inserted = await db.insert(teamForm).values(formData).returning();
      awayTeamFormRecord = inserted[0];
    }

    // Update recent_form: add new result to the right, remove oldest if already 5
    let newAwayForm = awayTeamFormRecord.recentForm + awayResult;
    if (newAwayForm.length > 5) {
      newAwayForm = newAwayForm.slice(-5); // Keep only last 5
    }

    // Update counters
    const newAwayWins = awayTeamFormRecord.wins + (awayResult === 'W' ? 1 : 0);
    const newAwayDraws = awayTeamFormRecord.draws + (awayResult === 'D' ? 1 : 0);
    const newAwayLosses = awayTeamFormRecord.losses + (awayResult === 'L' ? 1 : 0);

    await db.update(teamForm)
      .set({
        recentForm: newAwayForm,
        wins: newAwayWins,
        draws: newAwayDraws,
        losses: newAwayLosses,
        goalsScored: awayTeamFormRecord.goalsScored + awayScore,
        goalsConceded: awayTeamFormRecord.goalsConceded + homeScore,
        lastUpdated: new Date(),
      })
      .where(and(eq(teamForm.teamId, awayTeamId), eq(teamForm.competitionId, competitionId)));

    console.log(`Updated away team (${awayTeamId}) form: ${awayTeamFormRecord.recentForm} -> ${newAwayForm}`);
  }

  async updatePredictionAccuracy(
    matchId: number,
    homeScore: number,
    awayScore: number,
    winner: string | null | undefined,
    homeScoreHT: number | null = null,
    awayScoreHT: number | null = null
  ): Promise<void> {
    const { learningSystem } = await import("./learning-system");

    const prediction = await db
      .select()
      .from(predictions)
      .where(eq(predictions.matchId, matchId))
      .orderBy(desc(predictions.createdAt))
      .limit(1)
      .then(r => r[0] ?? null);
    if (!prediction) return;

    const match = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1).then(r => r[0] ?? null);
    if (!match) return;

    // === FULL-TIME RESULTS ===
    const totalGoals = homeScore + awayScore;
    const bothTeamsScored = homeScore > 0 && awayScore > 0;

    // Determine actual FT result
    let actualResult: string;
    if (winner === 'HOME_TEAM') {
      actualResult = 'HOME_TEAM';
    } else if (winner === 'AWAY_TEAM') {
      actualResult = 'AWAY_TEAM';
    } else {
      actualResult = 'DRAW';
    }

    // === FT ACCURACY CHECKS ===
    const result1x2Correct = prediction.predictedWinner === actualResult;

    // Over 2.5 FT
    let resultOver25Correct: boolean | null = null;
    if (prediction.over25Probability !== null) {
      const predictedOver25 = parseFloat(prediction.over25Probability) > 50;
      resultOver25Correct = predictedOver25 === (totalGoals > 2.5);
    }

    // Over 3.5 FT
    let resultOver35Correct: boolean | null = null;
    if (prediction.over35Probability !== null) {
      const predictedOver35 = parseFloat(prediction.over35Probability) > 50;
      resultOver35Correct = predictedOver35 === (totalGoals > 3.5);
    }

    // BTTS FT
    let resultBttsCorrect: boolean | null = null;
    if (prediction.bttsYesProbability !== null && prediction.bttsNoProbability !== null) {
      const predictedBtts = parseFloat(prediction.bttsYesProbability) > parseFloat(prediction.bttsNoProbability);
      resultBttsCorrect = predictedBtts === bothTeamsScored;
    }

    // === HALF-TIME RESULTS ===
    let actualResultHT: string | null = null;
    let actualTotalGoalsHT: number | null = null;
    let actualBothTeamsScoredHT: boolean | null = null;
    let result1x2HTCorrect: boolean | null = null;
    let resultOver05HTCorrect: boolean | null = null;
    let resultOver15HTCorrect: boolean | null = null;
    let resultBttsHTCorrect: boolean | null = null;

    if (homeScoreHT !== null && awayScoreHT !== null) {
      actualTotalGoalsHT = homeScoreHT + awayScoreHT;
      actualBothTeamsScoredHT = homeScoreHT > 0 && awayScoreHT > 0;

      // Determine HT result
      if (homeScoreHT > awayScoreHT) {
        actualResultHT = 'HOME_TEAM';
      } else if (awayScoreHT > homeScoreHT) {
        actualResultHT = 'AWAY_TEAM';
      } else {
        actualResultHT = 'DRAW';
      }

      // === HT ACCURACY CHECKS ===
      if (prediction.predictedWinnerHT) {
        result1x2HTCorrect = prediction.predictedWinnerHT === actualResultHT;
      }

      // Over 0.5 HT
      if (prediction.over05HTProb !== null) {
        const predictedOver05HT = parseFloat(prediction.over05HTProb) > 50;
        resultOver05HTCorrect = predictedOver05HT === (actualTotalGoalsHT > 0.5);
      }

      // Over 1.5 HT
      if (prediction.over15HTProb !== null) {
        const predictedOver15HT = parseFloat(prediction.over15HTProb) > 50;
        resultOver15HTCorrect = predictedOver15HT === (actualTotalGoalsHT > 1.5);
      }

      // BTTS HT (note: schema has single bttsHTProb, assuming >50 means BTTS Yes)
      if (prediction.bttsHTProb !== null) {
        const predictedBttsHT = parseFloat(prediction.bttsHTProb) > 50;
        resultBttsHTCorrect = predictedBttsHT === actualBothTeamsScoredHT;
      }
    }

    // === CARDS & CORNERS ACCURACY CHECKS ===
    let resultCardsOver25Correct: boolean | null = null;
    let resultCardsOver45Correct: boolean | null = null;
    let resultCornersOver85Correct: boolean | null = null;
    let resultCornersOver105Correct: boolean | null = null;

    // Only calculate if actual stats are available
    if (prediction.actualTotalCards !== null) {
      // Cards Over 2.5
      if (prediction.totalCardsOver25Prob !== null) {
        const predictedCardsOver25 = parseFloat(prediction.totalCardsOver25Prob) > 50;
        resultCardsOver25Correct = predictedCardsOver25 === (prediction.actualTotalCards > 2.5);
      }

      // Cards Over 4.5
      if (prediction.totalCardsOver45Prob !== null) {
        const predictedCardsOver45 = parseFloat(prediction.totalCardsOver45Prob) > 50;
        resultCardsOver45Correct = predictedCardsOver45 === (prediction.actualTotalCards > 4.5);
      }
    }

    if (prediction.actualTotalCorners !== null) {
      // Corners Over 8.5
      if (prediction.totalCornersOver85Prob !== null) {
        const predictedCornersOver85 = parseFloat(prediction.totalCornersOver85Prob) > 50;
        resultCornersOver85Correct = predictedCornersOver85 === (prediction.actualTotalCorners > 8.5);
      }

      // Corners Over 10.5
      if (prediction.totalCornersOver105Prob !== null) {
        const predictedCornersOver105 = parseFloat(prediction.totalCornersOver105Prob) > 50;
        resultCornersOver105Correct = predictedCornersOver105 === (prediction.actualTotalCorners > 10.5);
      }
    }

    await db
      .update(predictions)
      .set({
        // FT Results
        actualResult,
        isCorrect: result1x2Correct,
        result1x2Correct,
        resultOver25Correct,
        resultOver35Correct,
        resultBttsCorrect,
        actualTotalGoals: totalGoals,
        actualBothTeamsScored: bothTeamsScored,
        // HT Results
        actualResultHT,
        actualTotalGoalsHT,
        actualBothTeamsScoredHT,
        result1x2HTCorrect,
        resultOver05HTCorrect,
        resultOver15HTCorrect,
        resultBttsHTCorrect,
        // Cards & Corners Results
        resultCardsOver25Correct,
        resultCardsOver45Correct,
        resultCornersOver85Correct,
        resultCornersOver105Correct,
      })
      .where(eq(predictions.id, prediction.id));

    // Update team form after match finishes (for both home and away teams)
    try {
      await this.updateTeamFormAfterMatch(
        matchId,
        match.homeTeamId,
        match.awayTeamId,
        match.competitionId,
        homeScore,
        awayScore
      );
    } catch (error) {
      console.error("Error updating team form:", error);
    }

    // Update learning system with results
    const updatedPrediction = await db
      .select()
      .from(predictions)
      .where(eq(predictions.matchId, matchId))
      .orderBy(desc(predictions.createdAt))
      .limit(1)
      .then(r => r[0] ?? null);
    if (updatedPrediction) {
      try {
        await learningSystem.updateFromResult(updatedPrediction, match);
      } catch (error) {
        console.error("Error updating learning system:", error);
      }
    }

    const htSummary = homeScoreHT !== null ? ` HT: 1X2=${result1x2HTCorrect}, O0.5=${resultOver05HTCorrect}, O1.5=${resultOver15HTCorrect}, BTTS=${resultBttsHTCorrect}` : '';
    const cardsSummary = prediction.actualTotalCards !== null ? ` Cards: O2.5=${resultCardsOver25Correct}, O4.5=${resultCardsOver45Correct}` : '';
    const cornersSummary = prediction.actualTotalCorners !== null ? ` Corners: O8.5=${resultCornersOver85Correct}, O10.5=${resultCornersOver105Correct}` : '';
    console.log(`Updated prediction accuracy for match ${matchId}: FT: 1X2=${result1x2Correct}, O2.5=${resultOver25Correct}, O3.5=${resultOver35Correct}, BTTS=${resultBttsCorrect}${htSummary}${cardsSummary}${cornersSummary}`);
  }
}

export const footballDataService = new FootballDataService();
