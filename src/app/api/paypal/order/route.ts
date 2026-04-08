import { NextResponse } from 'next/server';
import { createPaypalOrder } from '@/src/lib/services/paypal';

export async function POST(request: Request) {
  try {
    const { amount, currency = 'EUR', intent = 'CAPTURE' } = await request.json();

    if (!amount) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Amount is required' } },
        { status: 400 }
      );
    }

    const { data, statusCode } = await createPaypalOrder(amount, currency, intent);
    return NextResponse.json(data, { status: statusCode });
  } catch (error) {
    console.error('Error creating PayPal order:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create PayPal order' } },
      { status: 500 }
    );
  }
}
