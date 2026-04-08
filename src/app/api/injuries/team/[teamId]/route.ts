import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { injuries } from '@/src/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId: teamIdStr } = await params;
    const teamId = parseInt(teamIdStr);

    const result = await db
      .select()
      .from(injuries)
      .where(and(eq(injuries.teamId, teamId), eq(injuries.isActive, true)));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching team injuries:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch team injuries' } },
      { status: 500 }
    );
  }
}
