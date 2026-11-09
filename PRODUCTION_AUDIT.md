# Production audit — Sandwich Sudoku - Brain Puzzle

Audit date: November 7, 2026; dependency scan follow-up: November 8, 2026. Scope: Android / Google Play, `com.sandwichsudokupuzzle.app`.

The local fixes and release checks are complete. The new bundle is suitable for the next Internal testing round. Production sign-off still requires the account-side configuration and real-device tests listed below. No developer account, Play Console account, or AdMob dashboard was accessed.

## Findings fixed

| Finding | Result |
| --- | --- |
| Previous builds ran R8 with the default `proguard-android.txt`, which contributed `-dontoptimize`. Earlier claims that the optimizer was fully enabled were incomplete. | Added `plugins/withReleaseConfig.js`, which selects `proguard-android-optimize.txt`, enables code/resource shrinking, full-mode R8 and optimized resource shrinking persistently through Expo prebuild. The release gate rejects effective `-dontoptimize`, `-dontshrink` and `-dontobfuscate` directives. |
| The privacy HTML existed online but was missing from the app. | Settings → Privacy policy now contains all 11 sections offline, with working link controls and a link to the public policy. The offline copy is generated from the same HTML source. Opening a different dialog resets its scroll position. |
| The purchase button displayed an invented USD price when Play had not supplied one. | Removed the $2.99 fallback. The app displays Play's localized price and disables purchasing when the price is unavailable. Resume and manual restoration retry price lookup. |
| Startup cached entitlement and restoration ran concurrently. A late cache response could overwrite a newer Play result. | Cache loading now precedes restoration. The previous confirmed entitlement is retained on a Play connectivity failure. |
| Release contained unused vibration and foreground-service permissions. | Both are blocked in `app.json`; the merged release manifest and release gate confirm their absence. |
| `.gitignore` used unanchored `android/`, which also hid `plugins/android/RemoveAdsBillingModule.kt`. | Generated native roots are now `/android/` and `/ios/`; the billing source is included. Signing keys, keystore properties, environment secrets, build products and caches are ignored. |
| Upload version increments were manual. | `build-bundle.ps1` now checks the app, increments the patch version and versionCode, builds, then validates the result. A retry through this script also advances the version; version-code gaps are intentional. |

## Verified locally

- TypeScript type checking and 26 automated tests pass. Coverage includes puzzle uniqueness and all transformations, saved-game validation, consent gating and withdrawal, removing ads during consent, preventing duplicate initialization, cached-owner behavior offline, pending/cancelled/completed purchase responses, restoration on resume, revocation, localized pricing, and complete offline policy generation.
- The Settings → Privacy policy flow was opened and inspected at a 390×844 mobile viewport in the local web preview. All policy sections, contact details, and external link controls appear in the accessibility tree; the policy opens at the top after the scroll reset fix. Evidence: `artifacts/in-app-privacy-mobile.png`.
- The public policy URL returned HTTP 200 with HTML content containing the app name and developer email: https://imediasystemsllc.com/sandwich-sudoku-privacy-policy.html.
- Signed Android release builds pass Gradle's release lint. `verify-release.ps1` checks package/version identity, non-debuggable release settings, effective R8 configuration, non-empty shrinking and mapping reports, embedded deobfuscation metadata, valid DEX headers, compiled Hermes bytecode, native ELF load alignment of at least 16 KB, signing identity, permissions, ad IDs and policy content. Machine-readable evidence is saved beside the final AAB.
- Thirty bundled 64-bit native libraries passed the static 16 KB ELF alignment check. This is not an execution test on a 16 KB device, or a measurement of Play's DEX optimization score.
- Release targets Android API 36. The original upload certificate is reused. The generated launcher/adaptive/monochrome layers retain the requested source and padding.

## AdMob configuration

| Purpose | Production ID verified in release content |
| --- | --- |
| App | `ca-app-pub-6230290323057717~2828087629` |
| Bottom banner | `ca-app-pub-6230290323057717/1515005956` |
| Win interstitial | `ca-app-pub-6230290323057717/5841263777` |

Development builds use Google's test ad units; emulators are registered as ad test devices. The app requests non-personalized ads. It updates consent through UMP, waits until the SDK permits ad requests, exposes Ad privacy choices when required, and stops both ad formats after a confirmed Remove Ads entitlement. Consent denial does not block puzzle play. Ad-unit ownership, serving eligibility, account approval and published consent messages cannot be verified from source code.

## Release permissions

The allowed merged release permissions are Internet, network state, wake lock, Play Billing, Google advertising ID, Android AdServices ID/attribution/topics, and the app's signature-protected internal receiver permission. Network and advertising permissions support the bundled Google SDKs; wake lock is used by their background delivery infrastructure. There is no vibration, foreground service, microphone, storage access, camera, location, notification, contacts or overlay permission in the merged release manifest. The gate fails on an unexpected added permission.

## Remaining before production

1. **Real Play purchase/restore tests — required.** In your account, verify `remove_ads` and its Buy option are active and priced in the tester's region. Install the new AAB through the Internal testing track with a license tester. Exercise approved, cancelled and pending test payments; confirm pending purchases do not remove ads; confirm completed purchases remove both formats; confirm Restore purchases works after reinstall and on another device with the same Play account. Check acknowledgement and refunded/revoked ownership. These native store flows have not been tested against your account.
2. **Consent and live ads — required.** Confirm your AdMob privacy messages are published for this app. On a native test installation, test the applicable consent form, refusal, reopening privacy choices, network failures and ad-free restoration. Local tests mock the SDK; the web preview does not load Android's advertising SDK. Use test ads/devices for interaction testing.
3. **Target audience — needs your confirmation.** You supplied the public policy URL but did not yet confirm whether the app is directed to children under 13. The app does not currently set child-directed or under-age flags. If children are included, the audience declarations, ad/consent configuration and policy must be reviewed before production. Non-personalized ads alone do not resolve children's requirements.
4. **Store disclosures and release-device QA — required.** Enter the public policy URL in Play Console and ensure Data safety, Contains ads, content rating and target audience match the implementation. Run Play's pre-launch checks and test the optimized Android release on actual devices, including an upgrade from the previous upload, process termination/resume, small screens, large text and a 16 KB device. Only the local mobile web policy layout and automated code paths were exercised here. Play's final optimization/compliance assessment is not available locally.
5. **Purchase fraud resistance — limitation.** This app acknowledges and restores purchases through Play Billing on the device and caches the entitlement in local preferences. It has no independent server-side receipt verification or real-time developer notification service. A modified/rooted client can bypass client-side checks, and revocations are observed on the next successful Play refresh. A secure backend is the recommended hardening if stronger entitlement enforcement is required.
6. **Dependency vulnerabilities — remediation remains open.** With the user's explicit authorization, `npm audit --omit=dev --json --registry=https://registry.npmjs.org` completed on November 8, 2026. It reported 12 affected package entries: 2 high, 9 moderate, 1 low, and 0 critical. These entries propagate four distinct advisories through Expo's tooling dependency chain; they are not 12 independent vulnerabilities. See the scope and findings below. Dependencies were not changed by the scan.

The iOS configuration still contains Google's sample AdMob app ID and the billing implementation is Android-specific. This audit does not approve an iOS release.

## Dependency scan findings — November 8, 2026

| Underlying package | Installed version | Advisory severity | Use in this project |
| --- | --- | --- | --- |
| `zod` | 3.25.76 | High | Expo CLI schema validation; oversized constrained collections can exhaust memory. [Advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |
| `glob` | 13.0.6 | Moderate | Expo CLI, config, fingerprinting and Metro tooling; cancellation may fail to stop filesystem traversal. [Advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) |
| `minimatch` | 10.2.6 | Moderate | Expo fingerprinting and glob matching; pathological patterns can amplify resource use. [Advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| `deepmerge` | 4.3.1 | Low | Expo configuration merging; specially crafted properties can poison merged objects. [Advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) |

`npm explain` traces these versions to the Expo build/configuration toolchain. Although this scan omits packages marked `devDependencies`, Expo declares its tooling as production dependencies, so those packages remain in the npm audit scope. The other flagged entries are `expo`, `@expo/cli`, `@expo/config`, `@expo/config-plugins`, `@expo/fingerprint`, `@expo/local-build-cache-provider`, `@expo/metro-config` and `@expo/prebuild-config`, which inherit affected transitive dependencies.

None of the four underlying affected packages appears among the 818 sources in the current Android release's composed JavaScript source map. This supports build-time exposure rather than inclusion of these libraries in that release's shipped JavaScript; it does not establish that all app/native dependencies are vulnerability-free. The npm scan does not cover Maven/Gradle native dependencies, developer account settings, or unknown vulnerabilities.

npm proposes replacing the installed Expo 55 SDK with Expo 53.0.11 through a semver-major fix. An automatic forced downgrade could break the React Native/Expo compatibility set, so no `npm audit fix --force` or untested transitive major override was applied. Remediation needs compatible upstream updates or a tested SDK migration. Until then, avoid processing untrusted project/configuration files or exposing development servers beyond trusted local development.

Raw results and supporting evidence are retained locally under `artifacts/dependency-audit.json`, `artifacts/dependency-audit-summary.json` and `artifacts/dependency-paths.json`. No new AAB or version bump was needed because this follow-up changed documentation and scan evidence only.

## Build and evidence

Final audited artifact: **1.0.5, versionCode 6** — `android/app/release/SandwichSudoku-1.0.5.aab`. Verification evidence: `android/app/release/SandwichSudoku-1.0.5-verification.json`. The AAB contains one DEX file with 8,543 classes and 51,926 method references; all 30 native libraries pass the static alignment check.

Run `./scripts/build-bundle.ps1` for each new Play upload artifact. It increments the version automatically and places the signed AAB and its verification JSON in `android/app/release/`. Keep `.upload-signing/` backed up privately; it is excluded from Git. Commit the source files separately when ready; this audit does not create a Git commit.

The effective optimizer settings and artifact structure are verified, but successful builds do not certify real purchases, ad delivery, every device configuration, account settings, or Play approval.

## Data safety follow-up — November 8, 2026

The submission target remains 1.0.5 (6), with no code or bundle changes. The owner confirmed AdMob only, with no mediation, and that a deletion-request process is **not set up yet**. This creates a pre-submission policy mismatch: the live HTML and matching offline policy currently invite users to request deletion by email. Operationalize that process or correct both policy copies before submission; do not claim a working deletion-request mechanism merely because the email address exists.

The exact release dependency tree confirms Google Mobile Ads 24.9.0, UMP 4.0.0, and Play Billing 9.1.0. All six retained AABs contain metadata matching these versions; their actual Play-track distribution is not known. Google's current Mobile Ads disclosure explicitly describes version 25.5.0, so applying its categories to 24.9.0 is a documented SDK-family assessment, not a version-pinned privacy attestation. No Firebase Analytics or Crashlytics SDK or third-party mediation adapter was found; Firebase encoder and Google measurement utility dependencies do exist and must not be confused with standalone Firebase Analytics/Crashlytics integration.

The scoped draft, including per-type handling, purchase-history interpretation and uncertainty notes, is in `artifacts/data-safety-draft.json`; release inventory and Gradle SDK evidence are in `artifacts/data-safety-release-inventory.json` and `artifacts/release-sdk-dependencies.txt`. It remains a draft for review against user-provided screenshots. No account was accessed or form submitted.

## Primary references

- [Android: enable optimization with R8](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization)
- [Android: support 16 KB page sizes](https://developer.android.com/guide/practices/page-sizes)
- [AdMob: UMP consent setup and privacy choices](https://developers.google.com/admob/android/privacy)
- [Play Billing: purchase verification and fraud resistance](https://developer.android.com/google/play/billing/security)
