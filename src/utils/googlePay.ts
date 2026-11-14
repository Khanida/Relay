export interface GooglePayConfig {
  environment: 'TEST' | 'PRODUCTION';
  merchantId: string;
  merchantName: string;
  gateway: string;
  gatewayMerchantId: string;
  isLiveConfigured: boolean;
}

interface GooglePaymentsClient {
  isReadyToPay(request: Record<string, unknown>): Promise<{ result: boolean }>;
  loadPaymentData(request: Record<string, unknown>): Promise<Record<string, unknown>>;
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

export function getGooglePayConfig(): GooglePayConfig {
  const merchantId = (import.meta.env.VITE_GOOGLE_PAY_MERCHANT_ID as string | undefined)?.trim() || '';
  const gateway = (import.meta.env.VITE_GOOGLE_PAY_GATEWAY as string | undefined)?.trim() || 'example';
  const gatewayMerchantId =
    (import.meta.env.VITE_GOOGLE_PAY_GATEWAY_MERCHANT_ID as string | undefined)?.trim() ||
    'exampleGatewayMerchantId';
  const envRaw = (import.meta.env.VITE_GOOGLE_PAY_ENV as string | undefined)?.trim().toUpperCase();
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

let scriptLoadPromise: Promise<boolean> | null = null;

export function loadGooglePayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.payments?.api?.PaymentsClient) return Promise.resolve(true);
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[src="https://pay.google.com/gp/p/js/pay.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.google?.payments?.api)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://pay.google.com/gp/p/js/pay.js';
    script.async = true;
    script.onload = () => resolve(Boolean(window.google?.payments?.api));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export async function requestGooglePayCheckout(priceUsd: string): Promise<{
  ok: boolean;
  mode: 'google_pay' | 'cancelled' | 'unavailable';
  error?: string;
}> {
  const loaded = await loadGooglePayScript();
  const Client = window.google?.payments?.api?.PaymentsClient;
  if (!loaded || !Client) {
    return { ok: false, mode: 'unavailable', error: 'Google Pay Web SDK could not be loaded.' };
  }

  const cfg = getGooglePayConfig();
  const client = new Client({ environment: cfg.environment });

  const baseCardMethod = {
    type: 'CARD',
    parameters: {
      allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
      allowedCardNetworks: ['MASTERCARD', 'VISA', 'AMEX', 'DISCOVER'],
    },
  };

  try {
    const ready = await client.isReadyToPay({
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [baseCardMethod],
    });

    if (!ready.result) {
      return { ok: false, mode: 'unavailable', error: 'Google Pay is unavailable in this browser session.' };
    }

    const paymentDataRequest = {
      apiVersion: 2,
      apiVersionMinor: 0,
      merchantInfo: {
        merchantId: cfg.merchantId,
        merchantName: cfg.merchantName,
      },
      allowedPaymentMethods: [
        {
          ...baseCardMethod,
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY',
            parameters: {
              gateway: cfg.gateway,
              gatewayMerchantId: cfg.gatewayMerchantId,
            },
          },
        },
      ],
      transactionInfo: {
        totalPriceStatus: 'FINAL',
        totalPriceLabel: 'Total',
        totalPrice: priceUsd,
        currencyCode: 'USD',
        countryCode: 'US',
      },
    };

    await client.loadPaymentData(paymentDataRequest);
    return { ok: true, mode: 'google_pay' };
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
