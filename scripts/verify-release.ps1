param([Parameter(Mandatory=$true)][string]$BundlePath)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
Push-Location $taskRoot
try {
  . ./scripts/android-env.ps1
  $taskApp = (Get-Content app.json -Raw | ConvertFrom-Json).expo
  $taskManifestPath = 'android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml'
  [xml]$taskManifest = Get-Content -LiteralPath $taskManifestPath -Raw
  $taskNs = 'http://schemas.android.com/apk/res/android'
  if ($taskManifest.manifest.package -ne $taskApp.android.package) { throw 'Release package mismatch.' }
  if ($taskManifest.manifest.GetAttribute('versionCode', $taskNs) -ne [string]$taskApp.android.versionCode) { throw 'Release version code mismatch.' }
  if ($taskManifest.manifest.GetAttribute('versionName', $taskNs) -ne $taskApp.version) { throw 'Release version name mismatch.' }
  foreach ($taskAttribute in @('debuggable','testOnly','usesCleartextTraffic')) {
    if ($taskManifest.manifest.application.GetAttribute($taskAttribute, $taskNs) -eq 'true') { throw "Unsafe release setting: $taskAttribute" }
  }
  $taskPermissions = @($taskManifest.manifest.'uses-permission' | ForEach-Object { $_.GetAttribute('name', $taskNs) })
  $taskAllowed = @('android.permission.INTERNET','android.permission.ACCESS_NETWORK_STATE','android.permission.WAKE_LOCK',
    'com.android.vending.BILLING','com.google.android.gms.permission.AD_ID','android.permission.ACCESS_ADSERVICES_AD_ID',
    'android.permission.ACCESS_ADSERVICES_ATTRIBUTION','android.permission.ACCESS_ADSERVICES_TOPICS',
    "$($taskApp.android.package).DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION")
  foreach ($taskPermission in $taskPermissions) { if ($taskPermission -notin $taskAllowed) { throw "Unexpected release permission: $taskPermission" } }
  $taskConfigPath = 'android/app/build/outputs/mapping/release/configuration.txt'
  $taskR8 = Get-Content -LiteralPath $taskConfigPath -Raw
  if ($taskR8 -match '(?m)^\s*-(dontoptimize|dontshrink|dontobfuscate)\b') { throw 'Effective R8 configuration disables optimization, shrinking, or obfuscation.' }
  $taskGradle = Get-Content android/app/build.gradle -Raw
  if ($taskGradle -notmatch 'proguard-android-optimize.txt') { throw 'Optimized Android default rules are missing.' }
  $taskProperties = Get-Content android/gradle.properties -Raw
  foreach ($taskProperty in @('android.enableMinifyInReleaseBuilds','android.enableShrinkResourcesInReleaseBuilds','android.r8.fullMode','android.r8.optimizedResourceShrinking')) {
    if ($taskProperties -notmatch "(?m)^$([regex]::Escape($taskProperty))=true\s*$") { throw "Release property is not enabled: $taskProperty" }
  }
  $taskMapping = Get-Item android/app/build/outputs/mapping/release/mapping.txt
  $taskUsage = Get-Item android/app/build/outputs/mapping/release/usage.txt
  if ($taskMapping.Length -eq 0 -or $taskUsage.Length -eq 0) { throw 'R8 mapping or shrinking evidence is empty.' }
  New-Item -ItemType Directory artifacts -Force | Out-Null
  & "$env:JAVA_HOME/bin/jarsigner.exe" -verify $BundlePath *> artifacts/bundle-signature.log
  if ($LASTEXITCODE -ne 0 -or -not (Select-String -Path artifacts/bundle-signature.log -Pattern 'jar verified\.')) { throw 'Release bundle signature is invalid.' }
  $taskCert = & "$env:JAVA_HOME/bin/keytool.exe" -printcert -jarfile $BundlePath
  if ($LASTEXITCODE -ne 0 -or ($taskCert -join "`n") -match 'Android Debug' -or ($taskCert -join "`n") -notmatch 'CN=Sandwich Sudoku Upload') { throw 'Unexpected upload certificate.' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $taskZip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $BundlePath))
  try {
    function Read-BundleEntry([string]$EntryName) {
      $taskEntry = $taskZip.GetEntry($EntryName)
      if (-not $taskEntry) { throw "Missing bundle entry: $EntryName" }
      $taskStream = $taskEntry.Open(); $taskBuffer = New-Object IO.MemoryStream
      try { $taskStream.CopyTo($taskBuffer); return ,$taskBuffer.ToArray() } finally { $taskStream.Dispose(); $taskBuffer.Dispose() }
    }
    $taskDex = @($taskZip.Entries | Where-Object { $_.FullName -match '^base/dex/classes\d*\.dex$' } | ForEach-Object {
      $taskBytes = Read-BundleEntry $_.FullName
      if ([Text.Encoding]::ASCII.GetString($taskBytes,0,4) -ne "dex`n") { throw 'Invalid DEX header.' }
      [pscustomobject]@{ entry=$_.FullName; bytes=$_.Length; classes=[BitConverter]::ToUInt32($taskBytes,96); methods=[BitConverter]::ToUInt32($taskBytes,88) }
    })
    if ($taskDex.Count -eq 0) { throw 'Release DEX files are missing.' }
    $taskNative = @($taskZip.Entries | Where-Object { $_.FullName -match '^base/lib/(arm64-v8a|x86_64)/[^/]+\.so$' } | ForEach-Object {
      $taskElf = Read-BundleEntry $_.FullName
      if ([BitConverter]::ToString($taskElf[0..3]) -ne '7F-45-4C-46' -or $taskElf[4] -ne 2 -or $taskElf[5] -ne 1) { throw 'Expected a 64-bit little-endian ELF library.' }
      $taskHeaders = [BitConverter]::ToUInt64($taskElf,32)
      $taskHeaderSize = [BitConverter]::ToUInt16($taskElf,54)
      $taskHeaderCount = [BitConverter]::ToUInt16($taskElf,56)
      $taskAlignments = @(for ($taskIndex = 0; $taskIndex -lt $taskHeaderCount; $taskIndex++) {
        $taskOffset = [int]($taskHeaders + $taskIndex * $taskHeaderSize)
        if ([BitConverter]::ToUInt32($taskElf,$taskOffset) -eq 1) { [BitConverter]::ToUInt64($taskElf,$taskOffset+48) }
      })
      $taskMinimum = ($taskAlignments | Measure-Object -Minimum).Minimum
      if ($null -eq $taskMinimum -or $taskMinimum -lt 16384) { throw "Native library does not support 16 KB ELF alignment: $($_.FullName)" }
      [pscustomobject]@{ entry=$_.FullName; minimumLoadAlignment=$taskMinimum }
    })
    if ($taskNative.Count -eq 0) { throw 'Expected native release libraries.' }
    $taskMetadataMap = $taskZip.GetEntry('BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map')
    if (-not $taskMetadataMap -or $taskMetadataMap.Length -ne $taskMapping.Length) { throw 'Bundle is missing its current R8 deobfuscation map.' }
    $taskJsBytes = Read-BundleEntry 'base/assets/index.android.bundle'
    $taskJs = [Text.Encoding]::UTF8.GetString($taskJsBytes)
    if ([BitConverter]::ToString($taskJsBytes[0..7]) -ne 'C6-1F-BC-03-C1-03-19-1F') { throw 'Release is not using compiled Hermes bytecode.' }
    foreach ($taskExpected in @('ca-app-pub-6230290323057717/1515005956','ca-app-pub-6230290323057717/5841263777',
      $taskApp.extra.privacyPolicyUrl,'Integrated Media Systems, LLC')) {
      if (-not $taskJs.Contains($taskExpected)) { throw "Release content missing: $taskExpected" }
    }
    $taskManifestBytes = Read-BundleEntry 'base/manifest/AndroidManifest.xml'
    if (-not [Text.Encoding]::UTF8.GetString($taskManifestBytes).Contains('ca-app-pub-6230290323057717~2828087629')) { throw 'Wrong AdMob app ID in the bundle.' }
  } finally { $taskZip.Dispose() }
  $taskReport = [ordered]@{
    verifiedAtUtc=[DateTime]::UtcNow.ToString('o'); package=$taskApp.android.package; version=$taskApp.version; versionCode=$taskApp.android.versionCode;
    bundle=(Resolve-Path -LiteralPath $BundlePath).Path; sha256=(Get-FileHash -LiteralPath $BundlePath -Algorithm SHA256).Hash;
    signatureVerified=$true; certificateSha256=($taskCert | Select-String 'SHA256:' | ForEach-Object { $_.Line.Trim() });
    optimizedR8=$true; resourceShrinking=$true; mappingBytes=$taskMapping.Length; removedCodeReportBytes=$taskUsage.Length;
    hermesBytecode=$true; dex=$taskDex; nativeLibraries=$taskNative; nativeElf16KbAlignment=$true;
    permissions=$taskPermissions; productionAdIdsVerified=$true; bundledPrivacyPolicy=$true
  }
  $taskReportPath = Join-Path (Split-Path $BundlePath -Parent) "SandwichSudoku-$($taskApp.version)-verification.json"
  $taskReport | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $taskReportPath -Encoding utf8
  Write-Output "Verified release: $($taskApp.version) ($($taskApp.android.versionCode)); optimized R8, $($taskDex.Count) DEX files, signature, permissions, ad IDs, and offline privacy policy."
  Write-Output "Evidence: $taskReportPath"
} finally { Pop-Location }
