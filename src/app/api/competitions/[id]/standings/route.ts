import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { standings, teams } from '@/src/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const competitionId = parseInt(id);
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season')
      ? parseInt(searchParams.get('season')!)
      : new Date().getFullYear();

    const standingsList = await db
      .select()
      .from(standings)
      .where(
        and(
          eq(standings.competitionId, competitionId),
          eq(standings.season, season)
        )
      )
      .orderBy(asc(standings.position));

    // Fetch team details for each standing
    const standingsWithTeams = await Promise.all(
      standingsList.map(async (standing) => {
        const team = await db
          .select()
          .from(teams)
          .where(eq(teams.id, standing.teamId))
          .limit(1)
          .then((r) => r[0] ?? null);
        return { ...standing, team };
      })
    );

    return NextResponse.json(standingsWithTeams);
  } catch (error) {
    console.error('Error fetching standings:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch standings' } },
      { status: 500 }
    );
  }
}
