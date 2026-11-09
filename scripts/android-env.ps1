$taskJava = 'C:\Program Files\Android\Android Studio\jbr'
$taskCachedJava = Get-ChildItem (Join-Path $env:USERPROFILE '.gradle\jdks') -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '-(17|21)-' -and (Test-Path (Join-Path $_.FullName 'bin\java.exe')) } |
  Select-Object -First 1
if ($taskCachedJava) { $taskJava = $taskCachedJava.FullName }
$taskSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
if (-not (Test-Path $taskSdk)) { $taskSdk = Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk' }
if (-not $env:JAVA_HOME -and (Test-Path "$taskJava\bin\java.exe")) { $env:JAVA_HOME = $taskJava }
if (-not $env:ANDROID_HOME -and (Test-Path $taskSdk)) { $env:ANDROID_HOME = $taskSdk }
if (-not $env:JAVA_HOME -or -not $env:ANDROID_HOME) { throw 'Install Android Studio, a JDK, and Android SDK, or set JAVA_HOME and ANDROID_HOME.' }
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
