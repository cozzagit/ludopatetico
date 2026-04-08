import { NextResponse } from 'next/server';
import { auth } from '@/src/lib/auth';
import { apiFootballService } from '@/src/lib/services/api-football';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Non autenticato' } },
        { status: 401 }
      );
    }

    const { date } = await request.json();

    if (!date) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Date parameter required (YYYY-MM-DD format)' } },
        { status: 400 }
      );
    }

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid date format. Use YYYY-MM-DD' } },
        { status: 400 }
      );
    }

    console.log(`Starting statistics sync for ${date}...`);
    const result = await apiFootballService.syncMatchStatistics(targetDate);

    const message = `Statistiche sincronizzate per ${date}: ${result.updated} partite aggiornate, ${result.failed} fallite`;
    console.log(message);

    return NextResponse.json({
      message,
      updated: result.updated,
      failed: result.failed,
      date,
    });
  } catch (error: any) {
    console.error('Statistics sync error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to sync statistics' } },
      { status: 500 }
    );
  }
}
