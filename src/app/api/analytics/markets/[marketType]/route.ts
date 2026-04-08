import { NextResponse } from 'next/server';
import { learningSystem } from '@/src/lib/services/learning-system';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ marketType: string }> }
) {
  try {
    const { marketType } = await params;
    const insights = await learningSystem.getMarketInsights(marketType);
    return NextResponse.json(insights);
  } catch (error) {
    console.error('Error fetching market insights:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch market insights' } },
      { status: 500 }
    );
  }
}
