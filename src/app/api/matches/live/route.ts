import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { predictions, users } from '@/src/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
import { footballDataService } from '@/src/lib/services/football-data';
import { redactPremiumPrediction } from '@/src/lib/prediction-helpers';
import { MONITORED_COMPETITION_IDS } from '@/src/lib/constants';

export async function GET() {
  try {
    const liveMatches = await footballDataService.getLiveMatches();

    // Filter to only show matches from monitored competitions
    const filteredMatches = liveMatches.filter((match) =>
      MONITORED_COMPETITION_IDS.includes(match.competitionId)
    );

    // Check if user is premium
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

    const enrichedMatches = await Promise.all(
      filteredMatches.map(async (match) => {
        let prediction = await db
          .select()
          .from(predictions)
          .where(eq(predictions.matchId, match.id))
          .orderBy(desc(predictions.createdAt))
          .limit(1)
          .then((r) => r[0] ?? null);

        // Redact premium prediction data for non-premium users
        if (prediction && prediction.isPremium && !isPremiumUser) {
          prediction = redactPremiumPrediction(prediction);
        }

        return {
          ...match,
          prediction,
        };
      })
    );

    return NextResponse.json(enrichedMatches);
  } catch (error: any) {
    console.error('Error fetching live matches:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to fetch live matches' } },
      { status: 500 }
    );
  }
}
