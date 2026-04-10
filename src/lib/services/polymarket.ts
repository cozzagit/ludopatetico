import { db } from "@/src/lib/db";
import { matches, teams, marketOdds } from "@/src/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  POLYMARKET_BASE_URL,
  POLYMARKET_TAG_IDS,
  COMPETITIONS,
} from "@/src/lib/constants";

// ── Types ──────────────────────────────────────────────────────────────

interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  outcomes: string; // JSON-encoded string, e.g. "[\"Yes\", \"No\"]"
  outcomePrices: string; // JSON-encoded string, e.g. "[\"0.735\", \"0.265\"]"
  volume: string;
  liquidity: string;
  active: boolean;
  closed: boolean;
  sportsMarketType?: string;
  groupItemTitle?: string;
  gameStartTime?: string;
}

interface PolymarketTeam {
  id: number;
  name: string;
  abbreviation: string;
  alias?: string;
  league: string;
  providerId?: number;
}

interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  startDate: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  volume: number;
  liquidity: number;
  markets: PolymarketMarket[];
  teams?: PolymarketTeam[];
  gameId?: number;
  score?: string;
  period?: string;
  eventDate?: string;
  startTime?: string;
}

interface ParsedMarketOdds {
  homeWinProb: number | null;
  drawProb: number | null;
  awayWinProb: number | null;
  over15Prob: number | null;
  over25Prob: number | null;
  over35Prob: number | null;
  bttsYesProb: number | null;
  homeWinProbHT: number | null;
  drawProbHT: number | null;
  awayWinProbHT: number | null;
  cornersOver85Prob: number | null;
  cornersOver105Prob: number | null;
  totalVolume: number;
  totalLiquidity: number;
}

// ── API Client ─────────────────────────────────────────────────────────

const RATE_LIMIT_DELAY = 200; // 200ms between requests (conservative)

async function fetchPolymarket(
  endpoint: string,
  params: Record<string, string | number | boolean>
): Promise<unknown> {
  const url = new URL(`${POLYMARKET_BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Polymarket API error: ${response.status} ${response.statusText} for ${url.pathname}`
    );
  }

  return response.json();
}

// ── Fetch Events for a Competition ─────────────────────────────────────

export async function fetchCompetitionEvents(
  competitionCode: string,
  options: { limit?: number; activeOnly?: boolean } = {}
): Promise<PolymarketEvent[]> {
  const tagId = POLYMARKET_TAG_IDS[competitionCode];
  if (!tagId) {
    console.warn(`No Polymarket tag ID for competition: ${competitionCode}`);
    return [];
  }

  const { limit = 50, activeOnly = true } = options;

  const params: Record<string, string | number | boolean> = {
    tag_id: tagId,
    limit,
    order: "startDate",
    ascending: true,
  };

  if (activeOnly) {
    params.active = true;
    params.closed = false;
  }

  const events = (await fetchPolymarket("/events", params)) as PolymarketEvent[];
  return events;
}

// ── Fetch All Soccer Events ────────────────────────────────────────────

export async function fetchAllSoccerEvents(
  options: { limit?: number } = {}
): Promise<PolymarketEvent[]> {
  const { limit = 100 } = options;

  const events = (await fetchPolymarket("/events", {
    tag_id: POLYMARKET_TAG_IDS.SOCCER,
    active: true,
    closed: false,
    limit,
    order: "startDate",
    ascending: true,
  })) as PolymarketEvent[];

  return events;
}

// ── Helpers for Polymarket JSON-encoded fields ────────────────────────

/**
 * Polymarket returns outcomes and outcomePrices as JSON-encoded strings,
 * e.g. "[\"0.735\", \"0.265\"]". This helper safely parses them into
 * a numeric array. Returns [] on any parse failure.
 */
function parseOutcomePrices(raw: string | string[] | undefined): number[] {
  if (!raw) return [];
  try {
    const arr: string[] = Array.isArray(raw) ? raw : JSON.parse(raw);
    return arr.map((v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    });
  } catch {
    return [];
  }
}

// ── Parse Market Odds from Event ───────────────────────────────────────

function parseMarketOdds(event: PolymarketEvent): ParsedMarketOdds {
  const result: ParsedMarketOdds = {
    homeWinProb: null,
    drawProb: null,
    awayWinProb: null,
    over15Prob: null,
    over25Prob: null,
    over35Prob: null,
    bttsYesProb: null,
    homeWinProbHT: null,
    drawProbHT: null,
    awayWinProbHT: null,
    cornersOver85Prob: null,
    cornersOver105Prob: null,
    totalVolume: event.volume || 0,
    totalLiquidity: event.liquidity || 0,
  };

  const homeTeam = event.teams?.[0];
  const awayTeam = event.teams?.[1];

  for (const market of event.markets) {
    if (!market.active || market.closed) continue;

    const prices = parseOutcomePrices(market.outcomePrices);
    const yesPrice = prices[0] ?? 0;
    if (yesPrice === 0) continue; // Skip markets with no valid price
    const marketType = market.sportsMarketType || "";
    const slug = market.slug || "";
    const question = market.question?.toLowerCase() || "";
    const groupTitle = market.groupItemTitle?.toLowerCase() || "";

    // Moneyline (1X2)
    if (marketType === "moneyline") {
      if (question.includes("draw") || groupTitle.includes("draw")) {
        result.drawProb = yesPrice;
      } else if (
        homeTeam &&
        (groupTitle.includes(homeTeam.name.toLowerCase()) ||
          groupTitle.includes(homeTeam.abbreviation.toLowerCase()) ||
          (homeTeam.alias && groupTitle.includes(homeTeam.alias.toLowerCase())))
      ) {
        result.homeWinProb = yesPrice;
      } else if (
        awayTeam &&
        (groupTitle.includes(awayTeam.name.toLowerCase()) ||
          groupTitle.includes(awayTeam.abbreviation.toLowerCase()) ||
          (awayTeam.alias && groupTitle.includes(awayTeam.alias.toLowerCase())))
      ) {
        result.awayWinProb = yesPrice;
      }
    }

    // Totals (Over/Under)
    if (marketType === "totals" || slug.includes("total")) {
      if (question.includes("1.5") || slug.includes("1-5")) {
        if (question.includes("over") || slug.includes("over")) {
          result.over15Prob = yesPrice;
        }
      } else if (question.includes("2.5") || slug.includes("2-5")) {
        if (question.includes("over") || slug.includes("over")) {
          result.over25Prob = yesPrice;
        }
      } else if (question.includes("3.5") || slug.includes("3-5")) {
        if (question.includes("over") || slug.includes("over")) {
          result.over35Prob = yesPrice;
        }
      }
    }

    // BTTS
    if (
      marketType === "both_teams_to_score" ||
      question.includes("both teams") ||
      slug.includes("btts")
    ) {
      result.bttsYesProb = yesPrice;
    }

    // Half-time
    if (
      marketType === "first_half_moneyline" ||
      marketType === "soccer_halftime_result" ||
      slug.includes("halftime") ||
      slug.includes("first-half")
    ) {
      if (question.includes("draw") || groupTitle.includes("draw")) {
        result.drawProbHT = yesPrice;
      } else if (
        homeTeam &&
        (groupTitle.includes(homeTeam.name.toLowerCase()) ||
          groupTitle.includes(homeTeam.abbreviation.toLowerCase()))
      ) {
        result.homeWinProbHT = yesPrice;
      } else if (
        awayTeam &&
        (groupTitle.includes(awayTeam.name.toLowerCase()) ||
          groupTitle.includes(awayTeam.abbreviation.toLowerCase()))
      ) {
        result.awayWinProbHT = yesPrice;
      }
    }

    // Corners
    if (marketType === "total_corners" || slug.includes("corner")) {
      if (question.includes("8.5") || slug.includes("8-5")) {
        result.cornersOver85Prob = yesPrice;
      } else if (question.includes("10.5") || slug.includes("10-5")) {
        result.cornersOver105Prob = yesPrice;
      }
    }
  }

  return result;
}

// ── Match Our DB Matches to Polymarket Events ──────────────────────────

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*fc\s*/g, " ")
    .replace(/\s*cf\s*/g, " ")
    .replace(/\s*afc\s*/g, " ")
    .replace(/\s*sc\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamsMatch(
  dbTeamName: string,
  polyTeam: PolymarketTeam
): boolean {
  const dbNorm = normalizeTeamName(dbTeamName);
  const polyNorm = normalizeTeamName(polyTeam.name);
  const polyAlias = polyTeam.alias ? normalizeTeamName(polyTeam.alias) : "";

  // Exact match
  if (dbNorm === polyNorm || dbNorm === polyAlias) return true;

  // Partial match (one contains the other)
  if (dbNorm.includes(polyNorm) || polyNorm.includes(dbNorm)) return true;
  if (polyAlias && (dbNorm.includes(polyAlias) || polyAlias.includes(dbNorm)))
    return true;

  // Key word matching (e.g. "Arsenal" in "Arsenal FC")
  const dbWords = dbNorm.split(" ").filter((w) => w.length > 3);
  const polyWords = polyNorm.split(" ").filter((w) => w.length > 3);
  const commonWords = dbWords.filter((w) => polyWords.includes(w));
  if (commonWords.length > 0 && commonWords.length >= Math.min(dbWords.length, polyWords.length))
    return true;

  return false;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
}

// ── Main Sync Function ─────────────────────────────────────────────────

interface SyncResult {
  competition: string;
  eventsFound: number;
  matchesMatched: number;
  oddsUpserted: number;
  errors: string[];
}

export async function syncMarketOdds(
  competitionCode?: string
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  // Determine which competitions to sync
  const compsToSync = competitionCode
    ? [competitionCode]
    : Object.values(COMPETITIONS).map((c) => c.code);

  for (const code of compsToSync) {
    const tagId = POLYMARKET_TAG_IDS[code];
    if (!tagId) {
      continue; // Skip competitions without Polymarket mapping
    }

    const result: SyncResult = {
      competition: code,
      eventsFound: 0,
      matchesMatched: 0,
      oddsUpserted: 0,
      errors: [],
    };

    try {
      // Fetch Polymarket events for this competition
      const events = await fetchCompetitionEvents(code);
      result.eventsFound = events.length;

      if (events.length === 0) {
        results.push(result);
        await delay(RATE_LIMIT_DELAY);
        continue;
      }

      // Get our upcoming matches for this competition
      const comp = Object.values(COMPETITIONS).find((c) => c.code === code);
      if (!comp) continue;

      const now = new Date();
      const futureDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days ahead

      const upcomingMatches = await db
        .select({
          match: matches,
          homeTeam: teams,
        })
        .from(matches)
        .innerJoin(teams, eq(matches.homeTeamId, teams.id))
        .where(
          and(
            eq(matches.competitionId, comp.id),
            gte(matches.utcDate, now),
            lte(matches.utcDate, futureDate),
            eq(matches.status, "TIMED")
          )
        );

      // Also fetch away team names
      const matchesWithTeams = await Promise.all(
        upcomingMatches.map(async (m) => {
          const [awayTeam] = await db
            .select()
            .from(teams)
            .where(eq(teams.id, m.match.awayTeamId));
          return { ...m, awayTeam };
        })
      );

      // Match Polymarket events to our matches
      for (const event of events) {
        if (!event.teams || event.teams.length < 2) continue;

        const polyHome = event.teams[0];
        const polyAway = event.teams[1];
        const eventDate = new Date(event.startTime || event.endDate);

        for (const { match, homeTeam, awayTeam } of matchesWithTeams) {
          if (!awayTeam) continue;

          const matchDate = new Date(match.utcDate);

          // Check if same day and teams match
          if (
            isSameDay(matchDate, eventDate) &&
            teamsMatch(homeTeam.name, polyHome) &&
            teamsMatch(awayTeam.name, polyAway)
          ) {
            // Parse odds from this event
            const odds = parseMarketOdds(event);

            // Upsert market odds
            await db
              .insert(marketOdds)
              .values({
                matchId: match.id,
                provider: "polymarket",
                eventId: event.id,
                eventSlug: event.slug,
                homeWinProb: odds.homeWinProb?.toFixed(4) ?? null,
                drawProb: odds.drawProb?.toFixed(4) ?? null,
                awayWinProb: odds.awayWinProb?.toFixed(4) ?? null,
                over15Prob: odds.over15Prob?.toFixed(4) ?? null,
                over25Prob: odds.over25Prob?.toFixed(4) ?? null,
                over35Prob: odds.over35Prob?.toFixed(4) ?? null,
                bttsYesProb: odds.bttsYesProb?.toFixed(4) ?? null,
                homeWinProbHT: odds.homeWinProbHT?.toFixed(4) ?? null,
                drawProbHT: odds.drawProbHT?.toFixed(4) ?? null,
                awayWinProbHT: odds.awayWinProbHT?.toFixed(4) ?? null,
                cornersOver85Prob: odds.cornersOver85Prob?.toFixed(4) ?? null,
                cornersOver105Prob: odds.cornersOver105Prob?.toFixed(4) ?? null,
                totalVolume: odds.totalVolume.toFixed(2),
                totalLiquidity: odds.totalLiquidity.toFixed(2),
                rawMarkets: event.markets.map((m) => {
                  let outcomes: string[] = [];
                  let prices: string[] = [];
                  try { outcomes = JSON.parse(m.outcomes || "[]"); } catch { /* keep empty */ }
                  try { prices = JSON.parse(m.outcomePrices || "[]"); } catch { /* keep empty */ }
                  return {
                    id: m.id,
                    question: m.question,
                    type: m.sportsMarketType,
                    outcomes,
                    prices,
                    volume: m.volume,
                  };
                }),
                gameStartTime: eventDate,
                lastUpdated: new Date(),
              })
              .onConflictDoUpdate({
                target: [marketOdds.matchId, marketOdds.provider],
                set: {
                  eventId: event.id,
                  eventSlug: event.slug,
                  homeWinProb: odds.homeWinProb?.toFixed(4) ?? null,
                  drawProb: odds.drawProb?.toFixed(4) ?? null,
                  awayWinProb: odds.awayWinProb?.toFixed(4) ?? null,
                  over15Prob: odds.over15Prob?.toFixed(4) ?? null,
                  over25Prob: odds.over25Prob?.toFixed(4) ?? null,
                  over35Prob: odds.over35Prob?.toFixed(4) ?? null,
                  bttsYesProb: odds.bttsYesProb?.toFixed(4) ?? null,
                  homeWinProbHT: odds.homeWinProbHT?.toFixed(4) ?? null,
                  drawProbHT: odds.drawProbHT?.toFixed(4) ?? null,
                  awayWinProbHT: odds.awayWinProbHT?.toFixed(4) ?? null,
                  cornersOver85Prob: odds.cornersOver85Prob?.toFixed(4) ?? null,
                  cornersOver105Prob: odds.cornersOver105Prob?.toFixed(4) ?? null,
                  totalVolume: odds.totalVolume.toFixed(2),
                  totalLiquidity: odds.totalLiquidity.toFixed(2),
                  rawMarkets: event.markets.map((m) => {
                    let outcomes: string[] = [];
                    let prices: string[] = [];
                    try { outcomes = Array.isArray(m.outcomes) ? m.outcomes : JSON.parse(m.outcomes || "[]"); } catch { /* keep empty */ }
                    try { prices = Array.isArray(m.outcomePrices) ? m.outcomePrices : JSON.parse(m.outcomePrices || "[]"); } catch { /* keep empty */ }
                    return {
                      id: m.id,
                      question: m.question,
                      type: m.sportsMarketType,
                      outcomes,
                      prices,
                      volume: m.volume,
                    };
                  }),
                  gameStartTime: eventDate,
                  lastUpdated: new Date(),
                },
              });

            result.matchesMatched++;
            result.oddsUpserted++;
            break; // Found match, move to next event
          }
        }
      }
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : "Unknown error"
      );
    }

    results.push(result);
    await delay(RATE_LIMIT_DELAY);
  }

  return results;
}

// ── Get Market Odds for a Match ────────────────────────────────────────

export async function getMarketOddsForMatch(
  matchId: number
): Promise<(typeof marketOdds.$inferSelect)[]> {
  return db
    .select()
    .from(marketOdds)
    .where(eq(marketOdds.matchId, matchId));
}

// ── Helpers ────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
