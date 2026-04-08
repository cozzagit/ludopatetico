import { NextResponse } from 'next/server';
import { apiFootballService } from '@/src/lib/services/api-football';

// Public endpoint (called by frontend auto-refresh)
export async function POST() {
  try {
    console.log('Syncing live scores from API-Football...');
    const result = await apiFootballService.syncLiveScores();

    return NextResponse.json({
      message: `Live scores synchronized: ${result.updated} matches updated`,
      updated: result.updated,
      matches: result.matches,
    });
  } catch (error) {
    console.error('Error syncing live scores:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to sync live scores', details: error instanceof Error ? error.message : 'Unknown error' } },
      { status: 500 }
    );
  }
}
