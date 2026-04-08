import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { teams } from '@/src/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const teamId = parseInt(id);

    const team = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!team) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Team not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json(team);
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch team' } },
      { status: 500 }
    );
  }
}
