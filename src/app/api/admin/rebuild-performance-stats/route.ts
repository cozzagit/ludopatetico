import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, predictions, predictionPerformance } from '@/src/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
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

    console.log('Rebuilding performance statistics from scratch...');

    // Clear all existing performance records
    await db.delete(predictionPerformance);
    console.log('Cleared old performance data');

    // Get all predictions with results (for finished matches)
    const result = await db
      .select()
      .from(predictions)
      .innerJoin(matches, eq(predictions.matchId, matches.id))
      .where(eq(matches.status, 'FINISHED'))
      .orderBy(desc(matches.utcDate))
      .limit(1000);

    const allPredictions = result.map((r) => r.predictions);
    const verificate = allPredictions.filter((p) => p.actualResult !== null);

    console.log(`Found ${verificate.length} verified predictions to rebuild stats from`);

    // Process each verified prediction
    for (const prediction of verificate) {
      const match = await db
        .select()
        .from(matches)
        .where(eq(matches.id, prediction.matchId))
        .limit(1)
        .then((r) => r[0] ?? null);

      if (match && match.homeScore !== null && match.awayScore !== null) {
        await learningSystem.updateFromResult(prediction, match);
      }
    }

    console.log('Performance statistics rebuilt successfully');

    return NextResponse.json({
      message: `Statistiche ricostruite da ${verificate.length} partite verificate`,
      processed: verificate.length,
    });
  } catch (error) {
    console.error('Error rebuilding performance stats:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to rebuild performance stats', details: error instanceof Error ? error.message : 'Unknown error' } },
      { status: 500 }
    );
  }
}
