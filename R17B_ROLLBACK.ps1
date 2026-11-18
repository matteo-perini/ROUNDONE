param([string]$ProjectRoot = '')
$ErrorActionPreference = 'Stop'
try {
  if ([string]::IsNullOrWhiteSpace($ProjectRoot)) { $ProjectRoot = $PSScriptRoot }
  $root=(Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd('\','/')
  $target=Join-Path $root 'src\components\MultiSportProgress.vue'
  $expectedOld='83D94099CC7C6ADBC0D76BFFF88D3D872198355C9D7DB90768BB305499DAF04B'
  $expectedNew='341EAA1DBC3B0AD6D86855D68BCF0BA19D57012DAA257624F37CCC9C0748506D'
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw 'Manca il file di destinazione.' }
  $now=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
  if ($now -eq $expectedOld) { Write-Host 'File gia originale: nessuna modifica.' -ForegroundColor Green; exit 0 }
  if ($now -ne $expectedNew) { throw 'STOP: il file attuale e diverso da R17B. Non sovrascrivere modifiche successive.' }
  $parent=Split-Path -Parent $root
  $backupFile=$null
  foreach($folder in @(Get-ChildItem -LiteralPath $parent -Directory -Filter 'LionFit_R17B_BACKUP_*' | Sort-Object LastWriteTime -Descending)) {
    $mf=Join-Path $folder.FullName 'R17B-backup-manifest.json'
    $candidate=Join-Path $folder.FullName 'MultiSportProgress.original.vue'
    if ((Test-Path -LiteralPath $mf -PathType Leaf) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      $m=Get-Content -LiteralPath $mf -Raw | ConvertFrom-Json
      if ($m.projectRoot -eq $root -and $m.sourceHash -eq $expectedOld -and $m.patchedHash -eq $expectedNew -and (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash -eq $expectedOld) { $backupFile=$candidate; break }
    }
  }
  if (-not $backupFile) { throw 'Backup R17B esatto non trovato: nessun file modificato.' }
  Copy-Item -LiteralPath $backupFile -Destination $target -Force -ErrorAction Stop
  if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $expectedOld) { throw 'Errore: hash ripristino inatteso.' }
  Write-Host 'ROLLBACK R17B COMPLETATO (solo Vue).' -ForegroundColor Green
  Write-Host 'ATTENZIONE: le regole Firestore vanno gestite separatamente in Console.' -ForegroundColor Yellow
  exit 0
} catch {
  Write-Host ('ERRORE / STOP: '+$_.Exception.Message) -ForegroundColor Red
  exit 1
}
