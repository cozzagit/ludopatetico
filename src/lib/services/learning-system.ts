import type { Prediction, Match, PredictionPerformance, InsertPredictionPerformance } from "@/src/lib/db/schema";
import { db } from "@/src/lib/db";
import { predictionPerformance, predictions } from "@/src/lib/db/schema";
import { eq, and, desc, sql, isNotNull } from "drizzle-orm";
import { TARGET_ACCURACIES } from "@/src/lib/constants";

export interface AdaptiveWeights {
  global: number;
  competition: number;
  homeTeam: number;
  awayTeam: number;
}

// Helper to get performance record with optional competitionId/teamId
async function getPerformanceRecord(
  marketType: string,
  competitionId?: number,
  teamId?: number
): Promise<PredictionPerformance | undefined> {
  const conditions = [eq(predictionPerformance.marketType, marketType)];

  if (competitionId !== undefined) {
    conditions.push(eq(predictionPerformance.competitionId, competitionId));
  } else {
    conditions.push(sql`${predictionPerformance.competitionId} IS NULL`);
  }

  if (teamId !== undefined) {
    conditions.push(eq(predictionPerformance.teamId, teamId));
  } else {
    conditions.push(sql`${predictionPerformance.teamId} IS NULL`);
  }

  const result = await db
    .select()
    .from(predictionPerformance)
    .where(and(...conditions));

  return result[0];
}

// Helper to map market type to prediction field
function getMarketFieldName(marketType: string): keyof typeof predictions.$inferSelect | null {
  const fieldMap: Record<string, keyof typeof predictions.$inferSelect> = {
    '1X2': 'result1x2Correct',
    'OVER_25': 'resultOver25Correct',
    'OVER_35': 'resultOver35Correct',
    'BTTS': 'resultBttsCorrect',
    '1X2_HT': 'result1x2HTCorrect',
    'OVER_05_HT': 'resultOver05HTCorrect',
    'OVER_15_HT': 'resultOver15HTCorrect',
    'BTTS_HT': 'resultBttsHTCorrect',
    'TOTAL_CARDS_OVER25': 'resultCardsOver25Correct',
    'TOTAL_CARDS_OVER45': 'resultCardsOver45Correct',
    'TOTAL_CORNERS_OVER85': 'resultCornersOver85Correct',
    'TOTAL_CORNERS_OVER105': 'resultCornersOver105Correct',
  };
  return fieldMap[marketType] || null;
}

// Helper to get REAL recent accuracy from actual predictions data
async function getRecentAccuracy(marketType: string, limit: number = 20): Promise<number | null> {
  const marketField = getMarketFieldName(marketType);
  if (!marketField) return null;

  const recentPredictions = await db
    .select({
      correct: sql<boolean>`${predictions[marketField]}`,
    })
    .from(predictions)
    .where(isNotNull(predictions[marketField]))
    .orderBy(desc(predictions.createdAt))
    .limit(limit);

  if (recentPredictions.length === 0) return null;

  const correctCount = recentPredictions.filter(p => p.correct === true).length;
  return parseFloat(((correctCount / recentPredictions.length) * 100).toFixed(2));
}

// Helper to update performance record with sigmoid-like confidence adjustment
async function updatePerformanceRecord(
  marketType: string,
  correct: boolean,
  competitionId?: number,
  teamId?: number
): Promise<void> {
  const existing = await getPerformanceRecord(marketType, competitionId, teamId);

  if (!existing) {
    // Create new record
    const newRecord: InsertPredictionPerformance = {
      marketType,
      competitionId: competitionId || null,
      teamId: teamId || null,
      totalPredictions: 1,
      correctPredictions: correct ? 1 : 0,
      accuracy: correct ? "100.00" : "0.00",
      confidenceAdjustment: "1.00",
      recentResults: [correct ? "W" : "L"],
    };

    // Upsert via insert
    await db.insert(predictionPerformance).values(newRecord);
    return;
  }

  // Update existing record
  const newTotal = existing.totalPredictions + 1;
  const newCorrect = existing.correctPredictions + (correct ? 1 : 0);
  const newAccuracy = ((newCorrect / newTotal) * 100).toFixed(2);

  // Update recent results (keep last 10)
  const recentResults = existing.recentResults || [];
  const newRecentResults = [correct ? "W" : "L", ...recentResults].slice(0, 10);
  const recentCorrectCount = newRecentResults.filter(r => r === "W").length;
  const recentAccuracy = ((recentCorrectCount / newRecentResults.length) * 100).toFixed(2);

  // Calculate adaptive confidence adjustment based on ABSOLUTE accuracy
  // Target accuracy varies by market type
  const target = TARGET_ACCURACIES[marketType] || 50;
  const recentAcc = parseFloat(recentAccuracy);
  const overallAcc = parseFloat(newAccuracy);

  // Use recent accuracy if enough samples, otherwise overall
  const effectiveAcc = newRecentResults.length >= 5 ? recentAcc : overallAcc;

  // Calculate adjustment: sigmoid-like curve around target
  // If accuracy >> target: boost confidence (up to 1.5x)
  // If accuracy << target: reduce confidence (down to 0.6x)
  const delta = effectiveAcc - target;
  let adjustment: number;

  if (delta >= 20) {
    adjustment = 1.5;  // Very high accuracy: max boost
  } else if (delta >= 10) {
    adjustment = 1.2 + (delta - 10) * 0.03;  // 1.2 to 1.5
  } else if (delta >= 0) {
    adjustment = 1.0 + delta * 0.02;  // 1.0 to 1.2
  } else if (delta >= -10) {
    adjustment = 1.0 + delta * 0.03;  // 0.7 to 1.0
  } else if (delta >= -20) {
    adjustment = 0.7 + (delta + 20) * 0.03;  // 0.6 to 0.7
  } else {
    adjustment = 0.6;  // Very low accuracy: max penalty
  }

  // Smooth transition: blend with previous adjustment (EMA-style)
  const prevAdjustment = parseFloat(existing.confidenceAdjustment);
  const smoothingFactor = 0.3; // 30% new, 70% old
  adjustment = prevAdjustment * (1 - smoothingFactor) + adjustment * smoothingFactor;

  // Clamp to bounds
  adjustment = Math.max(0.6, Math.min(1.5, adjustment));

  await db
    .update(predictionPerformance)
    .set({
      totalPredictions: newTotal,
      correctPredictions: newCorrect,
      accuracy: newAccuracy,
      recentAccuracy,
      recentResults: newRecentResults,
      confidenceAdjustment: adjustment.toFixed(2),
      lastUpdated: new Date(),
    })
    .where(eq(predictionPerformance.id, existing.id));
}

class LearningSystem {
  // Get adaptive weights for a specific market
  async getWeightsForMarket(
    marketType: string,
    competitionId: number,
    homeTeamId: number,
    awayTeamId: number
  ): Promise<AdaptiveWeights> {
    // Get global performance
    const globalPerf = await getPerformanceRecord(marketType);

    // Get competition-specific performance
    const compPerf = await getPerformanceRecord(marketType, competitionId);

    // Get team-specific performance
    const homePerf = await getPerformanceRecord(marketType, undefined, homeTeamId);
    const awayPerf = await getPerformanceRecord(marketType, undefined, awayTeamId);

    return {
      global: globalPerf ? parseFloat(globalPerf.confidenceAdjustment) : 1.0,
      competition: compPerf ? parseFloat(compPerf.confidenceAdjustment) : 1.0,
      homeTeam: homePerf ? parseFloat(homePerf.confidenceAdjustment) : 1.0,
      awayTeam: awayPerf ? parseFloat(awayPerf.confidenceAdjustment) : 1.0,
    };
  }

  // Calculate combined weight with priority: competition > global > team
  // Competition-specific data is most relevant, then global trends
  calculateCombinedWeight(weights: AdaptiveWeights): number {
    // Priority weights: competition has highest influence
    const priorities = {
      competition: 0.5,  // 50% weight
      global: 0.3,       // 30% weight
      homeTeam: 0.1,     // 10% weight
      awayTeam: 0.1,     // 10% weight
    };

    let totalWeight = 0;
    let totalPriority = 0;

    // Only include non-default weights in calculation
    if (weights.competition !== 1.0) {
      totalWeight += weights.competition * priorities.competition;
      totalPriority += priorities.competition;
    }
    if (weights.global !== 1.0) {
      totalWeight += weights.global * priorities.global;
      totalPriority += priorities.global;
    }
    if (weights.homeTeam !== 1.0) {
      totalWeight += weights.homeTeam * priorities.homeTeam;
      totalPriority += priorities.homeTeam;
    }
    if (weights.awayTeam !== 1.0) {
      totalWeight += weights.awayTeam * priorities.awayTeam;
      totalPriority += priorities.awayTeam;
    }

    // If no custom weights, return default
    if (totalPriority === 0) return 1.0;

    // Weighted average
    return totalWeight / totalPriority;
  }

  // Update learning system after match result
  async updateFromResult(prediction: Prediction, match: Match): Promise<void> {
    if (match.homeScore == null || match.awayScore == null) {
      console.log("Skipping learning update - incomplete full-time match data");
      return;
    }

    const competitionId = match.competitionId;
    const homeTeamId = match.homeTeamId;
    const awayTeamId = match.awayTeamId;

    // Update 1X2 Full Time
    if (prediction.result1x2Correct !== null) {
      await updatePerformanceRecord("1X2", prediction.result1x2Correct);
      await updatePerformanceRecord("1X2", prediction.result1x2Correct, competitionId);
      await updatePerformanceRecord("1X2", prediction.result1x2Correct, undefined, homeTeamId);
      await updatePerformanceRecord("1X2", prediction.result1x2Correct, undefined, awayTeamId);
    }

    // Update Over 2.5
    if (prediction.resultOver25Correct !== null) {
      await updatePerformanceRecord("OVER_25", prediction.resultOver25Correct);
      await updatePerformanceRecord("OVER_25", prediction.resultOver25Correct, competitionId);
    }

    // Update Over 3.5
    if (prediction.resultOver35Correct !== null) {
      await updatePerformanceRecord("OVER_35", prediction.resultOver35Correct);
      await updatePerformanceRecord("OVER_35", prediction.resultOver35Correct, competitionId);
    }

    // Update BTTS
    if (prediction.resultBttsCorrect !== null) {
      await updatePerformanceRecord("BTTS", prediction.resultBttsCorrect);
      await updatePerformanceRecord("BTTS", prediction.resultBttsCorrect, competitionId);
    }

    // Update Half-Time markets if available
    if (prediction.result1x2HTCorrect !== null) {
      await updatePerformanceRecord("1X2_HT", prediction.result1x2HTCorrect);
      await updatePerformanceRecord("1X2_HT", prediction.result1x2HTCorrect, competitionId);
    }

    if (prediction.resultOver05HTCorrect !== null) {
      await updatePerformanceRecord("OVER_05_HT", prediction.resultOver05HTCorrect);
      await updatePerformanceRecord("OVER_05_HT", prediction.resultOver05HTCorrect, competitionId);
    }

    if (prediction.resultOver15HTCorrect !== null) {
      await updatePerformanceRecord("OVER_15_HT", prediction.resultOver15HTCorrect);
      await updatePerformanceRecord("OVER_15_HT", prediction.resultOver15HTCorrect, competitionId);
    }

    if (prediction.resultBttsHTCorrect !== null) {
      await updatePerformanceRecord("BTTS_HT", prediction.resultBttsHTCorrect);
      await updatePerformanceRecord("BTTS_HT", prediction.resultBttsHTCorrect, competitionId);
    }

    // Update Cards Over 2.5
    if (prediction.resultCardsOver25Correct !== null) {
      await updatePerformanceRecord("TOTAL_CARDS_OVER25", prediction.resultCardsOver25Correct);
      await updatePerformanceRecord("TOTAL_CARDS_OVER25", prediction.resultCardsOver25Correct, competitionId);
    }

    // Update Cards Over 4.5
    if (prediction.resultCardsOver45Correct !== null) {
      await updatePerformanceRecord("TOTAL_CARDS_OVER45", prediction.resultCardsOver45Correct);
      await updatePerformanceRecord("TOTAL_CARDS_OVER45", prediction.resultCardsOver45Correct, competitionId);
    }

    // Update Corners Over 8.5
    if (prediction.resultCornersOver85Correct !== null) {
      await updatePerformanceRecord("TOTAL_CORNERS_OVER85", prediction.resultCornersOver85Correct);
      await updatePerformanceRecord("TOTAL_CORNERS_OVER85", prediction.resultCornersOver85Correct, competitionId);
    }

    // Update Corners Over 10.5
    if (prediction.resultCornersOver105Correct !== null) {
      await updatePerformanceRecord("TOTAL_CORNERS_OVER105", prediction.resultCornersOver105Correct);
      await updatePerformanceRecord("TOTAL_CORNERS_OVER105", prediction.resultCornersOver105Correct, competitionId);
    }

    console.log(`Learning system updated for match ${match.id}`);
  }

  /**
   * Learn from near-miss schedine — when only 1 bet was wrong in a schedina,
   * that specific bet type + competition gets extra negative weight to reduce
   * future confidence in similar borderline bets.
   *
   * Called from check-results when a schedina is classified as "quasi_vinta".
   */
  async learnFromNearMiss(wrongBets: Array<{
    betType: string;
    competitionId: number;
    homeTeamId: number;
    awayTeamId: number;
    probability: number;
  }>): Promise<void> {
    for (const bet of wrongBets) {
      // Map betType to learning market type
      const marketType = bet.betType.startsWith('DC_') ? '1X2'
        : bet.betType.startsWith('1X2_') ? '1X2'
        : bet.betType.startsWith('OVER_') ? 'OVER_25'
        : bet.betType.startsWith('UNDER_') ? 'OVER_25'
        : bet.betType.startsWith('BTTS_') ? 'BTTS'
        : bet.betType === 'X' ? '1X2'
        : null;

      if (!marketType) continue;

      // Register as a failed prediction at competition and team level
      // This adds extra negative signal beyond the normal per-match learning
      console.log(`[near-miss learning] ${bet.betType} failed in near-miss schedina (comp=${bet.competitionId}, prob=${bet.probability.toFixed(0)}%)`);

      // Double-count the failure for near-miss emphasis:
      // the logic is that a bet that ruins an otherwise perfect schedina
      // should be penalized more than a bet that fails in a completely lost schedina
      await updatePerformanceRecord(marketType, false, bet.competitionId);
      await updatePerformanceRecord(marketType, false, undefined, bet.homeTeamId);
      await updatePerformanceRecord(marketType, false, undefined, bet.awayTeamId);
    }

    if (wrongBets.length > 0) {
      console.log(`[near-miss learning] Applied extra penalties for ${wrongBets.length} near-miss bet(s)`);
    }
  }

  // Get performance summary for analytics
  async getPerformanceSummary(): Promise<{
    markets: Array<{
      marketType: string;
      accuracy: number;
      totalPredictions: number;
      recentAccuracy: number | null;
      confidenceAdjustment: number;
    }>;
    topPerformingMarkets: string[];
    needsImprovement: string[];
  }> {
    const allRecords = await db
      .select()
      .from(predictionPerformance)
      .orderBy(desc(predictionPerformance.accuracy));

    // Filter for global records only (no competition/team specific)
    const globalRecords = allRecords.filter(
      r => r.competitionId === null && r.teamId === null
    );

    // Calculate REAL recent accuracy from actual predictions data
    const markets = await Promise.all(globalRecords.map(async (record) => {
      const realRecentAccuracy = await getRecentAccuracy(record.marketType, 20);

      return {
        marketType: record.marketType,
        accuracy: parseFloat(record.accuracy),
        totalPredictions: record.totalPredictions,
        recentAccuracy: realRecentAccuracy, // Use REAL calculation instead of saved value
        confidenceAdjustment: parseFloat(record.confidenceAdjustment),
      };
    }));

    // Sort by accuracy
    const sorted = [...markets].sort((a, b) => b.accuracy - a.accuracy);

    const topPerformingMarkets = sorted
      .filter(m => m.accuracy >= 60)
      .map(m => m.marketType);

    const needsImprovement = sorted
      .filter(m => m.accuracy < 50 && m.totalPredictions >= 10)
      .map(m => m.marketType);

    return {
      markets,
      topPerformingMarkets,
      needsImprovement,
    };
  }

  // Get adaptive weights for a specific context
  async getAdaptiveWeights(
    competitionId: number,
    homeTeamId: number,
    awayTeamId: number
  ): Promise<Record<string, number>> {
    // Get all performance records and filter by team/competition
    const allPerformanceRecords = await db
      .select()
      .from(predictionPerformance)
      .orderBy(desc(predictionPerformance.accuracy));

    const homePerformance = allPerformanceRecords.filter(
      r => r.competitionId === competitionId && r.teamId === homeTeamId
    );
    const awayPerformance = allPerformanceRecords.filter(
      r => r.competitionId === competitionId && r.teamId === awayTeamId
    );
    const competitionPerformance = allPerformanceRecords.filter(
      r => r.competitionId === competitionId && !r.teamId
    );

    const allRecords = [...homePerformance, ...awayPerformance, ...competitionPerformance];

    if (allRecords.length === 0) {
      // Return default weights if no history
      return {
        weight_1x2: 1.0,
        weight_over25: 1.0,
        weight_over35: 1.0,
        weight_btts: 1.0,
      };
    }

    // Extract weights from all records and average them
    const weights: Record<string, number[]> = {};

    for (const record of allRecords) {
      if (record.weights) {
        const recordWeights = typeof record.weights === 'string'
          ? JSON.parse(record.weights)
          : record.weights;

        for (const [key, value] of Object.entries(recordWeights)) {
          if (!weights[key]) weights[key] = [];
          weights[key].push(value as number);
        }
      }
    }

    // Calculate average weights
    const avgWeights: Record<string, number> = {};
    for (const [key, values] of Object.entries(weights)) {
      avgWeights[key] = values.reduce((a, b) => a + b, 0) / values.length;
    }

    return avgWeights;
  }

  // Get per-market adaptive weights for post-LLM calibration
  // Returns composite weight for each market (default 1.0, typical range 0.8-1.2)
  // Weight >1.0 sharpens distribution (more confident), <1.0 flattens (less confident)
  async getMarketWeights(
    competitionId: number,
    homeTeamId: number,
    awayTeamId: number
  ): Promise<{
    weight_1x2: number;
    weight_btts: number;
    weight_over25: number;
    weight_over35: number;
    weight_1x2_ht: number;
    weight_over05_ht: number;
    weight_over15_ht: number;
    weight_cards: number;
    weight_corners: number;
  }> {
    // Fetch all market weights in parallel for efficiency
    const [
      weights_1x2,
      weights_btts,
      weights_over25,
      weights_over35,
      weights_1x2_ht,
      weights_over05_ht,
      weights_over15_ht,
      weights_cards_over25,
      weights_corners_over85
    ] = await Promise.all([
      this.getWeightsForMarket("1X2", competitionId, homeTeamId, awayTeamId),
      this.getWeightsForMarket("BTTS", competitionId, homeTeamId, awayTeamId),
      this.getWeightsForMarket("OVER_25", competitionId, homeTeamId, awayTeamId),
      this.getWeightsForMarket("OVER_35", competitionId, homeTeamId, awayTeamId),
      this.getWeightsForMarket("1X2_HT", competitionId, homeTeamId, awayTeamId),
      this.getWeightsForMarket("OVER_05_HT", competitionId, homeTeamId, awayTeamId),
      this.getWeightsForMarket("OVER_15_HT", competitionId, homeTeamId, awayTeamId),
      this.getWeightsForMarket("TOTAL_CARDS_OVER25", competitionId, homeTeamId, awayTeamId),
      this.getWeightsForMarket("TOTAL_CORNERS_OVER85", competitionId, homeTeamId, awayTeamId)
    ]);

    // Calculate combined weights with finite-number guards (coerce NaN/Infinity to 1.0)
    const safeWeight = (w: number) => Number.isFinite(w) && w > 0 ? w : 1.0;

    return {
      weight_1x2: safeWeight(this.calculateCombinedWeight(weights_1x2)),
      weight_btts: safeWeight(this.calculateCombinedWeight(weights_btts)),
      weight_over25: safeWeight(this.calculateCombinedWeight(weights_over25)),
      weight_over35: safeWeight(this.calculateCombinedWeight(weights_over35)),
      weight_1x2_ht: safeWeight(this.calculateCombinedWeight(weights_1x2_ht)),
      weight_over05_ht: safeWeight(this.calculateCombinedWeight(weights_over05_ht)),
      weight_over15_ht: safeWeight(this.calculateCombinedWeight(weights_over15_ht)),
      weight_cards: safeWeight(this.calculateCombinedWeight(weights_cards_over25)),
      weight_corners: safeWeight(this.calculateCombinedWeight(weights_corners_over85)),
    };
  }

  // Get market-specific insights
  async getMarketInsights(marketType: string): Promise<{
    global: any;
    byCompetition: Array<{ competitionId: number; accuracy: number; total: number }>;
    byTeam: Array<{ teamId: number; accuracy: number; total: number }>;
  }> {
    const allRecords = await db
      .select()
      .from(predictionPerformance)
      .orderBy(desc(predictionPerformance.accuracy));

    const globalRecord = allRecords.find(
      r => r.marketType === marketType && r.competitionId === null && r.teamId === null
    );

    const compRecords = allRecords
      .filter(r => r.marketType === marketType && r.competitionId !== null && r.teamId === null)
      .map(r => ({
        competitionId: r.competitionId!,
        accuracy: parseFloat(r.accuracy),
        total: r.totalPredictions,
      }));

    const teamRecords = allRecords
      .filter(r => r.marketType === marketType && r.teamId !== null && r.competitionId === null)
      .map(r => ({
        teamId: r.teamId!,
        accuracy: parseFloat(r.accuracy),
        total: r.totalPredictions,
      }))
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 20); // Top 20 teams

    // Calculate REAL recent accuracy
    const realRecentAccuracy = globalRecord
      ? await getRecentAccuracy(marketType, 20)
      : null;

    return {
      global: globalRecord ? {
        accuracy: parseFloat(globalRecord.accuracy),
        total: globalRecord.totalPredictions,
        recentAccuracy: realRecentAccuracy, // Use REAL calculation instead of saved value
        adjustment: parseFloat(globalRecord.confidenceAdjustment),
      } : null,
      byCompetition: compRecords,
      byTeam: teamRecords,
    };
  }
}

export const learningSystem = new LearningSystem();
