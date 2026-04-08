import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { predictions, users } from '@/src/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId: matchIdStr } = await params;
    const matchId = parseInt(matchIdStr);

    if (isNaN(matchId)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid match ID' } },
        { status: 400 }
      );
    }

    const prediction = await db
      .select()
      .from(predictions)
      .where(eq(predictions.matchId, matchId))
      .orderBy(desc(predictions.createdAt))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!prediction) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Prediction not found' } },
        { status: 404 }
      );
    }

    const session = await auth();
    let isPremiumUser = false;
    if (session?.user?.id) {
      const userRecord = await db
        .select()
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)
        .then((r) => r[0] ?? null);
      isPremiumUser = userRecord?.isPremium || false;
    }

    if (prediction.isPremium && !isPremiumUser) {
      return NextResponse.json({
        ...prediction,
        keyFactors: null,
        predictedHomeScore: null,
        predictedAwayScore: null,
      });
    }

    return NextResponse.json(prediction);
  } catch (error) {
    console.error('Error fetching prediction:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch prediction' } },
      { status: 500 }
    );
  }
}
