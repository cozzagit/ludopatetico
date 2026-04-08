import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, teams, teamForm, users, predictions } from '@/src/lib/db/schema';
import { eq, and } from 'drizzle-orm';
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

    const userId = session.user.id;
    const dbUser = await db.select().from(users).where(eq(users.id, userId)).limit(1).then((r) => r[0] ?? null);

    if (!dbUser?.isPremium) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Premium subscription required' } },
        { status: 403 }
      );
    }

    const { matchId: matchIdStr } = await params;
    const matchId = parseInt(matchIdStr);

    const match = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1).then((r) => r[0] ?? null);
    if (!match) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Match not found' } },
        { status: 404 }
      );
    }

    const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then((r) => r[0] ?? null);
    const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then((r) => r[0] ?? null);

    if (!homeTeam || !awayTeam) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Teams not found' } },
        { status: 404 }
      );
    }

    const homeForm = await db.select().from(teamForm).where(and(eq(teamForm.teamId, match.homeTeamId), eq(teamForm.competitionId, match.competitionId))).limit(1).then((r) => r[0] ?? undefined);
    const awayForm = await db.select().from(teamForm).where(and(eq(teamForm.teamId, match.awayTeamId), eq(teamForm.competitionId, match.competitionId))).limit(1).then((r) => r[0] ?? undefined);

    // Premium users always get premium predictions
    const prediction = await aiPredictionService.generatePrediction(
      { match, homeTeam, awayTeam, homeForm, awayForm },
      true
    );

    const created = await db.insert(predictions).values(prediction).returning();
    return NextResponse.json(created[0]);
  } catch (error) {
    console.error('Error generating prediction:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate prediction' } },
      { status: 500 }
    );
  }
}
