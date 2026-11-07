# STEP3T3: verifica offline; utilizza apksigner e aapt dall'Android SDK installato su Windows.
# Non legge password/keystore, non installa APK e non modifica PROD.
param(
 [Parameter(Mandatory=$true)][string]$OldApk,
 [string]$NewApk = ''
)
$ErrorActionPreference = 'Stop'
function Get-Tools() {
  $roots = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk')) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  foreach ($root in $roots) {
    $builds = Join-Path $root 'build-tools'
    if (!(Test-Path $builds)) { continue }
    $dirs = @(Get-ChildItem $builds -Directory | Sort-Object Name -Descending)
    foreach ($d in $dirs) {
      $signer = Join-Path $d.FullName 'apksigner.bat'
      $aapt = Join-Path $d.FullName 'aapt.exe'
      if ((Test-Path $signer) -and (Test-Path $aapt)) { return @{Signer=$signer; Aapt=$aapt} }
    }
  }
  throw 'Android SDK Build-Tools non trovato. Apri Android Studio > SDK Manager > SDK Tools, installa Android SDK Build-Tools.'
}
function ApkInfo([string]$inputPath, $tools, [string]$name) {
  $inputPath=$inputPath.Trim().Trim('"')
  if (!(Test-Path -LiteralPath $inputPath -PathType Leaf)) { throw "${name}: file APK inesistente: $inputPath" }
  $p = (Resolve-Path -LiteralPath $inputPath).Path
  if ([IO.Path]::GetExtension($p).ToLowerInvariant() -ne '.apk') { throw "${name}: deve essere un file .apk" }
  $certOutput = @(& $tools.Signer verify --print-certs $p 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "${name}: firma APK non valida o non verificabile: $($certOutput -join '; ')" }
  $m = [regex]::Match(($certOutput -join "`n"), 'Signer #1 certificate SHA-256 digest:\s*([a-f0-9:]+)', 'IgnoreCase')
  if (!$m.Success) { throw "${name}: SHA-256 certificato non trovato." }
  $digest=$m.Groups[1].Value.Replace(':','').ToLowerInvariant()
  $badging=@(& $tools.Aapt dump badging $p 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "${name}: impossibile leggere package/versionCode da APK tramite aapt." }
  $b=[regex]::Match(($badging -join "`n"), "package:\s+name='([^']+)'\s+versionCode='(\d+)'\s+versionName='([^']+)'", 'IgnoreCase')
  if (!$b.Success) { throw "${name}: impossibile estrarre package/versionCode." }
  $package=$b.Groups[1].Value; $version=[int]$b.Groups[2].Value
  if ($package -ne 'com.roundone.app') { throw "${name}: package errato ($package): NON installare come aggiornamento." }
  Write-Host "PASS $name - package: $package; versionCode: $version; versionName: $($b.Groups[3].Value)"
  Write-Host "     Firma certificato SHA-256: $digest"
  return @{Path=$p; Fingerprint=$digest; Code=$version; Package=$package}
}
try {
  $tools=Get-Tools
  $old=ApkInfo $OldApk $tools 'APK PRECEDENTE'
  if (!$NewApk.Trim()) {
    Write-Host 'STEP3T3: VECCHIO APK VERIFICATO. Conserva il file: quando avrai quello nuovo, ripeti il confronto.'
    Write-Host 'Non abbiamo ancora verificato un nuovo APK; NON pubblicare la release sulla base di questo solo controllo.'
    exit 0
  }
  $new=ApkInfo $NewApk $tools 'APK NUOVO'
  if ($new.Path -eq $old.Path) { throw 'I due percorsi puntano allo stesso APK.' }
  if ($new.Fingerprint -ne $old.Fingerprint) { throw 'FIRMA DIFFERENTE: NON distribuire. Gli utenti non potranno aggiornare in-place.' }
  if ($new.Code -le $old.Code) { throw "versionCode NUOVO ($($new.Code)) non superiore al VECCHIO ($($old.Code))." }
  Write-Host "PASS FINALE: stessa firma e versionCode incrementato ($($old.Code) -> $($new.Code))."
  Write-Host 'La compatibilita di firma/versionCode e verificata. Restano da provare installazione reale e dati nel dispositivo.'
  exit 0
} catch {
  Write-Host "FAIL STEP3T3: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
