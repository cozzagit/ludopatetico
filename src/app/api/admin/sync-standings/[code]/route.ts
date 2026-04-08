import { NextResponse } from 'next/server';
import { auth } from '@/src/lib/auth';
import { footballDataService } from '@/src/lib/services/football-data';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).isAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    const { code } = await params;

    // Map competition code to ID
    const competitionMap: Record<string, number> = {
      SA: 2019,
      PD: 2014,
      PL: 2021,
      BL1: 2002,
      FL1: 2015,
    };

    const competitionId = competitionMap[code];
    if (!competitionId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: `Unknown competition code: ${code}` } },
        { status: 400 }
      );
    }

    await footballDataService.syncStandings(code, competitionId);

    return NextResponse.json({ message: `Standings for ${code} synced successfully` });
  } catch (error) {
    console.error('Error syncing standings:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to sync standings' } },
      { status: 500 }
    );
  }
}
