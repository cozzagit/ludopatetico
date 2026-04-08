/**
 * Shared helpers for prediction data across route handlers.
 */

/**
 * Redact premium prediction data for non-premium users.
 * Returns a prediction object with sensitive fields zeroed out.
 */
export function redactPremiumPrediction(prediction: any): any {
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
    over15Probability: '0',
    over25Probability: '0',
    over35Probability: '0',
    bttsYesProbability: '0',
    bttsNoProbability: '0',
    totalCardsOver45Prob: '0',
    totalCornersOver105Prob: '0',
    isRoughMatch: false,
  };
}
