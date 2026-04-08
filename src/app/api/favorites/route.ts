import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { userFavorites, teams } from '@/src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Non autenticato' } },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const favorites = await db
      .select()
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId));

    const enrichedFavorites = await Promise.all(
      favorites.map(async (fav) => {
        const team = await db
          .select()
          .from(teams)
          .where(eq(teams.id, fav.teamId))
          .limit(1)
          .then((r) => r[0] ?? null);
        return { ...fav, team };
      })
    );

    return NextResponse.json(enrichedFavorites);
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch favorites' } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Non autenticato' } },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { teamId } = await request.json();

    const result = await db
      .insert(userFavorites)
      .values({ userId, teamId: parseInt(teamId) })
      .returning();

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Error adding favorite:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to add favorite' } },
      { status: 500 }
    );
  }
}
