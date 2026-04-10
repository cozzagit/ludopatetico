import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, decimal, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table with local authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").notNull().unique(),
  password: text("password").notNull(),
  email: varchar("email").notNull().unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isPremium: boolean("is_premium").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Competitions (Serie A, Champions League, etc.)
export const competitions = pgTable("competitions", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(),
  emblem: text("emblem"),
});

export const insertCompetitionSchema = createInsertSchema(competitions);
export type InsertCompetition = z.infer<typeof insertCompetitionSchema>;
export type Competition = typeof competitions.$inferSelect;

// Teams
export const teams = pgTable("teams", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  tla: text("tla"),
  crest: text("crest"),
  fifaRanking: integer("fifa_ranking"), // FIFA ranking for national teams (null for clubs)
});

export const insertTeamSchema = createInsertSchema(teams);
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

// Matches
export const matches = pgTable("matches", {
  id: integer("id").primaryKey(),
  competitionId: integer("competition_id").notNull().references(() => competitions.id),
  utcDate: timestamp("utc_date").notNull(),
  status: text("status").notNull(),
  matchday: integer("matchday"),
  stage: text("stage"),
  homeTeamId: integer("home_team_id").notNull().references(() => teams.id),
  awayTeamId: integer("away_team_id").notNull().references(() => teams.id),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  // Half-time scores for first half predictions
  homeScoreHT: integer("home_score_ht"),
  awayScoreHT: integer("away_score_ht"),
  winner: text("winner"),
  duration: text("duration"),
  // Cross-API mapping: API-Football fixture ID for statistics retrieval
  apiFootballFixtureId: integer("api_football_fixture_id"),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const insertMatchSchema = createInsertSchema(matches);
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matches.$inferSelect;

// Match Statistics
export const matchStats = pgTable("match_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matchId: integer("match_id").notNull().references(() => matches.id),
  homePossession: integer("home_possession"),
  awayPossession: integer("away_possession"),
  homeShots: integer("home_shots"),
  awayShots: integer("away_shots"),
  homeShotsOnTarget: integer("home_shots_on_target"),
  awayShotsOnTarget: integer("away_shots_on_target"),
  homeCorners: integer("home_corners"),
  awayCorners: integer("away_corners"),
  homeFouls: integer("home_fouls"),
  awayFouls: integer("away_fouls"),
  homeYellowCards: integer("home_yellow_cards"),
  awayYellowCards: integer("away_yellow_cards"),
  homeRedCards: integer("home_red_cards"),
  awayRedCards: integer("away_red_cards"),
});

export const insertMatchStatsSchema = createInsertSchema(matchStats).omit({
  id: true,
});

export type InsertMatchStats = z.infer<typeof insertMatchStatsSchema>;
export type MatchStats = typeof matchStats.$inferSelect;

// AI Predictions
export const predictions = pgTable("predictions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matchId: integer("match_id").notNull().references(() => matches.id),
  predictedWinner: text("predicted_winner").notNull(),
  doubleChance: text("double_chance"), // "1X", "X2", "12" or null
  homeWinProbability: decimal("home_win_probability", { precision: 5, scale: 2 }).notNull(),
  drawProbability: decimal("draw_probability", { precision: 5, scale: 2 }).notNull(),
  awayWinProbability: decimal("away_win_probability", { precision: 5, scale: 2 }).notNull(),
  predictedHomeScore: decimal("predicted_home_score", { precision: 3, scale: 1 }),
  predictedAwayScore: decimal("predicted_away_score", { precision: 3, scale: 1 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  keyFactors: jsonb("key_factors"),
  // Additional betting markets
  over15Probability: decimal("over15_probability", { precision: 5, scale: 2 }),
  over25Probability: decimal("over25_probability", { precision: 5, scale: 2 }),
  over35Probability: decimal("over35_probability", { precision: 5, scale: 2 }),
  under15Probability: decimal("under15_probability", { precision: 5, scale: 2 }),
  under25Probability: decimal("under25_probability", { precision: 5, scale: 2 }),
  under35Probability: decimal("under35_probability", { precision: 5, scale: 2 }),
  bttsYesProbability: decimal("btts_yes_probability", { precision: 5, scale: 2 }),
  bttsNoProbability: decimal("btts_no_probability", { precision: 5, scale: 2 }),
  // Half-time (HT) predictions
  predictedWinnerHT: text("predicted_winner_ht"), // "HOME_TEAM", "DRAW", "AWAY_TEAM"
  homeWinProbabilityHT: decimal("home_win_probability_ht", { precision: 5, scale: 2 }),
  drawProbabilityHT: decimal("draw_probability_ht", { precision: 5, scale: 2 }),
  awayWinProbabilityHT: decimal("away_win_probability_ht", { precision: 5, scale: 2 }),
  predictedHomeScoreHT: decimal("predicted_home_score_ht", { precision: 3, scale: 1 }),
  predictedAwayScoreHT: decimal("predicted_away_score_ht", { precision: 3, scale: 1 }),
  over05HTProb: decimal("over05_ht_prob", { precision: 5, scale: 2 }), // Over 0.5 goals HT
  over15HTProb: decimal("over15_ht_prob", { precision: 5, scale: 2 }), // Over 1.5 goals HT
  under05HTProb: decimal("under05_ht_prob", { precision: 5, scale: 2 }), // Under 0.5 goals HT
  under15HTProb: decimal("under15_ht_prob", { precision: 5, scale: 2 }), // Under 1.5 goals HT
  bttsHTProb: decimal("btts_ht_prob", { precision: 5, scale: 2 }), // Both teams to score HT
  recommendedBets: jsonb("recommended_bets"), // Array of recommended bets with reasoning
  isPremium: boolean("is_premium").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Result tracking fields - Full Time
  actualResult: text("actual_result"), // "HOME_WIN", "DRAW", "AWAY_WIN"
  isCorrect: boolean("is_correct"), // Overall correctness (1X2)
  result1x2Correct: boolean("result_1x2_correct"), // 1X2 prediction correct
  resultOver25Correct: boolean("result_over25_correct"), // Over 2.5 prediction correct
  resultOver35Correct: boolean("result_over35_correct"), // Over 3.5 prediction correct
  resultBttsCorrect: boolean("result_btts_correct"), // BTTS prediction correct
  actualTotalGoals: integer("actual_total_goals"), // Total goals in match
  actualBothTeamsScored: boolean("actual_both_teams_scored"), // Both teams scored
  // Result tracking fields - Half Time
  actualResultHT: text("actual_result_ht"), // "HOME_WIN", "DRAW", "AWAY_WIN"
  result1x2HTCorrect: boolean("result_1x2_ht_correct"), // 1X2 HT prediction correct
  resultOver05HTCorrect: boolean("result_over05_ht_correct"), // Over 0.5 HT correct
  resultOver15HTCorrect: boolean("result_over15_ht_correct"), // Over 1.5 HT correct
  resultBttsHTCorrect: boolean("result_btts_ht_correct"), // BTTS HT correct
  actualTotalGoalsHT: integer("actual_total_goals_ht"), // Total goals at HT
  actualBothTeamsScoredHT: boolean("actual_both_teams_scored_ht"), // Both scored at HT
  // Cards & Corners predictions
  predictedTotalCards: decimal("predicted_total_cards", { precision: 4, scale: 1 }), // Total yellow + red cards
  totalCardsOver25Prob: decimal("total_cards_over25_prob", { precision: 5, scale: 2 }), // Over 2.5 cards
  totalCardsOver45Prob: decimal("total_cards_over45_prob", { precision: 5, scale: 2 }), // Over 4.5 cards
  predictedTotalCorners: decimal("predicted_total_corners", { precision: 4, scale: 1 }), // Total corners
  totalCornersOver85Prob: decimal("total_corners_over85_prob", { precision: 5, scale: 2 }), // Over 8.5 corners
  totalCornersOver105Prob: decimal("total_corners_over105_prob", { precision: 5, scale: 2 }), // Over 10.5 corners
  isRoughMatch: boolean("is_rough_match"), // High probability of many cards (rough game)
  // Result tracking - Cards & Corners
  actualTotalCards: integer("actual_total_cards"), // Actual cards in match
  actualTotalCorners: integer("actual_total_corners"), // Actual corners in match
  resultCardsOver25Correct: boolean("result_cards_over25_correct"), // Cards Over 2.5 correct
  resultCardsOver45Correct: boolean("result_cards_over45_correct"), // Cards Over 4.5 correct
  resultCornersOver85Correct: boolean("result_corners_over85_correct"), // Corners Over 8.5 correct
  resultCornersOver105Correct: boolean("result_corners_over105_correct"), // Corners Over 10.5 correct
});

export const insertPredictionSchema = createInsertSchema(predictions).omit({
  id: true,
  createdAt: true,
});

export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type Prediction = typeof predictions.$inferSelect;

// Team Form (last 5 matches)
export const teamForm = pgTable("team_form", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: integer("team_id").notNull().references(() => teams.id),
  competitionId: integer("competition_id").notNull().references(() => competitions.id),
  recentForm: text("recent_form").notNull(),
  wins: integer("wins").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  goalsScored: integer("goals_scored").notNull().default(0),
  goalsConceded: integer("goals_conceded").notNull().default(0),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const insertTeamFormSchema = createInsertSchema(teamForm).omit({
  id: true,
  lastUpdated: true,
});

export type InsertTeamForm = z.infer<typeof insertTeamFormSchema>;
export type TeamForm = typeof teamForm.$inferSelect;

// Prediction Performance Tracking (Learning System)
export const predictionPerformance = pgTable("prediction_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marketType: text("market_type").notNull(), // "1X2", "OVER_25", "OVER_35", "BTTS", "1X2_HT", "OVER_05_HT", "OVER_15_HT", "BTTS_HT"
  competitionId: integer("competition_id").references(() => competitions.id), // Null for global
  teamId: integer("team_id").references(() => teams.id), // Null for global
  totalPredictions: integer("total_predictions").notNull().default(0),
  correctPredictions: integer("correct_predictions").notNull().default(0),
  accuracy: decimal("accuracy", { precision: 5, scale: 2 }).notNull().default("0"),
  // Adaptive weights for AI model
  confidenceAdjustment: decimal("confidence_adjustment", { precision: 5, scale: 2 }).notNull().default("1.00"),
  weights: jsonb("weights"), // JSONB storing adaptive algorithm weights
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  // Recent performance (last 10 predictions)
  recentAccuracy: decimal("recent_accuracy", { precision: 5, scale: 2 }),
  recentResults: text("recent_results").array(), // ["W", "L", "W", "W", "L", ...] last 10
});

export const insertPredictionPerformanceSchema = createInsertSchema(predictionPerformance).omit({
  id: true,
  lastUpdated: true,
});

export type InsertPredictionPerformance = z.infer<typeof insertPredictionPerformanceSchema>;
export type PredictionPerformance = typeof predictionPerformance.$inferSelect;

// Standings (League Tables)
export const standings = pgTable("standings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  competitionId: integer("competition_id").notNull().references(() => competitions.id),
  season: integer("season").notNull(), // e.g., 2024, 2025
  teamId: integer("team_id").notNull().references(() => teams.id),
  position: integer("position").notNull(),
  playedGames: integer("played_games").notNull().default(0),
  won: integer("won").notNull().default(0),
  draw: integer("draw").notNull().default(0),
  lost: integer("lost").notNull().default(0),
  points: integer("points").notNull().default(0),
  goalsFor: integer("goals_for").notNull().default(0),
  goalsAgainst: integer("goals_against").notNull().default(0),
  goalDifference: integer("goal_difference").notNull().default(0),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const insertStandingSchema = createInsertSchema(standings).omit({
  id: true,
  lastUpdated: true,
});

export type InsertStanding = z.infer<typeof insertStandingSchema>;
export type Standing = typeof standings.$inferSelect;

// External IDs - Mapping between different data providers
export const externalIds = pgTable("external_ids", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // 'competition', 'team', 'match'
  entityId: text("entity_id").notNull(), // Our internal ID (from Football-Data.org)
  provider: text("provider").notNull(), // 'football-data', 'api-football', 'sofascore'
  externalId: text("external_id").notNull(), // ID used by the external provider
  metadata: jsonb("metadata"), // Additional data (e.g., team names, match date for verification)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_external_ids_lookup").on(table.entityType, table.entityId, table.provider),
  index("idx_external_ids_reverse").on(table.provider, table.externalId),
]);

export const insertExternalIdSchema = createInsertSchema(externalIds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExternalId = z.infer<typeof insertExternalIdSchema>;
export type ExternalId = typeof externalIds.$inferSelect;

// PayPal Transactions - Track premium subscriptions and payments
export const paypalTransactions = pgTable("paypal_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  paypalOrderId: text("paypal_order_id").notNull().unique(),
  paypalPayerId: text("paypal_payer_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  status: text("status").notNull(), // "CREATED", "APPROVED", "COMPLETED", "FAILED"
  subscriptionStartDate: timestamp("subscription_start_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  autoRenew: boolean("auto_renew").notNull().default(false),
  reminderSentAt: timestamp("reminder_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_paypal_user_id").on(table.userId),
  index("idx_paypal_status").on(table.status),
]);

export const insertPaypalTransactionSchema = createInsertSchema(paypalTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPaypalTransaction = z.infer<typeof insertPaypalTransactionSchema>;
export type PaypalTransaction = typeof paypalTransactions.$inferSelect;

// Player Injuries and Suspensions - Track unavailable players for predictions
export const injuries = pgTable("injuries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: integer("team_id").notNull().references(() => teams.id),
  playerId: integer("player_id"),
  playerName: text("player_name").notNull(),
  playerPhoto: text("player_photo"),
  type: text("type").notNull(), // "injury", "suspension", "doubtful"
  reason: text("reason").notNull(), // e.g. "Knee Injury", "Red Card", "Illness"
  severity: text("severity"), // "minor", "major", "long_term"
  expectedReturn: timestamp("expected_return"),
  fixtureId: integer("fixture_id"), // Next fixture player will miss (API-Football fixture ID)
  matchId: integer("match_id").references(() => matches.id), // Our match ID if mapped
  leagueId: integer("league_id"), // API-Football league ID
  season: integer("season"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_injuries_team").on(table.teamId),
  index("idx_injuries_match").on(table.matchId),
  index("idx_injuries_active").on(table.isActive),
]);

export const insertInjurySchema = createInsertSchema(injuries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInjury = z.infer<typeof insertInjurySchema>;
export type Injury = typeof injuries.$inferSelect;

// Blockchain Prediction Market Odds (Polymarket, Azuro, etc.)
export const marketOdds = pgTable("market_odds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matchId: integer("match_id").notNull().references(() => matches.id),
  provider: text("provider").notNull(), // "polymarket", "azuro", "overtime"
  // Polymarket-specific fields
  eventId: text("event_id"), // Polymarket event ID
  eventSlug: text("event_slug"), // e.g. "epl-ars-che-2026-04-10"
  // 1X2 probabilities from market prices (decimal 0-1)
  homeWinProb: decimal("home_win_prob", { precision: 5, scale: 4 }),
  drawProb: decimal("draw_prob", { precision: 5, scale: 4 }),
  awayWinProb: decimal("away_win_prob", { precision: 5, scale: 4 }),
  // Over/Under totals
  over15Prob: decimal("over15_prob", { precision: 5, scale: 4 }),
  over25Prob: decimal("over25_prob", { precision: 5, scale: 4 }),
  over35Prob: decimal("over35_prob", { precision: 5, scale: 4 }),
  // BTTS
  bttsYesProb: decimal("btts_yes_prob", { precision: 5, scale: 4 }),
  // Half-time
  homeWinProbHT: decimal("home_win_prob_ht", { precision: 5, scale: 4 }),
  drawProbHT: decimal("draw_prob_ht", { precision: 5, scale: 4 }),
  awayWinProbHT: decimal("away_win_prob_ht", { precision: 5, scale: 4 }),
  // Corners
  cornersOver85Prob: decimal("corners_over85_prob", { precision: 5, scale: 4 }),
  cornersOver105Prob: decimal("corners_over105_prob", { precision: 5, scale: 4 }),
  // Trading volume and liquidity (indicates market confidence)
  totalVolume: decimal("total_volume", { precision: 12, scale: 2 }),
  totalLiquidity: decimal("total_liquidity", { precision: 12, scale: 2 }),
  // Raw market data for reference
  rawMarkets: jsonb("raw_markets"),
  // Metadata
  gameStartTime: timestamp("game_start_time"),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_market_odds_match").on(table.matchId),
  index("idx_market_odds_provider").on(table.provider),
  index("idx_market_odds_event").on(table.eventId),
  unique("uq_market_odds_match_provider").on(table.matchId, table.provider),
]);

export const insertMarketOddsSchema = createInsertSchema(marketOdds).omit({
  id: true,
  createdAt: true,
});

export type InsertMarketOdds = z.infer<typeof insertMarketOddsSchema>;
export type MarketOdds = typeof marketOdds.$inferSelect;

// User Favorites
export const userFavorites = pgTable("user_favorites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  teamId: integer("team_id").notNull().references(() => teams.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type UserFavorite = typeof userFavorites.$inferSelect;

// Saved Schedine — tracking generated schedine and their results
export const savedSchedine = pgTable("saved_schedine", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // What type of schedina
  type: text("type").notNull(), // 'safe', 'moderate', 'bold', 'X_SICURA', 'X_BILANCIATA', 'X_RISCHIOSA'
  label: text("label").notNull(),
  // When it was generated
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  // Target date (the match day)
  targetDate: text("target_date").notNull(), // YYYY-MM-DD
  // The bets as JSON array
  bets: jsonb("bets").notNull(), // Array of bet objects with matchId, teams, bet type, probability etc.
  // Combined stats at generation time
  combinedProbability: decimal("combined_probability", { precision: 6, scale: 2 }),
  totalBets: integer("total_bets").notNull(),
  // Results (filled later when matches finish)
  checkedAt: timestamp("checked_at"),
  correctBets: integer("correct_bets"),
  wrongBets: integer("wrong_bets"),
  pendingBets: integer("pending_bets"),
  isWin: boolean("is_win"), // all bets correct = true
  // Per-bet results stored as JSON
  betResults: jsonb("bet_results"), // Array matching bets, with {correct: bool, actualResult: string}
}, (table) => [
  index("idx_saved_schedine_type_date").on(table.type, table.targetDate),
  index("idx_saved_schedine_checked").on(table.checkedAt),
]);

export const insertSavedSchedinaSchema = createInsertSchema(savedSchedine).omit({
  id: true,
  generatedAt: true,
});
export type InsertSavedSchedina = z.infer<typeof insertSavedSchedinaSchema>;
export type SavedSchedina = typeof savedSchedine.$inferSelect;
