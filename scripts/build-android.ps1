$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  . ./scripts/android-env.ps1
  & node ./scripts/generate-privacy-policy.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Privacy policy generation failed.' }
  & node ./scripts/generate-icons.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed.' }
  & npx.cmd expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw 'Expo prebuild failed.' }
  # React Native can retain the previous package ID after an Expo rename.
  $taskAutolink = Join-Path (Get-Location) 'android/build/generated/autolinking/autolinking.json'
  if (Test-Path -LiteralPath $taskAutolink) {
    $taskCachedPackage = (Get-Content -LiteralPath $taskAutolink -Raw | ConvertFrom-Json).project.android.packageName
    $taskRequestedPackage = (Get-Content -LiteralPath 'app.json' -Raw | ConvertFrom-Json).expo.android.package
    if ($taskCachedPackage -ne $taskRequestedPackage) {
      Remove-Item -LiteralPath $taskAutolink
    }
  }
  Push-Location android
  try {
    & ./gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' '-Pandroid.enableMinifyInReleaseBuilds=true' '-Pandroid.enableShrinkResourcesInReleaseBuilds=true' '-PlocalTestSigning=true'
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
  } finally { Pop-Location }
  $taskReleaseDir = Join-Path (Get-Location) 'android/app/release'
  $taskVersion = (Get-Content -LiteralPath 'app.json' -Raw | ConvertFrom-Json).expo.version
  $taskApk = Join-Path $taskReleaseDir "SandwichSudoku-$taskVersion-preview.apk"
  New-Item -ItemType Directory -Path $taskReleaseDir -Force | Out-Null
  Copy-Item -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk' -Destination $taskApk -Force
  Write-Host "Preview APK: $taskApk"
} finally { Pop-Location }
