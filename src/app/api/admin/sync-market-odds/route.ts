import { NextResponse } from 'next/server';
import { auth } from '@/src/lib/auth';
import { syncMarketOdds } from '@/src/lib/services/polymarket';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).isAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    // Optional: sync specific competition
    let competitionCode: string | undefined;
    try {
      const body = await request.json();
      competitionCode = body.competitionCode;
    } catch {
      // No body = sync all competitions
    }

    console.log(
      competitionCode
        ? `Syncing Polymarket odds for ${competitionCode}...`
        : 'Syncing Polymarket odds for all competitions...'
    );

    const results = await syncMarketOdds(competitionCode);

    const totalMatched = results.reduce((sum, r) => sum + r.matchesMatched, 0);
    const totalEvents = results.reduce((sum, r) => sum + r.eventsFound, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    const message = `Polymarket: ${totalEvents} eventi trovati, ${totalMatched} match abbinati, ${totalErrors} errori`;
    console.log(message);

    return NextResponse.json({
      message,
      results,
    });
  } catch (error: any) {
    console.error('Market odds sync error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to sync market odds' } },
      { status: 500 }
    );
  }
}
