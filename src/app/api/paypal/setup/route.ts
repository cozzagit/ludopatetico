import { NextResponse } from 'next/server';
import { getClientToken } from '@/src/lib/services/paypal';

export async function GET() {
  try {
    const clientToken = await getClientToken();
    return NextResponse.json({ clientToken });
  } catch (error) {
    console.error('Error getting PayPal client token:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to get PayPal setup' } },
      { status: 500 }
    );
  }
}
