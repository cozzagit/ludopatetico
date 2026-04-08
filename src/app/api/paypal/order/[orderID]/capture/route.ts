import { NextResponse } from 'next/server';
import { capturePaypalOrder } from '@/src/lib/services/paypal';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderID: string }> }
) {
  try {
    const { orderID } = await params;
    const { data, statusCode } = await capturePaypalOrder(orderID);
    return NextResponse.json(data, { status: statusCode });
  } catch (error) {
    console.error('Error capturing PayPal order:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to capture PayPal order' } },
      { status: 500 }
    );
  }
}
