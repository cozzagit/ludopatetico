import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, teams, competitions, predictions, users } from '@/src/lib/db/schema';
import { eq, gte, asc, desc } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
import { redactPremiumPrediction } from '@/src/lib/prediction-helpers';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : 100;

    // Get predictions for today and future matches
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db
      .select()
      .from(predictions)
      .innerJoin(matches, eq(predictions.matchId, matches.id))
      .where(gte(matches.utcDate, today))
      .orderBy(asc(matches.utcDate))
      .limit(limit);

    const predictionsList = result.map((r) => r.predictions);

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

    const enrichedPredictions = await Promise.all(
      predictionsList.map(async (prediction) => {
        const match = await db.select().from(matches).where(eq(matches.id, prediction.matchId)).limit(1).then((r) => r[0] ?? null);
        if (!match) return null;

        // Filter: show only live (started but < 2 hours ago) or upcoming matches
        const matchDate = new Date(match.utcDate);
        const now = new Date();
        const twoHoursAfterMatch = new Date(matchDate.getTime() + 2 * 60 * 60 * 1000);

        // Skip if match has already ended (match start + 2 hours <= now)
        if (twoHoursAfterMatch <= now) {
          return null;
        }

        const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then((r) => r[0] ?? null);
        const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then((r) => r[0] ?? null);
        const competition = await db.select().from(competitions).where(eq(competitions.id, match.competitionId)).limit(1).then((r) => r[0] ?? null);

        // Redact premium prediction data for non-premium users
        let finalPrediction = prediction;
        if (prediction.isPremium && !isPremiumUser) {
          finalPrediction = redactPremiumPrediction(prediction);
        }

        return {
          ...finalPrediction,
          match: {
            ...match,
            homeTeam,
            awayTeam,
            competition,
          },
        };
      })
    );

    return NextResponse.json(enrichedPredictions.filter(Boolean));
  } catch (error) {
    console.error('Error fetching predictions:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch predictions' } },
      { status: 500 }
    );
  }
}
