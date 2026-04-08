import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, injuries } from '@/src/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId: matchIdStr } = await params;
    const matchId = parseInt(matchIdStr);

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

    const homeInjuries = await db
      .select()
      .from(injuries)
      .where(and(eq(injuries.teamId, match.homeTeamId), eq(injuries.isActive, true)));

    const awayInjuries = await db
      .select()
      .from(injuries)
      .where(and(eq(injuries.teamId, match.awayTeamId), eq(injuries.isActive, true)));

    return NextResponse.json({
      homeTeam: homeInjuries,
      awayTeam: awayInjuries,
    });
  } catch (error) {
    console.error('Error fetching match injuries:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch match injuries' } },
      { status: 500 }
    );
  }
}
