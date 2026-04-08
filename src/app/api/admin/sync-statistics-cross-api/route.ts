import { NextResponse } from 'next/server';
import { auth } from '@/src/lib/auth';
import { apiFootballService } from '@/src/lib/services/api-football';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).isAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const daysBack = body.daysBack ? parseInt(body.daysBack) : 7;

    console.log(`Starting cross-API statistics mapping (last ${daysBack} days)...`);
    const result = await apiFootballService.syncStatisticsWithCrossAPIMapping(daysBack);

    const message = `Cross-API mapping completato: ${result.mapped} partite mappate, ${result.updated} statistiche aggiornate, ${result.failed} fallite`;
    console.log(message);

    return NextResponse.json({
      message,
      mapped: result.mapped,
      updated: result.updated,
      failed: result.failed,
      daysBack,
    });
  } catch (error: any) {
    console.error('Cross-API mapping error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to sync statistics via cross-API mapping' } },
      { status: 500 }
    );
  }
}
