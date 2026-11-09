$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  . ./scripts/android-env.ps1
  & node ./scripts/generate-privacy-policy.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Privacy policy generation failed.' }
  & npm.cmd run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'Type checking failed.' }
  & npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
  & node ./scripts/bump-version.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Version bump failed.' }
  & node ./scripts/generate-icons.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed.' }
  & ./scripts/create-upload-key.ps1
  & npx.cmd expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw 'Expo prebuild failed.' }
  Push-Location android
  try {
    & ./gradlew.bat :app:bundleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' '-Pandroid.enableMinifyInReleaseBuilds=true' '-Pandroid.enableShrinkResourcesInReleaseBuilds=true'
    if ($LASTEXITCODE -ne 0) { throw 'Play bundle build failed.' }
  } finally { Pop-Location }
  $taskReleaseDir = Join-Path (Get-Location) 'android/app/release'
  $taskVersion = (Get-Content -LiteralPath 'app.json' -Raw | ConvertFrom-Json).expo.version
  $taskBundle = Join-Path $taskReleaseDir "SandwichSudoku-$taskVersion.aab"
  New-Item -ItemType Directory -Path $taskReleaseDir -Force | Out-Null
  Copy-Item -LiteralPath 'android/app/build/outputs/bundle/release/app-release.aab' -Destination $taskBundle -Force
  & ./scripts/verify-release.ps1 -BundlePath $taskBundle
  Write-Host "Play bundle: $taskBundle"
} finally { Pop-Location }
