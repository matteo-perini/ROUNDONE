param([string]$ProjectRoot = '')
$ErrorActionPreference = 'Stop'
try {
  if ([string]::IsNullOrWhiteSpace($ProjectRoot)) { $ProjectRoot = $PSScriptRoot }
  $root = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd('\','/')
  $target = Join-Path $root 'src\components\MultiSportProgress.vue'
  $payload = Join-Path $PSScriptRoot 'R17B_PAYLOAD\MultiSportProgress.vue'
  $expectedOld = '83D94099CC7C6ADBC0D76BFFF88D3D872198355C9D7DB90768BB305499DAF04B'
  $expectedNew = '341EAA1DBC3B0AD6D86855D68BCF0BA19D57012DAA257624F37CCC9C0748506D'
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw 'Cartella errata: manca src\components\MultiSportProgress.vue.' }
  if (-not (Test-Path -LiteralPath $payload -PathType Leaf)) { throw 'Payload R17B mancante. Estrai tutto lo ZIP.' }
  $payloadHash=(Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash
  if ($payloadHash -ne $expectedNew) { throw 'Payload R17B alterato: installazione annullata.' }
  $actual=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
  if ($actual -eq $expectedNew) { Write-Host 'R17B gia installata: nessuna modifica.' -ForegroundColor Green; exit 0 }
  if ($actual -ne $expectedOld) { throw 'STOP SICUREZZA: MultiSportProgress.vue non corrisponde al file esaminato. Nessun file modificato. Non forzare.' }
  $parent=Split-Path -Parent $root
  $name='LionFit_R17B_BACKUP_'+(Get-Date -Format 'yyyy-MM-dd_HHmmss')+'_'+([guid]::NewGuid().ToString('N').Substring(0,6))
  $backup=Join-Path $parent $name
  New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
  $originalBackup=Join-Path $backup 'MultiSportProgress.original.vue'
  Copy-Item -LiteralPath $target -Destination $originalBackup -ErrorAction Stop
  if ((Get-FileHash -LiteralPath $originalBackup -Algorithm SHA256).Hash -ne $expectedOld) { throw 'Backup non valido: file di progetto NON modificato.' }
  $manifest=[ordered]@{projectRoot=$root;sourceHash=$expectedOld;patchedHash=$expectedNew;created=(Get-Date).ToString('o')}
  $manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'R17B-backup-manifest.json') -Encoding UTF8
  try {
    Copy-Item -LiteralPath $payload -Destination $target -Force -ErrorAction Stop
    $written=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($written -ne $expectedNew) { throw 'Hash dopo installazione diverso dal previsto.' }
  } catch {
    Copy-Item -LiteralPath $originalBackup -Destination $target -Force -ErrorAction Stop
    throw
  }
  Write-Host 'R17B APPLICATA CON SUCCESSO.' -ForegroundColor Green
  Write-Host 'Backup esterno al repository:' $backup
  Write-Host 'Regole Firestore NON pubblicate: seguire R17B_LEGGIMI.txt.' -ForegroundColor Yellow
  exit 0
} catch {
  Write-Host ('ERRORE / STOP: '+$_.Exception.Message) -ForegroundColor Red
  exit 1
}
