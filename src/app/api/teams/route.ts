import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { teams } from '@/src/lib/db/schema';

export async function GET() {
  try {
    const result = await db.select().from(teams);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching teams:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch teams' } },
      { status: 500 }
    );
  }
}
