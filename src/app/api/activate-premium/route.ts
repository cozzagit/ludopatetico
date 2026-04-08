import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { users, paypalTransactions } from '@/src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/src/lib/auth';
import { PREMIUM_PLANS } from '@/src/lib/constants';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Non autenticato' } },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { paypalOrderId, plan = 'monthly' } = await request.json();

    if (!paypalOrderId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Missing payment details' } },
        { status: 400 }
      );
    }

    const selectedPlan = PREMIUM_PLANS[plan as keyof typeof PREMIUM_PLANS] || PREMIUM_PLANS.monthly;

    // CRITICAL: Verify payment with PayPal server-side before activating premium
    const isProduction = process.env.NODE_ENV === 'production';
    const paypalHost = isProduction ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com';

    const response = await fetch(
      `https://${paypalHost}/v2/checkout/orders/${paypalOrderId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(
            `${isProduction ? process.env.PAYPAL_CLIENT_ID_PROD : process.env.PAYPAL_CLIENT_ID}:${isProduction ? process.env.PAYPAL_CLIENT_SECRET_PROD : process.env.PAYPAL_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
      }
    );

    if (!response.ok) {
      console.error('PayPal verification failed:', await response.text());
      return NextResponse.json(
        { error: { code: 'PAYMENT_ERROR', message: 'Payment verification failed' } },
        { status: 400 }
      );
    }

    const orderDetails = await response.json();

    // Security checks
    if (orderDetails.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: { code: 'PAYMENT_ERROR', message: 'Payment not completed' } },
        { status: 400 }
      );
    }

    const purchaseUnit = orderDetails.purchase_units?.[0];
    if (!purchaseUnit) {
      return NextResponse.json(
        { error: { code: 'PAYMENT_ERROR', message: 'Invalid payment data' } },
        { status: 400 }
      );
    }

    const amount = parseFloat(purchaseUnit.amount?.value || '0');
    const currency = purchaseUnit.amount?.currency_code;

    // Verify amount matches selected plan
    if (Math.abs(amount - selectedPlan.amount) > 0.01 || currency !== 'EUR') {
      console.error(
        `Invalid payment amount/currency: ${amount} ${currency} (expected ${selectedPlan.amount} EUR for ${plan} plan)`
      );
      return NextResponse.json(
        { error: { code: 'PAYMENT_ERROR', message: 'Invalid payment amount' } },
        { status: 400 }
      );
    }

    console.log(`Payment verified: EUR ${amount} for ${selectedPlan.label} plan`);

    // Verify payment recipient
    const payeeEmail = purchaseUnit.payee?.email_address;
    if (payeeEmail && payeeEmail !== 'luca.cozza@gmail.com') {
      console.error(`Payment to wrong recipient: ${payeeEmail}`);
      return NextResponse.json(
        { error: { code: 'PAYMENT_ERROR', message: 'Invalid payment recipient' } },
        { status: 400 }
      );
    }

    const paypalPayerId = orderDetails.payer?.payer_id;

    // Calculate subscription dates based on plan
    const now = new Date();
    const subscriptionEnd = new Date(now);
    subscriptionEnd.setDate(subscriptionEnd.getDate() + selectedPlan.days);

    console.log(
      `Subscription period: ${selectedPlan.days} days (${plan} plan), expires: ${subscriptionEnd.toISOString()}`
    );

    // Record verified transaction
    await db.insert(paypalTransactions).values({
      userId,
      paypalOrderId,
      paypalPayerId,
      amount: amount.toString(),
      currency: currency || 'EUR',
      status: 'COMPLETED',
      subscriptionStartDate: now,
      subscriptionEndDate: subscriptionEnd,
      autoRenew: false,
    });

    // Activate premium for user
    await db
      .update(users)
      .set({ isPremium: true, subscriptionExpiresAt: subscriptionEnd })
      .where(eq(users.id, userId));

    return NextResponse.json({
      message: 'Premium attivato con successo!',
      subscriptionEndsAt: subscriptionEnd,
    });
  } catch (error) {
    console.error('Error activating premium:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to activate premium' } },
      { status: 500 }
    );
  }
}
