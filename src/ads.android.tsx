import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { AppState, TurboModuleRegistry, View } from "react-native";

// Expo Go does not contain this native SDK; keep the puzzle usable there.
const sdk: typeof import("react-native-google-mobile-ads") | null =
  TurboModuleRegistry.get("RNGoogleMobileAdsModule")
    ? require("react-native-google-mobile-ads")
    : null;

export const BANNER_HEIGHT = sdk ? 66 : 0;
const BANNER_UNIT = "ca-app-pub-6230290323057717/1515005956";
const INTERSTITIAL_UNIT = "ca-app-pub-6230290323057717/5841263777";
const requestOptions = { requestNonPersonalizedAdsOnly: true };

export function useAds(enabled: boolean) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [canShowBanner, setCanShowBanner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [privacyRequired, setPrivacyRequired] = useState(false);
  const initialized = useRef(false);
  const interstitial = useRef<{
    ad: import("react-native-google-mobile-ads").InterstitialAd;
    loadedAt: number;
    showing: boolean;
  } | null>(null);
  const [interstitialGeneration, setInterstitialGeneration] = useState(0);
  const adsAllowed = enabled && canShowBanner && !busy;
  const allowed = useRef(adsAllowed);
  allowed.current = adsAllowed;

  useEffect(() => {
    if (!sdk || !adsAllowed) return;
    const ad = sdk.InterstitialAd.createForAdRequest(
      __DEV__ ? sdk.TestIds.INTERSTITIAL : INTERSTITIAL_UNIT,
      requestOptions,
    );
    const slot = { ad, loadedAt: 0, showing: false };
    interstitial.current = slot;
    const unsubscribe = [
      ad.addAdEventListener(sdk.AdEventType.LOADED, () => {
        slot.loadedAt = Date.now();
      }),
      ad.addAdEventListener(sdk.AdEventType.CLOSED, () => {
        slot.loadedAt = 0;
        setInterstitialGeneration((generation) => generation + 1);
      }),
      ad.addAdEventListener(sdk.AdEventType.ERROR, (error) => {
        slot.loadedAt = 0;
        slot.showing = false;
        console.warn("[AdMob] Interstitial unavailable:", error.message);
      }),
    ];
    try {
      ad.load();
    } catch (error) {
      console.warn("[AdMob] Interstitial load unavailable:", String(error));
    }
    return () => {
      unsubscribe.forEach((remove) => remove());
      if (interstitial.current === slot) interstitial.current = null;
    };
  }, [adsAllowed, interstitialGeneration]);

  const showWinInterstitial = useCallback(async () => {
    const slot = interstitial.current;
    if (
      !allowed.current ||
      !slot ||
      slot.showing ||
      AppState.currentState !== "active"
    )
      return;
    // Never wait for a late ad or reuse an ad near Google's one-hour expiry.
    if (!slot.loadedAt || Date.now() - slot.loadedAt >= 55 * 60 * 1000) {
      setInterstitialGeneration((generation) => generation + 1);
      return;
    }
    slot.showing = true;
    slot.loadedAt = 0;
    try {
      await slot.ad.show();
    } catch (error) {
      console.warn("[AdMob] Interstitial display unavailable:", String(error));
      if (interstitial.current === slot)
        setInterstitialGeneration((generation) => generation + 1);
    }
  }, []);

  const refreshConsent = useCallback(async () => {
    if (!sdk || !enabledRef.current) return;
    const info = await sdk.AdsConsent.getConsentInfo();
    if (!enabledRef.current) return;
    setPrivacyRequired(
      info.privacyOptionsRequirementStatus ===
        sdk.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
    );
    if (info.canRequestAds && !initialized.current) {
      await sdk
        .default()
        .setRequestConfiguration({ testDeviceIdentifiers: ["EMULATOR"] });
      if (!enabledRef.current) return;
      await sdk.default().initialize();
      initialized.current = true;
    }
    setCanShowBanner(enabledRef.current && info.canRequestAds && initialized.current);
  }, []);

  useEffect(() => {
    if (!enabled || !sdk) {
      setBusy(false);
      setCanShowBanner(false);
      return;
    }
    let active = true;
    setBusy(true);
    const prepare = async () => {
      try {
        await sdk.AdsConsent.gatherConsent();
      } catch (error) {
        // UMP may still allow ads using consent saved from an earlier session.
        console.warn("[AdMob] Consent update unavailable:", String(error));
      }
      if (active) await refreshConsent();
    };
    prepare()
      .catch((error) =>
        console.warn("[AdMob] Initialization unavailable:", String(error)),
      )
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, refreshConsent]);

  const showPrivacyOptions = useCallback(async () => {
    if (!sdk || !enabledRef.current) return;
    setBusy(true);
    setCanShowBanner(false);
    try {
      await sdk.AdsConsent.showPrivacyOptionsForm();
    } catch (error) {
      console.warn("[AdMob] Privacy form unavailable:", String(error));
    } finally {
      try {
        await refreshConsent();
      } catch (error) {
        console.warn("[AdMob] Consent refresh unavailable:", String(error));
      } finally {
        setBusy(false);
      }
    }
  }, [refreshConsent]);

  return {
    canShowBanner: adsAllowed,
    busy,
    privacyRequired,
    showPrivacyOptions,
    showWinInterstitial,
  };
}

export const BannerAdSlot = memo(function BannerAdSlot({
  enabled,
  background,
  border,
}: {
  enabled: boolean;
  background: string;
  border: string;
}) {
  if (!sdk) return null;
  const { BannerAd, BannerAdSize, TestIds } = sdk;
  return (
    <View
      accessibilityLabel="Advertisement"
      style={{
        height: BANNER_HEIGHT,
        width: "100%",
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: background,
        borderTopWidth: 1,
        borderTopColor: border,
      }}
    >
      {enabled && (
        <BannerAd
          unitId={__DEV__ ? TestIds.BANNER : BANNER_UNIT}
          size={BannerAdSize.BANNER}
          requestOptions={requestOptions}
          onAdLoaded={() => console.info("[AdMob] Banner loaded")}
          onAdFailedToLoad={(error) =>
            console.warn("[AdMob] Banner unavailable:", error.message)
          }
        />
      )}
    </View>
  );
});
