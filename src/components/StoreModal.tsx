import { useEffect, useMemo, useState } from 'react';
import { BatteryCharging, CheckCircle2, Coins, CreditCard, ShieldCheck, Wallet, X } from 'lucide-react';
import { STORE_CATALOG, computeRobotChargeStatus } from '../shared/gameCatalog';
import type {
  OwnedRobotState,
  PlayerProfile,
  RobotModelId,
  StoreItemDef,
  StoreSku,
} from '../shared/types';
import {
  finalizeStorePurchase,
  getGooglePayConfig,
  loadGooglePayScript,
  requestGooglePayCheckout,
  type StorePurchaseResponse,
} from '../services/googlePayService';

interface StoreModalProps {
  profile: PlayerProfile;
  ownedRobots: OwnedRobotState[];
  onClose: () => void;
  onPurchaseComplete: (data: StorePurchaseResponse) => void;
}

export function StoreModal({
  profile,
  ownedRobots,
  onClose,
  onPurchaseComplete,
}: StoreModalProps) {
  const gpayConfig = useMemo(() => getGooglePayConfig(), []);
  const [gpayReady, setGpayReady] = useState(false);
  const [busySku, setBusySku] = useState<StoreSku | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const slot1 = ownedRobots.find((r) => r.deployment_slot === 1) ?? ownedRobots[0];
  const [targetRobotId, setTargetRobotId] = useState<RobotModelId>(slot1?.robot_id ?? 'relay_01');

  useEffect(() => {
    loadGooglePayScript().then((ok) => setGpayReady(ok));
  }, []);

  const batteryItems = STORE_CATALOG.filter((item) => item.kind === 'battery');
  const currencyItems = STORE_CATALOG.filter((item) => item.kind === 'currency');

  const completeServerPurchase = async (
    item: StoreItemDef,
    paymentMethod: 'google_pay' | 'sandbox',
    paymentToken?: string,
    paymentDescription?: string
  ) => {
    const data = await finalizeStorePurchase({
      item,
      targetRobotId,
      paymentMethod,
      paymentToken,
      paymentDescription,
    });
    onPurchaseComplete(data);
    setSuccessMsg(
      item.kind === 'currency'
        ? `Credited +${item.creditsRc?.toLocaleString()} RC to your RELAY balance.`
        : item.fullChargeScope === 'fleet'
          ? 'All owned robots recharged to 100%.'
          : 'Selected unit battery recharged to 100%.'
    );
  };

  const handleCheckout = async (item: StoreItemDef, useGooglePay: boolean) => {
    if (busySku) return;
    setBusySku(item.sku);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (useGooglePay) {
        const gpayRes = await requestGooglePayCheckout(item);
        if (gpayRes.mode === 'cancelled') {
          setBusySku(null);
          return;
        }
        if (gpayRes.ok) {
          await completeServerPurchase(
            item,
            'google_pay',
            gpayRes.paymentToken,
            gpayRes.paymentDescription
          );
          return;
        }
        setErrorMsg(
          gpayRes.error ||
            'Google Pay sheet unavailable in this preview frame. Use Sandbox Test Checkout below to test.'
        );
        return;
      }

      await completeServerPurchase(item, 'sandbox');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setBusySku(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-lg bg-[#11151C] border border-[#94A3B8]/40 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#222A36] bg-[#0E1218] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Wallet size={20} className="text-[#E5C158]" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                RELAY Supply &amp; Rapid Charge Store
              </h2>
              <p className="text-xs text-[#CBD5E1]">
                Instant 100% battery overcharges &amp; RELAY Credits (RC) ·{' '}
                <span className="font-mono-tabular text-[#E5C158]">
                  Balance: {profile.credits_rc.toLocaleString()} RC
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 rounded text-[11px] font-medium border ${
                gpayConfig.isLiveConfigured
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                  : 'bg-[#18202B] border-[#94A3B8]/40 text-[#CBD5E1]'
              }`}
            >
              {gpayConfig.isLiveConfigured ? 'Google Pay Live' : 'Google Pay Test / Sandbox'}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close store"
              className="p-1.5 rounded text-[#CBD5E1] hover:text-white hover:bg-[#1E2531]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 rounded bg-rose-950/60 border border-rose-800/70 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded bg-emerald-950/50 border border-emerald-700/70 text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Battery Recharge Section */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BatteryCharging size={17} className="text-[#E5C158]" />
                <h3 className="font-display text-sm font-semibold text-white uppercase tracking-wide">
                  Instant Battery Overcharge
                </h3>
              </div>

              {ownedRobots.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#CBD5E1]">Target Unit:</span>
                  <select
                    value={targetRobotId}
                    onChange={(e) => setTargetRobotId(e.target.value as RobotModelId)}
                    className="px-2.5 py-1 rounded bg-[#0B0D10] border border-[#2C3646] text-white font-mono-tabular text-xs"
                  >
                    {ownedRobots.map((r) => {
                      const status = computeRobotChargeStatus(r);
                      return (
                        <option key={r.robot_id} value={r.robot_id}>
                          {r.custom_name} ({status.batteryPct.toFixed(0)}% · {status.formattedRemaining})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {batteryItems.map((item) => (
                <div
                  key={item.sku}
                  className="p-4 rounded-lg bg-[#161B23] border border-[#94A3B8]/30 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold text-white text-sm">{item.title}</span>
                      {item.badge && (
                        <span className="px-2 py-0.5 rounded bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#E5C158] text-[10px] font-semibold">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[#CBD5E1] leading-relaxed">{item.subtitle}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#222A36]">
                    <span className="font-mono-tabular text-base font-bold text-[#E5C158]">
                      ${item.priceUsd}
                    </span>
                    <div className="flex items-center gap-2">
                      {gpayReady && (
                        <button
                          type="button"
                          disabled={busySku !== null}
                          onClick={() => handleCheckout(item, true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-black hover:bg-[#18181b] border border-[#94A3B8]/60 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          <CreditCard size={13} />
                          G Pay
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busySku !== null}
                        onClick={() => handleCheckout(item, false)}
                        className="px-3 py-1.5 rounded bg-[#D4AF37] hover:bg-[#E5C158] text-[#0B0D10] text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {busySku === item.sku
                          ? 'Processing...'
                          : gpayConfig.isLiveConfigured
                            ? 'Test Buy'
                            : 'Sandbox Buy'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Currency Packs Section */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Coins size={17} className="text-[#E5C158]" />
              <h3 className="font-display text-sm font-semibold text-white uppercase tracking-wide">
                RELAY Credits (RC) Packs
              </h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {currencyItems.map((item) => (
                <div
                  key={item.sku}
                  className="p-4 rounded-lg bg-[#161B23] border border-[#252E3D] flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold text-white text-sm">{item.title}</span>
                      {item.badge && (
                        <span className="px-2 py-0.5 rounded bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#E5C158] text-[10px] font-semibold">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[#CBD5E1] leading-relaxed">{item.subtitle}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#222A36]">
                    <span className="font-mono-tabular text-base font-bold text-[#E5C158]">
                      ${item.priceUsd}
                    </span>
                    <div className="flex items-center gap-2">
                      {gpayReady && (
                        <button
                          type="button"
                          disabled={busySku !== null}
                          onClick={() => handleCheckout(item, true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-black hover:bg-[#18181b] border border-[#94A3B8]/60 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          <CreditCard size={13} />
                          G Pay
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busySku !== null}
                        onClick={() => handleCheckout(item, false)}
                        className="px-3 py-1.5 rounded bg-[#D4AF37] hover:bg-[#E5C158] text-[#0B0D10] text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {busySku === item.sku
                          ? 'Processing...'
                          : gpayConfig.isLiveConfigured
                            ? 'Test Buy'
                            : 'Sandbox Buy'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Google Pay / Wallet Merchant Setup Note */}
          <section className="rounded-lg bg-[#0D1117] border border-[#252E3D] p-4 space-y-2 text-xs">
            <button
              type="button"
              onClick={() => setShowSetupGuide((v) => !v)}
              className="w-full flex items-center justify-between text-left font-medium text-[#E5C158]"
            >
              <span className="inline-flex items-center gap-2">
                <ShieldCheck size={15} />
                How to Receive Real Google Pay / Google Wallet Payments
              </span>
              <span className="text-[#CBD5E1]">{showSetupGuide ? 'Hide' : 'Show Steps'}</span>
            </button>

            {showSetupGuide && (
              <div className="pt-2 border-t border-[#1F2734] text-[#CBD5E1] space-y-1.5 leading-relaxed">
                <p>
                  1. Register a Merchant Profile in the{' '}
                  <span className="text-white font-medium">Google Pay &amp; Wallet Console</span>{' '}
                  (pay.google.com/business/console) to obtain your live Merchant ID.
                </p>
                <p>
                  2. Connect a payment processor (such as <span className="text-white">Stripe</span>,
                  Adyen, or Braintree) that settles customer Google Wallet cards directly to your bank
                  account.
                </p>
                <p>
                  3. Set <code className="text-[#E5C158]">VITE_GOOGLE_PAY_MERCHANT_ID</code>,{' '}
                  <code className="text-[#E5C158]">VITE_GOOGLE_PAY_GATEWAY</code>,{' '}
                  <code className="text-[#E5C158]">VITE_GOOGLE_PAY_GATEWAY_MERCHANT_ID</code>, and{' '}
                  <code className="text-[#E5C158]">VITE_GOOGLE_PAY_ENV=&quot;PRODUCTION&quot;</code>{' '}
                  in your environment, and verify the token with your processor&apos;s server SDK in{' '}
                  <code className="text-[#E5C158]">POST /api/store/purchase</code>.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
