# Sandwich Sudoku - Brain Puzzle

An Android-first Expo / React Native app adapted from the adjacent Thermo Sudoku project. Package: `com.sandwichsudokupuzzle.app`. Version: 1.0.5 (6).

Preserves the original sage/cream and dark themes, play screen, four difficulty choices, four-corner notes, undo, erase, hint preview, restart, solve, timer, local saves, stats, settings, keep-awake option, ad consent, and Google Play remove-ads purchase restoration.

## Sandwich rules

Fill each row, column, and 3×3 box with 1–9 exactly once. The numbers above and to the left of the grid give the sum strictly between 1 and 9 in that column or row. Either order is allowed. Zero means adjacent crusts; 35 means opposite ends; 2, 3, and 4 mean exactly one filling digit. This app uses the original 9×9 format.

## Development

- `npm ci`
- `npm start` (Expo Go supports gameplay; native ads and billing require a native build)
- `npm run web`
- `npm run typecheck`
- `npm test`
- `npm run puzzles` regenerates 48 deterministic puzzles, 12 per difficulty. Every removal is checked for uniqueness under both Sudoku and sandwich constraints. Difficulty labels reflect clue counts (38, 30, 24, 20), not a measured human-solving rating.
- `npm run icons` packages the complete root `app_icon.jpg` into the launcher, centered 640×640 adaptive artwork on a transparent 1024×1024 canvas (192 px padding), matching monochrome layers and previews in `artifacts/`.
- `./scripts/build-android.ps1` produces a locally signed preview APK with R8 and resource shrinking.
- `npm run privacy` regenerates the complete offline policy from `privacy-policy.html`. Settings also links to the published policy at https://imediasystemsllc.com/sandwich-sudoku-privacy-policy.html.
- `./scripts/build-bundle.ps1` runs checks, increments the patch version and Android version code, reuses or creates the upload key, and builds a signed Play bundle. Each invocation advances the version, including a retry after a failed build. Securely back up `.upload-signing/`; never commit it.
- `./scripts/verify-release.ps1 -BundlePath <path-to-aab>` verifies the effective optimized R8 rules, shrinking reports, DEX, Hermes bytecode, 16 KB ELF alignment, release permissions, signing identity, production ad IDs, and embedded policy. The bundle build runs this gate and writes evidence beside its AAB.

The original project and its signing keys are not modified or copied. Progress is saved under `@sandwich-sudoku/v1`.

## Before Google Play publication

The Android app ID, bottom banner unit, and win interstitial unit in `app.json` and `src/ads.android.tsx` use the production AdMob IDs supplied by the developer. Development builds use Google's test ad units; emulators are registered as test devices. Activate the `remove_ads` one-time product and its Buy option in Play Console and verify buying and restoring through a Play testing track. Billing cannot be verified by installing a locally signed preview. The full privacy policy is available offline in Settings and its public URL has been checked. Complete the store's Data safety, target audience, and AdMob consent-message configuration. The local mobile web privacy flow has been visually verified; Android release-device and actual Play payment/consent tests are still required. See `PRODUCTION_AUDIT.md` for the findings and limits.

Generated root `/android/` and `/ios/`, dependency directories, signing material, environment secrets, and build artifacts are ignored. The `/android/` rule is anchored so `plugins/android/RemoveAdsBillingModule.kt` remains included. Native configuration is reproducible from `app.json` and `plugins/`, including billing and optimized-release configuration.
