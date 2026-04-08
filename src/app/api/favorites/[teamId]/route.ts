import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { userFavorites } from '@/src/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> }
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
    const { teamId: teamIdStr } = await params;
    const teamId = parseInt(teamIdStr);

    await db
      .delete(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.teamId, teamId)
        )
      );

    return NextResponse.json({ message: 'Favorite removed' });
  } catch (error) {
    console.error('Error removing favorite:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to remove favorite' } },
      { status: 500 }
    );
  }
}
