import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { URL } from "node:url";
import ts from "typescript";

// Exercise the Android hook without loading React Native's native runtime.
function adsHarness() {
  const slots: any[] = [];
  let cursor = 0;
  let dirty = true;
  let enabled = true;
  let result: any;
  const pending: (() => void)[] = [];
  const ads: { listeners: Map<string, (...args: any[]) => void>; shows: number; loads: number }[] = [];
  let consentReads = 0;
  let canRequestAds = true;
  let consentFailure = false;
  let infoFailure = false;
  let initializationCount = 0;
  let holdConsent: Promise<void> | undefined;
  const react = {
    memo: (component: unknown) => component,
    useRef: (value: unknown) => {
      const index = cursor++;
      return (slots[index] ??= { current: value });
    },
    useState: (value: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], (next: any) => {
        const value = typeof next === "function" ? next(slots[index]) : next;
        if (!Object.is(value, slots[index])) {
          slots[index] = value;
          dirty = true;
        }
      }];
    },
    useCallback: (callback: unknown, deps: unknown[]) => {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) slots[index] = {callback, deps};
      return slots[index].callback;
    },
    useEffect: (effect: () => any, deps: unknown[]) => {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        pending.push(() => {
          slots[index].cleanup?.();
          slots[index].cleanup = effect();
        });
      }
    },
  };
  const sdk = {
    __esModule: true,
    default: () => ({
      setRequestConfiguration: async () => {},
      initialize: async () => { initializationCount++; },
    }),
    AdsConsentPrivacyOptionsRequirementStatus: { REQUIRED: "required" },
    AdsConsent: {
      gatherConsent: async () => { await holdConsent; if (consentFailure) throw new Error("Offline"); },
      showPrivacyOptionsForm: async () => { canRequestAds = false; },
      getConsentInfo: async () => {
        consentReads++;
        if (infoFailure) throw new Error("Consent unavailable");
        return { canRequestAds, privacyOptionsRequirementStatus: "required" };
      },
    },
    TestIds: { INTERSTITIAL: "test-interstitial" },
    AdEventType: { LOADED: "loaded", CLOSED: "closed", ERROR: "error" },
    InterstitialAd: {
      createForAdRequest: () => {
        const ad = { listeners: new Map(), shows: 0, loads: 0 };
        ads.push(ad);
        return {
          addAdEventListener: (event: string, callback: () => void) => {
            ad.listeners.set(event, callback);
            return () => ad.listeners.delete(event);
          },
          load: () => { ad.loads++; },
          show: async () => { ad.shows++; },
        };
      },
    },
  };
  const module = { exports: {} as any };
  const source = readFileSync(new URL("../src/ads.android.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  });
  runInNewContext(compiled.outputText, {
    exports: module.exports,
    require: (name: string) => {
      if (name === "react") return react;
      if (name === "react-native") return {
        AppState: { currentState: "active" },
        TurboModuleRegistry: { get: () => true },
      };
      if (name === "react-native-google-mobile-ads") return sdk;
      throw new Error(`Unexpected import: ${name}`);
    },
    __DEV__: true,
    console,
  });
  return {
    ads,
    setCanRequestAds(value: boolean) { canRequestAds = value; },
    failConsent() { consentFailure = true; },
    failConsentInfo() { infoFailure = true; },
    get initializationCount() { return initializationCount; },
    get result() { return result; },
    get consentReads() { return consentReads; },
    holdConsent(promise: Promise<void>) { holdConsent = promise; },
    async render(nextEnabled = enabled) {
      enabled = nextEnabled;
      dirty = true;
      for (let turn = 0; turn < 10; turn++) {
        if (dirty) {
          dirty = false;
          cursor = 0;
          result = module.exports.useAds(enabled);
          pending.splice(0).forEach((effect) => effect());
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    },
  };
}

test("Remove ads blocks a preloaded interstitial, hides the banner, and cleans up listeners", async () => {
  const hook = adsHarness();
  await hook.render();
  assert.equal(hook.result.canShowBanner, true);
  assert.equal(hook.ads.length, 1);
  hook.ads[0].listeners.get("loaded")!();
  const oldShow = hook.result.showWinInterstitial;
  await hook.render(false);
  assert.equal(hook.result.canShowBanner, false);
  assert.equal(hook.ads[0].listeners.size, 0);
  await oldShow();
  await hook.result.showWinInterstitial();
  assert.equal(hook.ads[0].shows, 0);
  assert.equal(hook.ads.length, 1);
});

test("an existing Remove ads owner starts with neither ad format nor consent requests", async () => {
  const hook = adsHarness();
  await hook.render(false);
  assert.equal(hook.result.canShowBanner, false);
  assert.equal(hook.consentReads, 0);
  assert.equal(hook.ads.length, 0);
  await hook.result.showWinInterstitial();
  assert.equal(hook.ads.length, 0);
});

test("purchase during consent preparation cannot enable ads afterward", async () => {
  const hook = adsHarness();
  let finish!: () => void;
  hook.holdConsent(new Promise<void>((resolve) => { finish = resolve; }));
  await hook.render();
  await hook.render(false);
  finish();
  await hook.render(false);
  assert.equal(hook.result.canShowBanner, false);
  assert.equal(hook.consentReads, 0);
  assert.equal(hook.ads.length, 0);
});

test("a loaded interstitial shows once and closing it prepares another", async () => {
  const hook = adsHarness();
  await hook.render();
  await hook.result.showWinInterstitial();
  assert.equal(hook.ads[0].shows, 0);
  await hook.render();
  const ad = hook.ads.at(-1)!;
  ad.listeners.get("loaded")!();
  await hook.result.showWinInterstitial();
  await hook.result.showWinInterstitial();
  assert.equal(ad.shows, 1);
  ad.listeners.get("closed")!();
  const before = hook.ads.length;
  await hook.render();
  assert.equal(hook.ads.length, before + 1);
});

test("consent denial keeps both ad formats disabled without initializing the SDK", async () => {
  const hook = adsHarness(); hook.setCanRequestAds(false);
  await hook.render();
  assert.equal(hook.result.canShowBanner, false);
  assert.equal(hook.result.busy, false);
  assert.equal(hook.initializationCount, 0);
  assert.equal(hook.ads.length, 0);
});
test("a consent update failure uses cached permission, while unknown consent fails closed", async () => {
  const cached = adsHarness(); cached.failConsent(); await cached.render();
  assert.equal(cached.result.canShowBanner, true);
  const unknown = adsHarness(); unknown.failConsentInfo(); await unknown.render();
  assert.equal(unknown.result.canShowBanner, false);
  assert.equal(unknown.result.busy, false);
  assert.equal(unknown.ads.length, 0);
});
test("withdrawing ad consent discards a preloaded interstitial and hides the banner", async () => {
  const hook = adsHarness(); await hook.render();
  const oldShow = hook.result.showWinInterstitial;
  hook.ads[0].listeners.get("loaded")!();
  await hook.result.showPrivacyOptions(); await hook.render();
  assert.equal(hook.result.canShowBanner, false);
  assert.equal(hook.ads[0].listeners.size, 0);
  await oldShow(); assert.equal(hook.ads[0].shows, 0);
});
test("ordinary rerenders neither repeat consent nor initialize the SDK twice", async () => {
  const hook = adsHarness(); await hook.render(); await hook.render();
  assert.equal(hook.initializationCount, 1);
  assert.equal(hook.consentReads, 1);
});
