import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { competitions } from '@/src/lib/db/schema';

export async function GET() {
  try {
    const result = await db.select().from(competitions);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching competitions:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch competitions' } },
      { status: 500 }
    );
  }
}
