import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { users } from '@/src/lib/db/schema';
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

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!user) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    const now = new Date();
    const isActive =
      user.isPremium &&
      user.subscriptionExpiresAt &&
      new Date(user.subscriptionExpiresAt) > now;

    let daysRemaining = 0;
    if (isActive && user.subscriptionExpiresAt) {
      const diff = new Date(user.subscriptionExpiresAt).getTime() - now.getTime();
      daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    return NextResponse.json({
      isPremium: isActive,
      expiresAt: user.subscriptionExpiresAt,
      daysRemaining,
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to check subscription' } },
      { status: 500 }
    );
  }
}
