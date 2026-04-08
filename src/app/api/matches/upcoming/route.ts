import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, teams, competitions, predictions, users } from '@/src/lib/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
import { redactPremiumPrediction } from '@/src/lib/prediction-helpers';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const competitionId = searchParams.get('competitionId')
      ? parseInt(searchParams.get('competitionId')!)
      : undefined;
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : 100;
    const showcaseLimit = searchParams.get('showcase')
      ? parseInt(searchParams.get('showcase')!)
      : 0;

    const now = new Date();
    // Include matches from last 2 hours to show recent/live matches
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const matchList = await db
      .select()
      .from(matches)
      .where(
        competitionId
          ? and(eq(matches.competitionId, competitionId), gte(matches.utcDate, twoHoursAgo))
          : gte(matches.utcDate, twoHoursAgo)
      )
      .orderBy(matches.utcDate)
      .limit(limit);

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

    // Fetch all predictions ONCE for showcase detection
    const predictionsMap = new Map<number, any>();
    const matchesWithPredictions: number[] = [];

    for (let i = 0; i < matchList.length; i++) {
      const prediction = await db
        .select()
        .from(predictions)
        .where(eq(predictions.matchId, matchList[i].id))
        .orderBy(desc(predictions.createdAt))
        .limit(1)
        .then((r) => r[0] ?? null);
      if (prediction) {
        predictionsMap.set(matchList[i].id, prediction);
        matchesWithPredictions.push(i);
      }
    }

    const enrichedMatches = await Promise.all(
      matchList.map(async (match, index) => {
        const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then((r) => r[0] ?? null);
        const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then((r) => r[0] ?? null);
        let prediction = predictionsMap.get(match.id);
        const competition = await db.select().from(competitions).where(eq(competitions.id, match.competitionId)).limit(1).then((r) => r[0] ?? null);

        // Determine if this match is in showcase
        const predictionIndex = matchesWithPredictions.indexOf(index);
        const isShowcase = predictionIndex >= 0 && predictionIndex < showcaseLimit;

        // Redact premium prediction data for non-premium users (unless showcase)
        if (prediction && prediction.isPremium && !isPremiumUser && !isShowcase) {
          prediction = redactPremiumPrediction(prediction);
        }

        return {
          ...match,
          homeTeam,
          awayTeam,
          prediction,
          competition,
        };
      })
    );

    return NextResponse.json(enrichedMatches, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Error fetching upcoming matches:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch upcoming matches' } },
      { status: 500 }
    );
  }
}
