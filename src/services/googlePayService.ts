import type {
  OwnedRobotState,
  PlayerProfile,
  RobotModelId,
  StoreItemDef,
} from '../shared/types';

export interface GooglePayConfig {
  environment: 'TEST' | 'PRODUCTION';
  merchantId: string;
  merchantName: string;
  gateway: string;
  gatewayMerchantId: string;
  isLiveConfigured: boolean;
}

export interface GooglePayDisplayItem {
  label: string;
  type: 'LINE_ITEM' | 'SUBTOTAL';
  price: string;
}

export interface GooglePayPaymentDataRequest {
  apiVersion: 2;
  apiVersionMinor: 0;
  merchantInfo: {
    merchantId: string;
    merchantName: string;
  };
  allowedPaymentMethods: Array<{
    type: 'CARD';
    parameters: {
      allowedAuthMethods: string[];
      allowedCardNetworks: string[];
    };
    tokenizationSpecification: {
      type: 'PAYMENT_GATEWAY';
      parameters: {
        gateway: string;
        gatewayMerchantId: string;
      };
    };
  }>;
  transactionInfo: {
    totalPriceStatus: 'FINAL';
    totalPriceLabel: string;
    totalPrice: string;
    currencyCode: 'USD';
    countryCode: 'US';
    displayItems: GooglePayDisplayItem[];
  };
}

export interface GooglePayCheckoutResult {
  ok: boolean;
  mode: 'google_pay' | 'cancelled' | 'unavailable';
  paymentToken?: string;
  paymentDescription?: string;
  error?: string;
}

export interface StorePurchaseResponse {
  profile: PlayerProfile;
  robots: OwnedRobotState[];
  transactions: unknown[];
  grantedItem: StoreItemDef;
}

interface GooglePaymentsClient {
  isReadyToPay(request: Record<string, unknown>): Promise<{ result: boolean }>;
  loadPaymentData(request: Record<string, unknown>): Promise<{
    paymentMethodData?: {
      description?: string;
      tokenizationData?: {
        token?: string;
        type?: string;
      };
    };
  }>;
}

declare global {
  interface Window {
    google?: {
      payments?: {
        api?: {
          PaymentsClient: new (opts: { environment: 'TEST' | 'PRODUCTION' }) => GooglePaymentsClient;
        };
      };
    };
  }
}

const GOOGLE_PAY_JS_URL = 'https://pay.google.com/gp/p/js/pay.js';

const BASE_CARD_PAYMENT_METHOD = {
  type: 'CARD' as const,
  parameters: {
    allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
    allowedCardNetworks: ['MASTERCARD', 'VISA', 'AMEX', 'DISCOVER'],
  },
};

function readViteEnv(): Record<string, string | undefined> {
  return (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
}

export function getGooglePayConfig(
  envOverride?: Record<string, string | undefined>
): GooglePayConfig {
  const env = envOverride ?? readViteEnv();
  const merchantId = env.VITE_GOOGLE_PAY_MERCHANT_ID?.trim() || '';
  const gateway = env.VITE_GOOGLE_PAY_GATEWAY?.trim() || 'example';
  const gatewayMerchantId =
    env.VITE_GOOGLE_PAY_GATEWAY_MERCHANT_ID?.trim() || 'exampleGatewayMerchantId';
  const envRaw = env.VITE_GOOGLE_PAY_ENV?.trim().toUpperCase();

  const isLiveConfigured =
    Boolean(merchantId) && gateway !== 'example' && gatewayMerchantId !== 'exampleGatewayMerchantId';

  return {
    environment: envRaw === 'PRODUCTION' && isLiveConfigured ? 'PRODUCTION' : 'TEST',
    merchantId: merchantId || '12345678901234567890',
    merchantName: 'RELAY Response Robotics',
    gateway,
    gatewayMerchantId,
    isLiveConfigured,
  };
}

export function createGooglePayPaymentRequest(
  item: StoreItemDef,
  config: GooglePayConfig = getGooglePayConfig()
): GooglePayPaymentDataRequest {
  const categoryLabel =
    item.kind === 'currency' ? 'RELAY Credits Pack' : 'Instant Battery Overcharge';

  return {
    apiVersion: 2,
    apiVersionMinor: 0,
    merchantInfo: {
      merchantId: config.merchantId,
      merchantName: config.merchantName,
    },
    allowedPaymentMethods: [
      {
        ...BASE_CARD_PAYMENT_METHOD,
        tokenizationSpecification: {
          type: 'PAYMENT_GATEWAY',
          parameters: {
            gateway: config.gateway,
            gatewayMerchantId: config.gatewayMerchantId,
          },
        },
      },
    ],
    transactionInfo: {
      totalPriceStatus: 'FINAL',
      totalPriceLabel: `${item.title} (${categoryLabel})`,
      totalPrice: item.priceUsd,
      currencyCode: 'USD',
      countryCode: 'US',
      displayItems: [
        {
          label: `${item.title} — ${categoryLabel}`,
          type: 'LINE_ITEM',
          price: item.priceUsd,
        },
      ],
    },
  };
}

let scriptLoadPromise: Promise<boolean> | null = null;

export function loadGooglePayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.payments?.api?.PaymentsClient) return Promise.resolve(true);
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${GOOGLE_PAY_JS_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.google?.payments?.api)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_PAY_JS_URL;
    script.async = true;
    script.onload = () => resolve(Boolean(window.google?.payments?.api));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export async function isGooglePayReady(): Promise<boolean> {
  const loaded = await loadGooglePayScript();
  const Client = window.google?.payments?.api?.PaymentsClient;
  if (!loaded || !Client) return false;

  const cfg = getGooglePayConfig();
  const client = new Client({ environment: cfg.environment });
  try {
    const ready = await client.isReadyToPay({
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [BASE_CARD_PAYMENT_METHOD],
    });
    return Boolean(ready.result);
  } catch {
    return false;
  }
}

export async function requestGooglePayCheckout(
  item: StoreItemDef
): Promise<GooglePayCheckoutResult> {
  const loaded = await loadGooglePayScript();
  const Client = window.google?.payments?.api?.PaymentsClient;
  if (!loaded || !Client) {
    return {
      ok: false,
      mode: 'unavailable',
      error: 'Google Pay Web SDK could not be loaded.',
    };
  }

  const cfg = getGooglePayConfig();
  const client = new Client({ environment: cfg.environment });

  try {
    const ready = await client.isReadyToPay({
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [BASE_CARD_PAYMENT_METHOD],
    });

    if (!ready.result) {
      return {
        ok: false,
        mode: 'unavailable',
        error: 'Google Pay is unavailable in this browser session.',
      };
    }

    const paymentDataRequest = createGooglePayPaymentRequest(item, cfg);
    const paymentData = await client.loadPaymentData(
      paymentDataRequest as unknown as Record<string, unknown>
    );

    return {
      ok: true,
      mode: 'google_pay',
      paymentToken: paymentData?.paymentMethodData?.tokenizationData?.token,
      paymentDescription: paymentData?.paymentMethodData?.description,
    };
  } catch (err) {
    const statusCode = (err as { statusCode?: string } | null)?.statusCode;
    if (statusCode === 'CANCELED') {
      return { ok: false, mode: 'cancelled' };
    }
    return {
      ok: false,
      mode: 'unavailable',
      error: err instanceof Error ? err.message : 'Google Pay checkout unavailable.',
    };
  }
}

export async function finalizeStorePurchase(params: {
  item: StoreItemDef;
  targetRobotId: RobotModelId;
  paymentMethod: 'google_pay' | 'sandbox';
  paymentToken?: string;
  paymentDescription?: string;
}): Promise<StorePurchaseResponse> {
  const res = await fetch('/api/store/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sku: params.item.sku,
      targetRobotId: params.targetRobotId,
      paymentMethod: params.paymentMethod,
      paymentToken: params.paymentToken,
      paymentDescription: params.paymentDescription,
    }),
  });

  const data = (await res.json()) as StorePurchaseResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Purchase could not be finalized.');
  }
  return data;
}
