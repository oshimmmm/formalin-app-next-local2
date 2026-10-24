[CmdletBinding()]
param(
    [string]$BackupFile = 'D:\formalin_backup_dir\formalin_next_db_v2.dump',
    [switch]$AllowOlderBackup
)

# Compatible with Windows PowerShell 5.1. This script never migrates the database.
$ErrorActionPreference = 'Stop'
$deployDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
$composeFile = Join-Path $deployDir 'docker-compose.yml'
$appName = 'formalin-next-app-container'
$dbName = 'formalin-next-db-container'
$serviceName = 'formalin-next-app'
$expectedNode = [version]'22.23.4'
$expectedNext = '15.5.28'
$statePath = $null
$swapAttempted = $false
$originalConsoleEncoding = [Console]::OutputEncoding
$originalOutputEncoding = $OutputEncoding
. (Join-Path $PSScriptRoot 'host-disk-space.ps1')

function Invoke-Docker {
    param([string[]]$DockerArguments)
    & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker failed (exit $LASTEXITCODE): docker $($DockerArguments -join ' ')"
    }
}

function Read-DockerJson {
    param([string]$Container, [string]$Field)
    $raw = Invoke-Docker @('inspect', '--format', "{{json .$Field}}", $Container)
    return (($raw -join "`n") | ConvertFrom-Json)
}

function Get-EnvironmentHash {
    param($Environment)
    $lines = @($Environment.PSObject.Properties | Sort-Object Name | ForEach-Object {
        $_.Name + '=' + [string]$_.Value
    })
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))))).Replace('-', '').ToLowerInvariant()
    }
    finally { $sha.Dispose() }
}

function Read-DatabaseState {
    $labels = Read-DockerJson $dbName 'Config.Labels'
    $mounts = @(Read-DockerJson $dbName 'Mounts')
    $dataMounts = @($mounts | Where-Object { $_.Destination -eq '/var/lib/postgresql/data' })
    if ($labels.'com.docker.compose.project' -ne $project -or
        $labels.'com.docker.compose.service' -ne 'formalin-next-db' -or
        $dataMounts.Count -ne 1 -or $dataMounts[0].Type -ne 'volume' -or
        [string]::IsNullOrWhiteSpace($dataMounts[0].Name)) {
        throw 'The running database is not the expected Compose service with a named data volume.'
    }
    $running = (Invoke-Docker @('inspect', '--format', '{{.State.Running}}', $dbName) -join '').Trim()
    if ($running -ne 'true') { throw 'The production database must already be running.' }
    return [pscustomobject]@{
        ContainerId = (Invoke-Docker @('inspect', '--format', '{{.Id}}', $dbName) -join '').Trim()
        VolumeName = $dataMounts[0].Name
    }
}

function Assert-DatabaseUnchanged {
    $current = Read-DatabaseState
    if ($current.ContainerId -ne $state.DatabaseContainerId -or $current.VolumeName -ne $state.DatabaseVolumeName) {
        throw 'Database identity changed. Stop and investigate; do not delete or restore any database volume.'
    }
}

function Save-State {
    $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Wait-LoginPage {
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3003/login' -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return }
        }
        catch { }
        Start-Sleep -Seconds 2
    }
    throw 'The login page did not return HTTP 200 within 90 seconds.'
}

Push-Location $deployDir
try {
    # Docker emits UTF-8 JSON, including Japanese Windows user/folder names.
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
    $OutputEncoding = [Console]::OutputEncoding
    Assert-HostDiskSpace -WorkspacePath $deployDir
    if (-not (Test-Path -LiteralPath $composeFile -PathType Leaf)) { throw 'docker-compose.yml was not found.' }
    $backup = Get-Item -LiteralPath $BackupFile -ErrorAction Stop
    if ($backup.PSIsContainer -or $backup.Length -le 0) { throw 'BackupFile must be an existing nonempty pg_dump file.' }
    $backupAge = ((Get-Date) - $backup.LastWriteTime).TotalHours
    if ($backupAge -lt -0.25) { throw 'Backup timestamp is in the future. Check the PC clock and the selected file.' }
    if ($backupAge -gt 24 -and -not $AllowOlderBackup) {
        throw 'The backup is older than 24 hours. Select a recent USB pg_dump file; see the update guide.'
    }
    if ($backupAge -gt 24) { Write-Warning 'An older backup was explicitly accepted.' }
    $dumpStream = [IO.File]::OpenRead($backup.FullName)
    try {
        $header = New-Object byte[] 5
        if ($dumpStream.Read($header, 0, 5) -ne 5 -or [Text.Encoding]::ASCII.GetString($header) -ne 'PGDMP') {
            throw 'The selected file is not a PostgreSQL custom-format dump (PGDMP). Stop and check the USB backup.'
        }
    }
    finally { $dumpStream.Dispose() }
    $backupLog = Join-Path $backup.DirectoryName 'backup_log.txt'
    if (Test-Path -LiteralPath $backupLog -PathType Leaf) {
        $lastLog = Get-Content -LiteralPath $backupLog -Tail 1
        if ($lastLog -notmatch 'exit=0\s+size=(\d+) bytes\s*$' -or [long]$Matches[1] -ne $backup.Length) {
            throw 'The latest backup log does not report exit=0 with the selected file size. Wait for the scheduled backup to finish, then check its log.'
        }
    }
    Write-Host ('Backup file: {0}; {1:N0} bytes; modified {2:yyyy-MM-dd HH:mm}' -f $backup.FullName, $backup.Length, $backup.LastWriteTime)
    Write-Host 'File size/time checks do not verify that the dump can be restored.'

    $labels = Read-DockerJson $appName 'Config.Labels'
    $project = [string]$labels.'com.docker.compose.project'
    if ($project -notmatch '^[a-z0-9][a-z0-9_-]*$' -or $labels.'com.docker.compose.service' -ne $serviceName) {
        throw 'The existing app is not the expected production Compose service.'
    }
    $originalDir = [string]$labels.'com.docker.compose.project.working_dir'
    if ([string]::IsNullOrWhiteSpace($originalDir) -or
        [IO.Path]::GetFullPath($originalDir).TrimEnd('\', '/') -ne $deployDir) {
        throw 'Run this script in the original workplace deployment directory; do not use a copied project directory.'
    }
    $configFiles = ([string]$labels.'com.docker.compose.project.config_files') -split ','
    $snapshotRoot = (Join-Path $deployDir '.deployment-backups').TrimEnd('\') + '\'
    if ($configFiles.Count -eq 0 -or [string]::IsNullOrWhiteSpace($configFiles[0])) {
        throw 'The current app has no identifiable Compose configuration.'
    }
    # Permit the main file, or our identical snapshot after a previous rollback.
    $firstConfig = [IO.Path]::GetFullPath($configFiles[0])
    if ($firstConfig -ne $composeFile) {
        if (-not $firstConfig.StartsWith($snapshotRoot, [StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetFileName($firstConfig) -ne 'docker-compose.before.yml' -or
            (Get-FileHash -LiteralPath $firstConfig -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $composeFile -Algorithm SHA256).Hash) {
            throw 'The current app uses an unexpected base Compose configuration. Stop and review it first.'
        }
    }
    for ($i = 1; $i -lt $configFiles.Count; $i++) {
        $extraConfig = [IO.Path]::GetFullPath($configFiles[$i])
        if (-not $extraConfig.StartsWith($snapshotRoot, [StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetFileName($extraConfig) -notin @('upgrade.override.yml', 'rollback.override.yml')) {
            throw 'The current app uses an unrecognized Compose override. Review it before updating.'
        }
    }
    if ((Invoke-Docker @('inspect', '--format', '{{.State.Running}}', $appName) -join '').Trim() -ne 'true') {
        throw 'The existing production app must be running before taking its rollback snapshot.'
    }
    $appCommand = @(Read-DockerJson $appName 'Config.Cmd')
    if (($appCommand -join ' ') -ne 'npm run start' -or @(Read-DockerJson $appName 'Mounts').Count -ne 0) {
        throw 'The running app has an unexpected command or filesystem mount. Review the production configuration first.'
    }
    $composeArgs = @('compose', '--project-directory', $deployDir, '-p', $project, '-f', $composeFile)
    # Resolve configuration in memory only: it may contain passwords and must not be printed.
    $effective = ((Invoke-Docker ($composeArgs + @('config', '--format', 'json'))) -join "`n") | ConvertFrom-Json
    # Compose may include depends_on images even when a service is selected.
    $databaseImageReference = [string]$effective.services.'formalin-next-db'.image
    $canonicalImages = @(Invoke-Docker ($composeArgs + @('config', '--images', $serviceName)) | Where-Object {
        -not [string]::IsNullOrWhiteSpace($_) -and $_.Trim() -ne $databaseImageReference
    })
    if ($canonicalImages.Count -ne 1) { throw 'Cannot identify the image used by the normal production Compose command.' }
    $canonicalImage = $canonicalImages[0].Trim()
    $appConfig = $effective.services.$serviceName
    if ($null -eq $appConfig -or @($appConfig.volumes | Where-Object { $null -ne $_ }).Count -ne 0 -or
        $null -ne $appConfig.command -or $null -ne $appConfig.entrypoint -or $appConfig.environment.NODE_ENV -ne 'production' -or
        [string]$appConfig.environment.PORT -ne '3003') {
        throw 'The Compose app is not the expected production configuration.'
    }
    $ports = @($appConfig.ports)
    if ($ports.Count -ne 1 -or [string]$ports[0].published -ne '3003' -or [string]$ports[0].target -ne '3003') {
        throw 'The app must use the expected production port 3003.'
    }
    $runtimeEnvironment = @{}
    foreach ($entry in @(Read-DockerJson $appName 'Config.Env')) {
        $parts = $entry -split '=', 2
        $runtimeEnvironment[$parts[0]] = $parts[1]
    }
    foreach ($property in $appConfig.environment.PSObject.Properties) {
        if (-not $runtimeEnvironment.ContainsKey($property.Name) -or $runtimeEnvironment[$property.Name] -cne [string]$property.Value) {
            throw "The effective environment differs from the running app ($($property.Name)). Restore the original .env/.env.docker settings before updating. Values were not printed."
        }
    }
    $database = Read-DatabaseState
    $dbVolumes = @($effective.services.'formalin-next-db'.volumes | Where-Object { $_.target -eq '/var/lib/postgresql/data' })
    if ($dbVolumes.Count -ne 1 -or $dbVolumes[0].type -ne 'volume' -or
        $effective.volumes.($dbVolumes[0].source).name -ne $database.VolumeName) {
        throw 'The Compose database volume does not match the existing production volume.'
    }
    $dbNetworks = Read-DockerJson $dbName 'NetworkSettings.Networks'
    $appNetworks = Read-DockerJson $appName 'NetworkSettings.Networks'
    foreach ($network in $appConfig.networks.PSObject.Properties.Name) {
        $networkName = $effective.networks.$network.name
        if ($null -eq $dbNetworks.PSObject.Properties[$networkName] -or $null -eq $appNetworks.PSObject.Properties[$networkName]) {
            throw 'The configured application network does not match the running app/database network.'
        }
    }
    $oldImage = (Invoke-Docker @('inspect', '--format', '{{.Image}}', $appName) -join '').Trim()
    $imageSizeText = (Invoke-Docker @('image', 'inspect', '--format', '{{.Size}}', $oldImage) -join '').Trim()
    [long]$oldImageBytes = 0
    if (-not [long]::TryParse($imageSizeText, [ref]$oldImageBytes) -or $oldImageBytes -le 0) {
        throw 'Cannot determine the old image size for the rollback archive disk budget.'
    }
    [long]$archiveBudget = [math]::Ceiling([double]$oldImageBytes * 1.1)
    Assert-HostDiskSpace -WorkspacePath $deployDir -ExtraWorkspaceBytes ($archiveBudget + [long]$backup.Length)
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $backupDir = Join-Path (Join-Path $deployDir '.deployment-backups') $stamp
    New-Item -ItemType Directory -Path $backupDir -ErrorAction Stop | Out-Null
    # Copy off the USB before checking it, so Docker needs no USB drive-sharing setting.
    $dumpCopy = Join-Path $backupDir 'database-before.dump'
    Copy-Item -LiteralPath $backup.FullName -Destination $dumpCopy -ErrorAction Stop
    $backupAfter = Get-Item -LiteralPath $backup.FullName
    $dumpHash = (Get-FileHash -LiteralPath $dumpCopy -Algorithm SHA256).Hash
    if ($backupAfter.Length -ne $backup.Length -or $backupAfter.LastWriteTimeUtc -ne $backup.LastWriteTimeUtc -or
        (Get-FileHash -LiteralPath $backup.FullName -Algorithm SHA256).Hash -ne $dumpHash) {
        throw 'The USB backup changed while being copied. Wait until the daily backup has finished, then retry.'
    }
    $dbImage = (Invoke-Docker @('inspect', '--format', '{{.Image}}', $dbName) -join '').Trim()
    $mountArgument = 'type=bind,source=' + $dumpCopy + ',target=/backup.dump,readonly'
    $dumpContents = @(Invoke-Docker @('run', '--rm', '--network', 'none', '--mount', $mountArgument, $dbImage, 'pg_restore', '--list', '/backup.dump'))
    foreach ($table in @('Formalin', 'History', 'User')) {
        if (-not ($dumpContents -match (' TABLE public ' + [regex]::Escape($table) + ' '))) {
            throw "The backup table of contents does not include $table. Stop and check the selected backup."
        }
    }
    Write-Host 'Custom-format dump table of contents verified; this is not a full restore test.'
    $statePath = Join-Path $backupDir 'state.json'
    $oldTag = "formalin-rollback:$stamp"
    $newTag = "formalin-app-upgrade:$stamp"
    $composeSnapshot = Join-Path $backupDir 'docker-compose.before.yml'
    Copy-Item -LiteralPath $composeFile -Destination $composeSnapshot -ErrorAction Stop
    $imageArchive = Join-Path $backupDir 'app-before.tar'
    Invoke-Docker @('image', 'tag', $oldImage, $oldTag) | Out-Host
    Write-Host 'Saving the old app image. The current app and database keep running.'
    Invoke-Docker @('image', 'save', '--output', $imageArchive, $oldTag) | Out-Host
    $state = [ordered]@{
        StateVersion = 1
        Phase = 'SnapshotSaved'
        CreatedAt = (Get-Date).ToString('o')
        DeployDirectory = $deployDir
        DockerEngineId = (Invoke-Docker @('info', '--format', '{{.ID}}') -join '').Trim()
        Project = $project
        AppContainer = $appName
        Service = $serviceName
        DatabaseContainer = $dbName
        DatabaseContainerId = $database.ContainerId
        DatabaseVolumeName = $database.VolumeName
        OriginalAppContainerId = (Invoke-Docker @('inspect', '--format', '{{.Id}}', $appName) -join '').Trim()
        OriginalImageId = $oldImage
        RollbackImageTag = $oldTag
        CanonicalImageTag = $canonicalImage
        ImageArchive = $imageArchive
        ComposeSnapshot = $composeSnapshot
        ComposeSnapshotHash = (Get-FileHash -LiteralPath $composeSnapshot -Algorithm SHA256).Hash
        EnvironmentHash = Get-EnvironmentHash $appConfig.environment
        DatabaseBackupFile = $backup.FullName
        DatabaseBackupLastWriteTime = $backup.LastWriteTime.ToString('o')
        DatabaseBackupCopy = $dumpCopy
        DatabaseBackupSHA256 = $dumpHash
        NewImageTag = $newTag
    }
    Save-State
    $upgradeOverride = Join-Path $backupDir 'upgrade.override.yml'
    "services:`n  ${serviceName}:`n    image: ${newTag}`n" | Set-Content -LiteralPath $upgradeOverride -Encoding ASCII
    $upgradeArgs = $composeArgs + @('-f', $upgradeOverride)
    Write-Host 'Building the updated app; the current app remains available during the build.'
    Invoke-Docker ($upgradeArgs + @('build', '--pull', $serviceName)) | Out-Host
    $imageVersions = ((Invoke-Docker @('run', '--rm', '--network', 'none', $newTag, 'node', '-p', "JSON.stringify([process.versions.node,require('next/package.json').version])")) -join "`n") | ConvertFrom-Json
    if ([version]$imageVersions[0] -lt $expectedNode -or ([version]$imageVersions[0]).Major -ne 22 -or $imageVersions[1] -ne $expectedNext) {
        throw 'The built image does not contain the expected patched Node.js/Next.js versions. The old app remains running.'
    }
    Assert-DatabaseUnchanged
    $newImage = (Invoke-Docker @('image', 'inspect', '--format', '{{.Id}}', $newTag) -join '').Trim()
    $state.Phase = 'ReplacingApp'
    Save-State
    $swapAttempted = $true
    Invoke-Docker ($upgradeArgs + @('up', '-d', '--no-deps', '--no-build', '--pull', 'never', $serviceName)) | Out-Host
    if ((Invoke-Docker @('inspect', '--format', '{{.Image}}', $appName) -join '').Trim() -ne $newImage) {
        throw 'The running app image does not match the newly built image.'
    }
    Wait-LoginPage
    $runningVersions = ((Invoke-Docker @('exec', $appName, 'node', '-p', "JSON.stringify([process.versions.node,require('next/package.json').version])")) -join "`n") | ConvertFrom-Json
    if ($runningVersions[0] -ne $imageVersions[0] -or $runningVersions[1] -ne $expectedNext) {
        throw 'The running app versions did not match the verified image.'
    }
    Assert-DatabaseUnchanged
    # Keep the usual `docker compose up` pointing at this patched image too.
    Invoke-Docker @('image', 'tag', $newImage, $canonicalImage) | Out-Host
    $state.Phase = 'HttpVerified'
    Save-State
    Write-Host "Update complete: Node.js $($runningVersions[0]); Next.js $($runningVersions[1]); login page HTTP 200."
    Write-Host 'Database container and data volume are unchanged. Complete the manual functional checks in the guide.'
    Write-Host "Rollback state: $statePath"
    Write-Host 'Rollback: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback-production.ps1'
}
catch {
    if ($statePath -and (Test-Path -LiteralPath $statePath)) {
        if ($swapAttempted) {
            Write-Warning 'App replacement was attempted. Use the rollback command if the app is unavailable.'
            Write-Host 'Rollback: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback-production.ps1'
        }
        else {
            Write-Host 'App replacement was not started. The original app was not stopped by this script. No app rollback is needed.'
        }
    }
    throw
}
finally {
    [Console]::OutputEncoding = $originalConsoleEncoding
    $OutputEncoding = $originalOutputEncoding
    Pop-Location
}
