import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, predictions } from '@/src/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
import { footballDataService } from '@/src/lib/services/football-data';
import { learningSystem } from '@/src/lib/services/learning-system';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).isAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    console.log('Starting accuracy calculation for all finished matches...');

    // Get stats before processing
    const statsBeforeResult = await db
      .select({
        totalFinished: sql<number>`COUNT(DISTINCT ${matches.id})`,
        withPredictions: sql<number>`COUNT(DISTINCT CASE WHEN ${predictions.id} IS NOT NULL THEN ${matches.id} END)`,
        withAccuracy: sql<number>`COUNT(DISTINCT CASE WHEN ${predictions.result1x2Correct} IS NOT NULL THEN ${matches.id} END)`,
        pendingAccuracy: sql<number>`COUNT(DISTINCT CASE WHEN ${predictions.id} IS NOT NULL AND ${predictions.result1x2Correct} IS NULL THEN ${matches.id} END)`,
      })
      .from(matches)
      .leftJoin(predictions, eq(predictions.matchId, matches.id))
      .where(eq(matches.status, 'FINISHED'));

    const statsBefore = statsBeforeResult[0] || { totalFinished: 0, withPredictions: 0, withAccuracy: 0, pendingAccuracy: 0 };

    // Get all finished matches with predictions but without accuracy calculated
    const finishedMatches = await db
      .select({ match: matches })
      .from(matches)
      .innerJoin(predictions, eq(predictions.matchId, matches.id))
      .where(
        and(
          eq(matches.status, 'FINISHED'),
          sql`${predictions.result1x2Correct} IS NULL`
        )
      )
      .orderBy(desc(matches.utcDate))
      .then((r) => r.map((row) => row.match));

    console.log(`Found ${finishedMatches.length} finished matches to process`);
    console.log(`Stats: ${statsBefore.totalFinished} finished, ${statsBefore.withPredictions} with predictions, ${statsBefore.withAccuracy} with accuracy, ${statsBefore.pendingAccuracy} pending`);

    let successCount = 0;
    let errorCount = 0;

    for (const match of finishedMatches) {
      try {
        if (match.homeScore === null || match.awayScore === null) continue;

        await footballDataService.updatePredictionAccuracy(
          match.id,
          match.homeScore,
          match.awayScore,
          match.winner ?? null,
          match.homeScoreHT ?? null,
          match.awayScoreHT ?? null
        );

        // Update learning system
        const prediction = await db
          .select()
          .from(predictions)
          .where(eq(predictions.matchId, match.id))
          .orderBy(desc(predictions.createdAt))
          .limit(1)
          .then((r) => r[0] ?? null);

        if (prediction && (prediction.result1x2Correct !== null || prediction.resultOver25Correct !== null)) {
          await learningSystem.updateFromResult(prediction, match);
        }

        successCount++;
      } catch (error) {
        console.error(`Error processing match ${match.id}:`, error);
        errorCount++;
      }
    }

    // Get stats after processing
    const statsAfterResult = await db
      .select({
        totalFinished: sql<number>`COUNT(DISTINCT ${matches.id})`,
        withPredictions: sql<number>`COUNT(DISTINCT CASE WHEN ${predictions.id} IS NOT NULL THEN ${matches.id} END)`,
        withAccuracy: sql<number>`COUNT(DISTINCT CASE WHEN ${predictions.result1x2Correct} IS NOT NULL THEN ${matches.id} END)`,
        pendingAccuracy: sql<number>`COUNT(DISTINCT CASE WHEN ${predictions.id} IS NOT NULL AND ${predictions.result1x2Correct} IS NULL THEN ${matches.id} END)`,
      })
      .from(matches)
      .leftJoin(predictions, eq(predictions.matchId, matches.id))
      .where(eq(matches.status, 'FINISHED'));

    const statsAfter = statsAfterResult[0] || { totalFinished: 0, withPredictions: 0, withAccuracy: 0, pendingAccuracy: 0 };

    // Get prediction accuracy
    const allPredictions = await db.select().from(predictions).where(sql`${predictions.actualResult} IS NOT NULL`);
    const result1x2List = allPredictions.filter((p) => p.result1x2Correct !== null);
    const result1x2Correct = result1x2List.filter((p) => p.result1x2Correct === true).length;
    const accuracy1x2Percentage = result1x2List.length > 0 ? Math.round((result1x2Correct / result1x2List.length) * 100) : 0;

    console.log(`Accuracy calculation complete: ${successCount} success, ${errorCount} errors`);

    // Build detailed message
    let message = '';
    if (successCount > 0) {
      message = `${successCount} partite processate`;
    } else if (statsBefore.pendingAccuracy === 0) {
      message = `Tutte le ${statsBefore.withAccuracy} partite hanno gia l'accuracy calcolata (${accuracy1x2Percentage.toFixed(1)}% corrette)`;
    } else {
      message = 'Nessuna partita elaborata';
    }

    return NextResponse.json({
      message,
      processed: successCount,
      errors: errorCount,
      stats: {
        totalFinished: statsAfter.totalFinished,
        withPredictions: statsAfter.withPredictions,
        withAccuracy: statsAfter.withAccuracy,
        pendingAccuracy: statsAfter.pendingAccuracy,
        accuracy1x2Percentage,
      },
    });
  } catch (error) {
    console.error('Error calculating accuracy:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to calculate accuracy', details: error instanceof Error ? error.message : 'Unknown error' } },
      { status: 500 }
    );
  }
}
