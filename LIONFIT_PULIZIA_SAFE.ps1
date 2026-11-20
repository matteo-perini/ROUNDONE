#Requires -Version 5.1
<#
LionFit Prima Pulizia SAFE - 19/11/2026
Solo file temporanei e rigenerabili. NON cancella definitivamente.
Eseguire tramite AVVIA_PULIZIA_LIONFIT.cmd dalla radice LionFit-Modern-Git.
#>
param(
    [ValidateSet('Menu', 'Analizza', 'Pulisci', 'Ripristina')]
    [string]$Azione = 'Menu'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$ProjectName = Split-Path -Path $ProjectRoot -Leaf
$ProjectParent = [System.IO.Directory]::GetParent($ProjectRoot).FullName
$BackupPrefix = 'LionFit_BACKUP_PULIZIA_SAFE_'

function Test-Progetto {
    $required = @('package.json', 'src', 'android', 'competitions-backend')
    if ($ProjectName -ne 'LionFit-Modern-Git') {
        throw "Cartella non riconosciuta: $ProjectName. Metti i due file nella radice di LionFit-Modern-Git."
    }
    foreach ($rel in $required) {
        $path = Join-Path $ProjectRoot $rel
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Progetto incompleto o cartella errata. Manca: $rel"
        }
    }
    if ((Get-Item -LiteralPath $ProjectRoot -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw 'La cartella progetto e un collegamento/junction: operazione bloccata.'
    }
}

function Add-Target {
    param(
        [System.Collections.ArrayList]$Items,
        [string]$Relative,
        [string]$Description,
        [string]$Kind = 'Directory'
    )
    $relativeNormalized = $Relative.Replace('/', '\').TrimStart('\')
    if ($relativeNormalized -match '(^|\\)\.\.(\\|$)') { throw 'Percorso non sicuro.' }
    $absolute = Join-Path $ProjectRoot $relativeNormalized
    $expectType = if ($Kind -eq 'File') { 'Leaf' } else { 'Container' }
    if (-not (Test-Path -LiteralPath $absolute -PathType $expectType)) { return }
    $item = Get-Item -LiteralPath $absolute -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        Write-Warning "Collegamento/junction ignorato: $relativeNormalized"
        return
    }
    [void]$Items.Add([pscustomobject]@{
        Relative = $relativeNormalized
        Absolute = $absolute
        Category = $Description
        Kind = $Kind
    })
}

function Get-Targets {
    $items = New-Object System.Collections.ArrayList

    # Solo output e cache rigenerabili. Non includere mai docs, public, src o APK.
    Add-Target $items 'dist' 'Build web: si rigenera con npm.cmd run build'
    Add-Target $items 'coverage' 'Report dei test'
    Add-Target $items '.vite' 'Cache Vite'
    Add-Target $items '.firebase' 'Cache locale Firebase CLI'
    Add-Target $items 'android\.gradle' 'Cache Android Gradle'
    Add-Target $items 'android\build' 'Build Gradle del progetto Android'
    Add-Target $items 'android\.cxx' 'Cache temporanea Android C++'

    # Gli APK e gli output della cartella android/app/build restano volutamente al loro posto.
    # I node_modules principali e dei backend sono indispensabili ai comandi quotidiani:
    # non vengono toccati. Solo dipendenze DUPLICATE nei progetti emulator di prova.
    $emulators = @(
        Get-ChildItem -LiteralPath $ProjectRoot -Directory -Force |
        Where-Object {
            $_.Name -match '^test-.+-emulator$' -or
            $_.Name -match '^R[0-9]+[A-Z]?_EMULATOR(_|$)'
        }
    )
    foreach ($folder in $emulators) {
        Add-Target $items ($folder.Name + '\node_modules') 'Dipendenze duplicate dei test Emulator'
    }

    # Solo log di diagnostica con nomi noti; non file .env, .json o log generici.
    $logs = @('firebase-debug.log', 'firestore-debug.log', 'database-debug.log', 'ui-debug.log', 'npm-debug.log', 'debug.log')
    foreach ($name in $logs) {
        Add-Target $items $name 'Log di diagnostica' 'File'
    }
    foreach ($folder in $emulators) {
        foreach ($name in $logs) {
            Add-Target $items ($folder.Name + '\' + $name) 'Log di diagnostica Emulator' 'File'
        }
    }
    return $items.ToArray()
}

function Get-Bytes {
    param([string]$Path, [string]$Kind)
    [long]$total = 0
    try {
        if ($Kind -eq 'File') { return [long](Get-Item -LiteralPath $Path).Length }
        foreach ($file in [System.IO.Directory]::EnumerateFiles($Path, '*', [System.IO.SearchOption]::AllDirectories)) {
            try { $total += [long]([System.IO.FileInfo]::new($file)).Length } catch { }
        }
    } catch {
        Write-Warning "Dimensione non completamente misurabile per: $Path"
    }
    return $total
}

function Show-Plan {
    $targets = @(Get-Targets)
    Write-Host ''
    Write-Host 'LIONFIT - ANALISI PULIZIA SAFE' -ForegroundColor Cyan
    Write-Host ('Progetto: ' + $ProjectRoot)
    Write-Host 'PROTETTI: src, public/SVG, docs, .git, .env, backend, APK, node_modules principali, patch.'
    if ($targets.Count -eq 0) {
        Write-Host 'Nessun file rigenerabile fra quelli previsti. Progetto gia pulito.' -ForegroundColor Green
        return $targets
    }
    [long]$sum = 0
    foreach ($item in $targets) {
        $size = Get-Bytes $item.Absolute $item.Kind
        $sum += $size
        Write-Host ('  - {0}  ({1:N1} MB)' -f $item.Relative, ($size / 1MB))
        Write-Host ('      ' + $item.Category) -ForegroundColor DarkGray
    }
    Write-Host ('TOTALE INDIVIDUATO: circa {0:N1} MB' -f ($sum / 1MB)) -ForegroundColor Yellow
    Write-Host 'La pulizia SPOSTA i file fuori dal progetto: non libera spazio sul disco finche il backup esiste.'
    Write-Host 'Gli emulator puliti richiederanno npm install/npm ci prima di essere riutilizzati.'
    return $targets
}

function Test-Tracked {
    param([object]$Target)
    $git = Get-Command 'git.exe' -ErrorAction SilentlyContinue
    if ($null -eq $git) { return $false }
    $rel = $Target.Relative.Replace('\', '/')
    $arg = if ($Target.Kind -eq 'File') { $rel } else { $rel + '/' }
    $out = & $git.Source -C $ProjectRoot ls-files --cached -- $arg 2>$null | Select-Object -First 1
    if ($LASTEXITCODE -ne 0) {
        throw 'Git non riesce a controllare i file tracciati: pulizia bloccata.'
    }
    return -not [string]::IsNullOrWhiteSpace([string]$out)
}

function Save-Manifest {
    param([object]$Manifest, [string]$File)
    $json = ConvertTo-Json -InputObject $Manifest -Depth 6
    [System.IO.File]::WriteAllText($File, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Start-Clean {
    $targets = @(Show-Plan)
    if ($targets.Count -eq 0) { return }
    Write-Host ''
    Write-Host 'Non saranno eliminati file in modo definitivo.' -ForegroundColor Yellow
    $ok = Read-Host 'Per spostare i file nel backup scrivi esattamente PULISCI (INVIO per annullare)'
    if ($ok -cne 'PULISCI') { Write-Host 'Operazione annullata. Nessuna modifica.'; return }

    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $suffix = Get-Random -Minimum 1000 -Maximum 10000
    $backupRoot = Join-Path $ProjectParent ($BackupPrefix + $stamp + '_' + $suffix)
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    $manifestFile = Join-Path $backupRoot 'MANIFEST_PULIZIA.json'
    $manifest = [pscustomobject]@{
        Version = 1
        ProjectRoot = $ProjectRoot
        Started = (Get-Date).ToString('o')
        Records = @()
    }
    Save-Manifest $manifest $manifestFile

    [int]$moved = 0
    [int]$skipped = 0
    foreach ($item in $targets) {
        try {
            # Se git e disponibile, non spostare nulla che risulta tracciato nel repository.
            if (Test-Tracked $item) {
                Write-Warning "GIT TRACCIATO, NON SPOSTATO: $($item.Relative)"
                $skipped++
                continue
            }
            if (-not (Test-Path -LiteralPath $item.Absolute)) { continue }
            $target = Join-Path $backupRoot $item.Relative
            $parent = Split-Path -Path $target -Parent
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
            if (Test-Path -LiteralPath $target) {
                Write-Warning "Gia presente nel backup, salto: $($item.Relative)"
                $skipped++
                continue
            }
            $record = [pscustomobject]@{
                Relative = $item.Relative
                Category = $item.Category
                State = 'Pending'
            }
            $manifest.Records += $record
            Save-Manifest $manifest $manifestFile
            Move-Item -LiteralPath $item.Absolute -Destination $target -ErrorAction Stop
            $record.State = 'Moved'
            Save-Manifest $manifest $manifestFile
            Write-Host ('[OK] ' + $item.Relative) -ForegroundColor Green
            $moved++
        } catch {
            Write-Warning ('NON SPOSTATO: ' + $item.Relative + ' - ' + $_.Exception.Message)
            $skipped++
        }
    }
    Write-Host ''
    Write-Host ('Spostati: {0} | Saltati/errori: {1}' -f $moved, $skipped)
    Write-Host ('BACKUP ESTERNO AL PROGETTO: ' + $backupRoot) -ForegroundColor Cyan
    Write-Host 'Non cancellare il backup finche non hai provato LionFit.'
    Write-Host 'Controlli consigliati: npm.cmd run build; apri LionFit; controlla Android e Focus Mode.'
    Write-Host 'Se serve, riapri il CMD e usa RIPRISTINA.'
}

function Start-Restore {
    $dirs = @(
        Get-ChildItem -LiteralPath $ProjectParent -Directory -ErrorAction Stop |
        Where-Object { $_.Name.StartsWith($BackupPrefix, [System.StringComparison]::OrdinalIgnoreCase) } |
        Sort-Object Name -Descending
    )
    if ($dirs.Count -eq 0) { Write-Host 'Nessun backup di pulizia trovato.'; return }
    $backupRoot = $dirs[0].FullName
    $manifestFile = Join-Path $backupRoot 'MANIFEST_PULIZIA.json'
    if (-not (Test-Path -LiteralPath $manifestFile)) { throw 'Backup senza manifesto valido. Nessuna modifica.' }
    $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
    if ([string]$manifest.ProjectRoot -ine $ProjectRoot) { throw 'Backup di un altro progetto. Ripristino bloccato.' }
    Write-Host ('Backup trovato: ' + $backupRoot) -ForegroundColor Cyan
    $toRestore = @($manifest.Records | Where-Object { $_.State -eq 'Moved' -or $_.State -eq 'Pending' })
    if ($toRestore.Count -eq 0) { Write-Host 'Nessun elemento da ripristinare.'; return }
    Write-Host ('Elementi ripristinabili: ' + $toRestore.Count)
    $ok = Read-Host 'Per ripristinare scrivi esattamente RIPRISTINA (INVIO per annullare)'
    if ($ok -cne 'RIPRISTINA') { Write-Host 'Operazione annullata.'; return }
    [int]$count = 0
    foreach ($record in $toRestore) {
        $rel = [string]$record.Relative
        if ($rel -match '(^|\\)\.\.(\\|$)') { Write-Warning 'Manifest non sicuro. Saltato.'; continue }
        $source = Join-Path $backupRoot $rel
        $dest = Join-Path $ProjectRoot $rel
        if (-not (Test-Path -LiteralPath $source)) { continue }
        if (Test-Path -LiteralPath $dest) {
            Write-Warning ('Il progetto ha gia ricreato questo percorso: ' + $rel + '. Non sovrascrivo.')
            continue
        }
        try {
            $parent = Split-Path -Path $dest -Parent
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
            Move-Item -LiteralPath $source -Destination $dest -ErrorAction Stop
            $record.State = 'Restored'
            Save-Manifest $manifest $manifestFile
            $count++
            Write-Host ('[RIPRISTINATO] ' + $rel) -ForegroundColor Green
        } catch {
            Write-Warning ('Ripristino non riuscito per ' + $rel + ': ' + $_.Exception.Message)
        }
    }
    Write-Host ('Ripristinati: ' + $count)
    Write-Host 'Il backup viene conservato per sicurezza (puoi archiviarlo manualmente).'
}

try {
    Test-Progetto
    Write-Host ''
    Write-Host '====================================================' -ForegroundColor Cyan
    Write-Host '  LIONFIT - PRIMA PULIZIA SAFE / BACKUP ESTERNO' -ForegroundColor Cyan
    Write-Host '====================================================' -ForegroundColor Cyan
    if ($Azione -ne 'Menu') {
        switch ($Azione) {
            'Analizza'   { [void](Show-Plan) }
            'Pulisci'    { Start-Clean }
            'Ripristina' { Start-Restore }
        }
    } else {
        Write-Host '1 - Analizza (non modifica nulla)'
        Write-Host '2 - Pulisci in modo SAFE (sposta nel backup)'
        Write-Host '3 - Ripristina ultimo backup'
        Write-Host '0 - Esci'
        $choice = Read-Host 'Scegli 1, 2, 3 oppure 0'
        switch ($choice) {
            '1' { [void](Show-Plan) }
            '2' { Start-Clean }
            '3' { Start-Restore }
            '0' { Write-Host 'Nessuna modifica.' }
            default { Write-Host 'Scelta non valida. Nessuna modifica.' }
        }
    }
} catch {
    Write-Host ('ERRORE BLOCCANTE: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Nessun file sara eliminato definitivamente.'
    exit 1
}
