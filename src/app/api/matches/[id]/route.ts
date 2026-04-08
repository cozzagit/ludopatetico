import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, teams, competitions, predictions, users, marketOdds } from '@/src/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
import { redactPremiumPrediction } from '@/src/lib/prediction-helpers';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const matchId = parseInt(id);

    const match = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!match) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Match not found' } },
        { status: 404 }
      );
    }

    // Check if user is premium or showcase mode
    const { searchParams } = new URL(request.url);
    const isShowcase = searchParams.get('showcase') === 'true';

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

    const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then((r) => r[0] ?? null);
    const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then((r) => r[0] ?? null);
    let prediction = await db
      .select()
      .from(predictions)
      .where(eq(predictions.matchId, match.id))
      .orderBy(desc(predictions.createdAt))
      .limit(1)
      .then((r) => r[0] ?? null);
    const competition = await db.select().from(competitions).where(eq(competitions.id, match.competitionId)).limit(1).then((r) => r[0] ?? null);

    // Fetch blockchain prediction market odds
    const marketOddsData = await db
      .select()
      .from(marketOdds)
      .where(eq(marketOdds.matchId, match.id))
      .limit(1)
      .then((r) => r[0] ?? null);

    // Redact premium prediction data for non-premium users (unless showcase)
    if (prediction && prediction.isPremium && !isPremiumUser && !isShowcase) {
      prediction = redactPremiumPrediction(prediction);
    }

    return NextResponse.json({ data: {
      ...match,
      homeTeam,
      awayTeam,
      competition,
      prediction,
      marketOdds: marketOddsData,
    }});
  } catch (error) {
    console.error('Error fetching match details:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch match details' } },
      { status: 500 }
    );
  }
}
