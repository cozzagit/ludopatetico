import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { predictionPerformance, competitions, matches, predictions } from '@/src/lib/db/schema';
import { eq, and, sql, isNotNull } from 'drizzle-orm';

export async function GET() {
  try {
    const results = await db
      .select({
        competitionId: predictionPerformance.competitionId,
        marketType: predictionPerformance.marketType,
        totalPredictions: predictionPerformance.totalPredictions,
        correctPredictions: predictionPerformance.correctPredictions,
        accuracy: predictionPerformance.accuracy,
        competitionName: competitions.name,
      })
      .from(predictionPerformance)
      .leftJoin(competitions, eq(predictionPerformance.competitionId, competitions.id))
      .where(sql`${predictionPerformance.competitionId} IS NOT NULL`)
      .orderBy(competitions.name, predictionPerformance.marketType);

    // Count unique matches per competition
    const matchCounts = await db
      .select({
        competitionId: sql<number>`${matches.competitionId}`,
        matchCount: sql<number>`COUNT(DISTINCT ${matches.id})`,
      })
      .from(matches)
      .innerJoin(predictions, eq(predictions.matchId, matches.id))
      .where(
        and(
          isNotNull(predictions.actualResult),
          isNotNull(matches.competitionId)
        )
      )
      .groupBy(matches.competitionId);

    const matchCountMap = new Map(
      matchCounts.map((mc) => [mc.competitionId, mc.matchCount])
    );

    const data = results.map((r) => ({
      competitionId: r.competitionId!,
      competitionName: r.competitionName || 'Unknown',
      marketType: r.marketType,
      totalPredictions: r.totalPredictions,
      correctPredictions: r.correctPredictions,
      accuracy: parseFloat(r.accuracy),
      totalMatches: matchCountMap.get(r.competitionId!) || 0,
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching accuracy by competition:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch accuracy data' } },
      { status: 500 }
    );
  }
}
