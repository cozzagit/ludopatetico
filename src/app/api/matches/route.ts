import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { matches, teams, competitions } from '@/src/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const competitionId = searchParams.get('competitionId')
      ? parseInt(searchParams.get('competitionId')!)
      : undefined;

    const matchList = competitionId
      ? await db
          .select()
          .from(matches)
          .where(eq(matches.competitionId, competitionId))
          .orderBy(desc(matches.utcDate))
      : await db.select().from(matches).orderBy(desc(matches.utcDate));

    // Enrich matches with team and competition data
    const enrichedMatches = await Promise.all(
      matchList.map(async (match) => {
        const homeTeam = await db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1).then((r) => r[0] ?? null);
        const awayTeam = await db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1).then((r) => r[0] ?? null);
        const competition = await db.select().from(competitions).where(eq(competitions.id, match.competitionId)).limit(1).then((r) => r[0] ?? null);

        return {
          ...match,
          homeTeam,
          awayTeam,
          competition,
        };
      })
    );

    return NextResponse.json(enrichedMatches);
  } catch (error) {
    console.error('Error fetching matches:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch matches' } },
      { status: 500 }
    );
  }
}
