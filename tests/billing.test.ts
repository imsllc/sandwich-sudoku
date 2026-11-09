import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function billingHarness(supported = true) {
  const slots: any[] = [], effects: (() => void)[] = [];
  const listeners = new Map<string, (...args: any[]) => void>();
  let cursor = 0, dirty = true, result: any, restoreCalls = 0;
  let cachedState: Promise<any> = Promise.resolve({owned: false, status: "cached"});
  let restoredState: any = {owned: false, status: "not_owned"};
  let purchaseState: any = {owned: false, status: "pending"};
  let product: any = {price: "€4.49"};
  let offline = false;
  const react = {
    useRef: (value: unknown) => { const i = cursor++; return slots[i] ??= {current: value}; },
    useState: (value: unknown) => {
      const i = cursor++; if (!(i in slots)) slots[i] = value;
      return [slots[i], (next: any) => { const v = typeof next === "function" ? next(slots[i]) : next;
        if (!Object.is(v, slots[i])) {slots[i] = v; dirty = true;} }];
    },
    useCallback: (callback: unknown, deps: unknown[]) => {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((v, k) => !Object.is(v, previous.deps[k]))) slots[i] = {callback, deps};
      return slots[i].callback;
    },
    useEffect: (effect: () => any, deps: unknown[]) => {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((v, k) => !Object.is(v, previous.deps[k]))) {
        slots[i] = {deps, cleanup: previous?.cleanup};
        effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
  };
  const bridge = {
    cached: () => cachedState,
    restore: async () => { restoreCalls++; if (offline) throw new Error("Offline"); return restoredState; },
    product: async () => { if (offline) throw new Error("Offline"); return product; },
    buy: async () => purchaseState,
  };
  const addListener = (name: string, callback: (...args: any[]) => void) => { listeners.set(name, callback); return {remove: () => listeners.delete(name)}; };
  const module = {exports: {} as any};
  const compiled = ts.transpileModule(readFileSync(new URL("../src/billing.ts", import.meta.url), "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS}});
  runInNewContext(compiled.outputText, {exports: module.exports, require: (name: string) => {
    if (name === "react") return react;
    if (name === "react-native") return {
      Platform: {OS: supported ? "android" : "web"}, NativeModules: {RemoveAdsBilling: bridge},
      AppState: {addEventListener: addListener}, NativeEventEmitter: class { addListener = addListener; },
    };
    throw new Error(name);
  }});
  return {
    get result() { return result; }, get restoreCalls() { return restoreCalls; },
    cache(promise: Promise<any>) { cachedState = promise; }, restore(state: any) { restoredState = state; },
    purchase(state: any) { purchaseState = state; }, product(value: any) { product = value; },
    offline(value = true) { offline = value; }, resume() { listeners.get("change")?.("active"); },
    async render() {
      for (let turn = 0; turn < 15; turn++) {
        if (dirty) { dirty = false; cursor = 0; result = module.exports.useBilling(); effects.splice(0).forEach(f => f()); }
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    },
  };
}

test("billing waits for cached entitlement before restoration and uses Play's localized price", async () => {
  const hook = billingHarness(); let finish!: (value: any) => void;
  hook.cache(new Promise(resolve => {finish = resolve;}));
  hook.restore({owned: true, status: "purchased"}); await hook.render();
  assert.equal(hook.restoreCalls, 0); assert.equal(hook.result.ready, false);
  finish({owned: false, status: "cached"}); await hook.render();
  assert.equal(hook.result.ready, true); assert.equal(hook.result.adsRemoved, true);
  assert.equal(hook.result.price, "€4.49");
});
test("a cached owner keeps ad-free access when Play is offline", async () => {
  const hook = billingHarness(); hook.cache(Promise.resolve({owned: true, status: "cached"})); hook.offline();
  await hook.render(); assert.equal(hook.result.adsRemoved, true); assert.equal(hook.result.busy, false);
  await hook.result.restore(); await hook.render(); assert.equal(hook.result.adsRemoved, true);
  assert.match(hook.result.message, /unavailable/);
});
test("pending and cancelled purchases never grant the entitlement; a completed purchase does", async () => {
  const hook = billingHarness(); await hook.render();
  for (const status of ["pending", "cancelled"]) {
    hook.purchase({owned: false, status}); await hook.result.buy(); await hook.render();
    assert.equal(hook.result.adsRemoved, false);
    assert.match(hook.result.message, status === "pending" ? /pending/ : /cancelled/);
  }
  hook.purchase({owned: true, status: "purchased"}); await hook.result.buy(); await hook.render();
  assert.equal(hook.result.adsRemoved, true);
});
test("resume restores purchases, handles revocation, and retries previously unavailable pricing", async () => {
  const hook = billingHarness(); hook.product(null); await hook.render(); assert.equal(hook.result.price, null);
  hook.product({price: "$1.99"}); hook.restore({owned: true, status: "purchased"}); hook.resume(); await hook.render();
  assert.equal(hook.result.adsRemoved, true); assert.equal(hook.result.price, "$1.99");
  hook.restore({owned: false, status: "not_owned"}); hook.resume(); await hook.render();
  assert.equal(hook.result.adsRemoved, false);
});
test("web reports billing as unsupported without requesting purchases", async () => {
  const hook = billingHarness(false); await hook.render();
  assert.equal(hook.result.supported, false); assert.equal(hook.result.ready, true); assert.equal(hook.restoreCalls, 0);
});
