/**
 * Shared helpers for prediction data across route handlers.
 */

/**
 * Redact premium prediction data for non-premium users.
 * Returns a prediction object with sensitive fields zeroed out.
 */
export function redactPremiumPrediction(prediction: any): any {
  // For highlights: convert to qualitative tags (high/low) without revealing exact numbers
  const over25 = parseFloat(prediction.over25Probability || '0');
  const bttsYes = parseFloat(prediction.bttsYesProbability || '0');
  const over15 = parseFloat(prediction.over15Probability || '0');
  const over35 = parseFloat(prediction.over35Probability || '0');

  return {
    id: prediction.id,
    matchId: prediction.matchId,
    predictedWinner: prediction.predictedWinner,
    homeWinProbability: '0',
    drawProbability: '0',
    awayWinProbability: '0',
    predictedHomeScore: null,
    predictedAwayScore: null,
    confidence: '0',
    keyFactors: null,
    isPremium: prediction.isPremium,
    createdAt: prediction.createdAt,
    actualResult: prediction.actualResult,
    isCorrect: prediction.isCorrect,
    // Qualitative highlights (show thresholds, not exact values)
    over15Probability: over15 >= 80 ? '80' : '0',
    over25Probability: over25 >= 60 ? '60' : over25 <= 35 && over25 > 0 ? '35' : '0',
    over35Probability: over35 >= 55 ? '55' : '0',
    bttsYesProbability: bttsYes >= 60 ? '60' : bttsYes <= 38 && bttsYes > 0 ? '38' : '0',
    bttsNoProbability: bttsYes > 0 && bttsYes <= 38 ? '62' : '0',
    doubleChance: prediction.doubleChance,
    isRoughMatch: prediction.isRoughMatch,
    totalCardsOver45Prob: '0',
    totalCornersOver105Prob: '0',
  };
}
