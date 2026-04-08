import { NextResponse } from 'next/server';
import { auth } from '@/src/lib/auth';
import { apiFootballService } from '@/src/lib/services/api-football';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).isAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    console.log('Starting injuries sync for all leagues...');
    const result = await apiFootballService.syncAllInjuries();

    const message = `Infortuni sincronizzati: ${result.total} giocatori, ${result.errors} errori`;
    console.log(message);

    return NextResponse.json({
      message,
      total: result.total,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error('Injuries sync error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to sync injuries' } },
      { status: 500 }
    );
  }
}
