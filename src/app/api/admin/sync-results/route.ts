import { NextResponse } from 'next/server';
import { auth } from '@/src/lib/auth';
import { footballDataService } from '@/src/lib/services/football-data';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Non autenticato' } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const competitionCode = searchParams.get('competitionCode') || 'CL';

    console.log(`Starting results sync with Football-Data API for ${competitionCode}...`);

    const result = await footballDataService.syncCompetitionData(competitionCode);

    return NextResponse.json({
      message: `Risultati sincronizzati per ${competitionCode}`,
      synced: result,
    });
  } catch (error) {
    console.error('Error syncing results:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to sync results', details: error instanceof Error ? error.message : 'Unknown error' } },
      { status: 500 }
    );
  }
}
