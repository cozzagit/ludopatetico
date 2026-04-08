import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, teams, competitions, predictions } from '@/src/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : 50;

    // Get predictions for finished matches with results
    const result = await db
      .select()
      .from(predictions)
      .innerJoin(matches, eq(predictions.matchId, matches.id))
      .where(eq(matches.status, 'FINISHED'))
      .orderBy(desc(matches.utcDate))
      .limit(limit);

    const predictionsList = result.map((r) => r.predictions);

    // Enrich with match data
    const enriched = await Promise.all(
      predictionsList.map(async (prediction) => {
        const match = await db.select().from(matches).where(eq(matches.id, prediction.matchId)).limit(1).then((r) => r[0] ?? null);
        if (!match) return null;

        const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then((r) => r[0] ?? null);
        const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then((r) => r[0] ?? null);
        const competition = await db.select().from(competitions).where(eq(competitions.id, match.competitionId)).limit(1).then((r) => r[0] ?? null);

        return {
          ...prediction,
          match: {
            ...match,
            homeTeam,
            awayTeam,
            competition,
          },
        };
      })
    );

    return NextResponse.json(enriched.filter((p) => p !== null));
  } catch (error) {
    console.error('Error fetching historical predictions:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch historical predictions' } },
      { status: 500 }
    );
  }
}
