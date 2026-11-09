import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from "react-native";

type PurchaseState = {
  owned: boolean;
  status: "cached" | "purchased" | "not_owned" | "pending" | "cancelled";
};
type BillingBridge = {
  cached(): Promise<PurchaseState>;
  product(): Promise<{ price: string } | null>;
  restore(): Promise<PurchaseState>;
  buy(): Promise<PurchaseState>;
};
const bridge: BillingBridge | undefined =
  Platform.OS === "android" ? NativeModules.RemoveAdsBilling : undefined;

export function useBilling() {
  const [ready, setReady] = useState(!bridge);
  const [adsRemoved, setAdsRemoved] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const cachedReady = useRef(!bridge);

  const refresh = useCallback(async () => {
    if (!bridge || !cachedReady.current || inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    try {
      // Refresh both entitlement and localized pricing on launch/resume.
      const results = await Promise.allSettled([bridge.restore(), bridge.product()]);
      if (results[0].status === "fulfilled") setAdsRemoved(results[0].value.owned);
      if (results[1].status === "fulfilled") setPrice(results[1].value?.price ?? null);
      // Keep the last confirmed entitlement when Play is offline.
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    bridge
      .cached()
      .then((state) => {
        if (active) setAdsRemoved(state.owned);
      })
      .finally(() => {
        if (active) {
          cachedReady.current = true;
          setReady(true);
          void refresh();
        }
      })
      .catch(() => {});
    const events = new NativeEventEmitter(NativeModules.RemoveAdsBilling);
    const updates = events.addListener("RemoveAdsUpdated", () => {
      void refresh();
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      updates.remove();
      app.remove();
    };
  }, [refresh]);

  const perform = useCallback(async (action: "buy" | "restore") => {
    if (!bridge || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const state = await bridge[action]();
      setAdsRemoved(state.owned);
      if (action === "restore") {
        try { setPrice((await bridge.product())?.price ?? null); } catch { /* Retry on next resume. */ }
      }
      setMessage(
        state.owned
          ? "Ads removed. Thank you!"
          : state.status === "pending"
            ? "Payment is pending. Ads will be removed when Google Play confirms payment."
            : state.status === "cancelled"
              ? "Purchase cancelled."
              : "No Remove ads purchase found for this Play account.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Google Play is unavailable. Please try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return {
    ready,
    adsRemoved,
    price,
    busy: busy || checking,
    purchaseInProgress: busy,
    message,
    supported: !!bridge,
    buy: () => perform("buy"),
    restore: () => perform("restore"),
  };
}
