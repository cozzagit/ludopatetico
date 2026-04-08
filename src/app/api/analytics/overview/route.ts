import { NextResponse } from 'next/server';
import { learningSystem } from '@/src/lib/services/learning-system';

export async function GET() {
  try {
    const overview = await learningSystem.getPerformanceSummary();
    return NextResponse.json(overview);
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch analytics overview' } },
      { status: 500 }
    );
  }
}
