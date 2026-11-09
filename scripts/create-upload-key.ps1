$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  . ./scripts/android-env.ps1
  $taskSigningDir = Join-Path (Get-Location) '.upload-signing'
  $taskProperties = Join-Path $taskSigningDir 'keystore.properties'
  $taskKeystore = Join-Path $taskSigningDir 'upload-keystore.p12'
  if (Test-Path -LiteralPath $taskProperties) { Write-Host 'Using existing upload signing configuration.'; return }
  if (Test-Path -LiteralPath $taskKeystore) { throw 'An upload key already exists without configuration. Preserve it and restore its properties file.' }
  New-Item -ItemType Directory -Path $taskSigningDir -Force | Out-Null
  $taskBytes = New-Object byte[] 32
  $taskRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $taskRng.GetBytes($taskBytes); $taskRng.Dispose()
  $taskPassword = [Convert]::ToBase64String($taskBytes)
  $env:SANDWICH_UPLOAD_PASSWORD = $taskPassword
  try {
    & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -storetype PKCS12 -keystore $taskKeystore -alias sandwich-upload -keyalg RSA -keysize 4096 -validity 10000 -storepass:env SANDWICH_UPLOAD_PASSWORD -keypass:env SANDWICH_UPLOAD_PASSWORD -dname 'CN=Sandwich Sudoku Upload'
    if ($LASTEXITCODE -ne 0) { throw 'Upload key generation failed.' }
    $taskFile = $taskKeystore.Replace('\', '/')
    @("storeFile=$taskFile", "storePassword=$taskPassword", 'keyAlias=sandwich-upload', "keyPassword=$taskPassword") | Set-Content -LiteralPath $taskProperties -Encoding ascii
    Write-Host 'Created dedicated upload key in .upload-signing. Keep this folder backed up privately.'
  } finally { Remove-Item Env:SANDWICH_UPLOAD_PASSWORD; $taskPassword = $null }
} finally { Pop-Location }
