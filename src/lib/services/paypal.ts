import {
  Client,
  Environment,
  LogLevel,
  OAuthAuthorizationController,
  OrdersController,
} from '@paypal/paypal-server-sdk';

const isProduction = process.env.NODE_ENV === 'production';

const PAYPAL_CLIENT_ID = isProduction
  ? process.env.PAYPAL_CLIENT_ID_PROD
  : process.env.PAYPAL_CLIENT_ID;

const PAYPAL_CLIENT_SECRET = isProduction
  ? process.env.PAYPAL_CLIENT_SECRET_PROD
  : process.env.PAYPAL_CLIENT_SECRET;

function getClient() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials not configured');
  }
  return new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: PAYPAL_CLIENT_ID,
      oAuthClientSecret: PAYPAL_CLIENT_SECRET,
    },
    timeout: 0,
    environment: isProduction ? Environment.Production : Environment.Sandbox,
    logging: {
      logLevel: LogLevel.Info,
      logRequest: { logBody: true },
      logResponse: { logHeaders: true },
    },
  });
}

export async function getClientToken(): Promise<string> {
  const client = getClient();
  const oAuthController = new OAuthAuthorizationController(client);
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const { result } = await oAuthController.requestToken(
    { authorization: `Basic ${auth}` },
    { intent: 'sdk_init', response_type: 'client_token' }
  );
  return result.accessToken!;
}

export async function createPaypalOrder(amount: string, currency: string, intent: string) {
  const client = getClient();
  const ordersController = new OrdersController(client);
  const { body, ...httpResponse } = await ordersController.ordersCreate({
    body: {
      intent: intent as any,
      purchaseUnits: [{ amount: { currencyCode: currency, value: amount } }],
    },
    prefer: 'return=minimal',
  });
  return { data: JSON.parse(String(body)), statusCode: httpResponse.statusCode };
}

export async function capturePaypalOrder(orderID: string) {
  const client = getClient();
  const ordersController = new OrdersController(client);
  const { body, ...httpResponse } = await ordersController.ordersCapture({
    id: orderID,
    prefer: 'return=minimal',
  });
  return { data: JSON.parse(String(body)), statusCode: httpResponse.statusCode };
}
