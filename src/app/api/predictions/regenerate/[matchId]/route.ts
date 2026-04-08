import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, predictions } from '@/src/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
import { aiPredictionService } from '@/src/lib/services/ai-prediction';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Non autenticato' } },
        { status: 401 }
      );
    }

    const { matchId: matchIdStr } = await params;
    const matchId = parseInt(matchIdStr);
    console.log(`Regenerating prediction for match ${matchId}...`);

    // Get match to check status
    const match = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1).then((r) => r[0] ?? null);
    if (!match) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Match not found' } },
        { status: 404 }
      );
    }

    // Don't regenerate for finished matches (preserve for learning)
    if (match.status === 'FINISHED') {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Cannot regenerate prediction for finished match' } },
        { status: 400 }
      );
    }

    // Delete existing prediction if any
    const existing = await db
      .select()
      .from(predictions)
      .where(eq(predictions.matchId, matchId))
      .orderBy(desc(predictions.createdAt))
      .limit(1)
      .then((r) => r[0] ?? null);
    if (existing) {
      await db.delete(predictions).where(eq(predictions.matchId, matchId));
    }

    // Generate new prediction
    await aiPredictionService.generatePredictionFromMatchId(matchId, true);
    console.log(`Regenerated prediction for match ${matchId}`);

    return NextResponse.json({
      message: 'Prediction regenerated successfully',
      matchId,
    });
  } catch (error) {
    console.error('Error regenerating prediction:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to regenerate prediction' } },
      { status: 500 }
    );
  }
}
