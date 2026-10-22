[CmdletBinding(DefaultParameterSetName = 'Latest')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'StateFile')]
    [ValidateNotNullOrEmpty()]
    [string]$StateFile,
    [Parameter(ParameterSetName = 'Latest')]
    [switch]$Latest
)

# Restore the saved app image only. Never restore, migrate, or recreate the database.
$ErrorActionPreference = 'Stop'
$scriptDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
$originalConsoleEncoding = [Console]::OutputEncoding
$originalOutputEncoding = $OutputEncoding

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

function Assert-DatabaseUnchanged {
    $dbLabels = Read-DockerJson $state.DatabaseContainer 'Config.Labels'
    $mounts = @(Read-DockerJson $state.DatabaseContainer 'Mounts' | Where-Object { $_.Destination -eq '/var/lib/postgresql/data' })
    $dbId = (Invoke-Docker @('inspect', '--format', '{{.Id}}', $state.DatabaseContainer) -join '').Trim()
    $running = (Invoke-Docker @('inspect', '--format', '{{.State.Running}}', $state.DatabaseContainer) -join '').Trim()
    if ($dbId -ne $state.DatabaseContainerId -or $dbLabels.'com.docker.compose.project' -ne $state.Project -or
        $dbLabels.'com.docker.compose.service' -ne 'formalin-next-db' -or $running -ne 'true' -or
        $mounts.Count -ne 1 -or $mounts[0].Type -ne 'volume' -or $mounts[0].Name -ne $state.DatabaseVolumeName) {
        throw 'The database identity differs from the saved state. Stop and investigate; do not delete or restore any database volume.'
    }
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
    throw 'The restored app login page did not return HTTP 200 within 90 seconds.'
}

if ($PSCmdlet.ParameterSetName -eq 'Latest') {
    $snapshotRoot = Join-Path $scriptDir '.deployment-backups'
    if (Test-Path -LiteralPath $snapshotRoot -PathType Container) {
        # Sort the immutable creation names, not state-file modification times:
        # retrying an older rollback must not make that snapshot the newest one.
        $snapshotDirectories = @(Get-ChildItem -LiteralPath $snapshotRoot -Directory |
            Where-Object { $_.Name -match '^\d{8}-\d{6}-\d{3}$' } |
            Sort-Object Name -Descending)
        foreach ($directory in $snapshotDirectories) {
            $candidatePath = Join-Path $directory.FullName 'state.json'
            if (-not (Test-Path -LiteralPath $candidatePath -PathType Leaf)) {
                throw "The latest update snapshot '$($directory.FullName)' is incomplete. Stop and investigate; an older deployment was not selected."
            }
            try { $candidate = Get-Content -LiteralPath $candidatePath -Raw | ConvertFrom-Json }
            catch {
                throw "Cannot read rollback state '$candidatePath'. Stop and investigate; do not automatically select an older snapshot."
            }
            # Select the latest attempt, including a build-only failure. Skipping
            # that attempt could undo an earlier successful deployment by mistake.
            if ($candidate.StateVersion -ne 1 -or $candidate.Phase -notin @('SnapshotSaved', 'ReplacingApp', 'HttpVerified', 'RolledBack')) {
                throw "Unsupported rollback state '$candidatePath'. Stop and investigate; do not automatically select an older snapshot."
            }
            $StateFile = $candidatePath
            break
        }
    }
    if ([string]::IsNullOrWhiteSpace($StateFile)) {
        throw 'No saved production update snapshot is available. Use update-production.ps1 to preserve a rollback snapshot before replacing the app.'
    }
    Write-Host "Selected rollback state: $StateFile"
}

$stateItem = Get-Item -LiteralPath $StateFile -ErrorAction Stop
if ($stateItem.PSIsContainer) { throw 'StateFile must be the state.json produced by update-production.ps1.' }
$state = Get-Content -LiteralPath $stateItem.FullName -Raw | ConvertFrom-Json
$latestBuildOnly = $PSCmdlet.ParameterSetName -eq 'Latest' -and $state.Phase -eq 'SnapshotSaved'
if ($state.StateVersion -ne 1 -or $state.Project -notmatch '^[a-z0-9][a-z0-9_-]*$' -or
    $state.AppContainer -ne 'formalin-next-app-container' -or $state.Service -ne 'formalin-next-app' -or
    $state.DatabaseContainer -ne 'formalin-next-db-container' -or
    $state.RollbackImageTag -notmatch '^formalin-rollback:[0-9-]+$' -or
    $state.CanonicalImageTag -notmatch '^[a-z0-9][a-z0-9._/:@-]*$') {
    throw 'This state file is not a supported production rollback snapshot.'
}
$deployDir = [IO.Path]::GetFullPath($state.DeployDirectory).TrimEnd('\', '/')
$savedDir = $stateItem.Directory.FullName
$allowedRoot = (Join-Path $deployDir '.deployment-backups').TrimEnd('\') + '\'
if ($deployDir -ne $scriptDir -or -not $savedDir.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFullPath($state.ComposeSnapshot) -ne (Join-Path $savedDir 'docker-compose.before.yml') -or
    [IO.Path]::GetFullPath($state.ImageArchive) -ne (Join-Path $savedDir 'app-before.tar')) {
    throw 'Use the snapshot in the original deployment directory on the original workplace PC.'
}
if ((Get-FileHash -LiteralPath $state.ComposeSnapshot -Algorithm SHA256).Hash -ne $state.ComposeSnapshotHash) {
    throw 'The saved Compose configuration was changed. Stop and review it first.'
}
$archive = Get-Item -LiteralPath $state.ImageArchive -ErrorAction Stop
if ($archive.PSIsContainer -or $archive.Length -le 0) { throw 'The saved app image archive is missing or empty.' }

Push-Location $deployDir
try {
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
    $OutputEncoding = [Console]::OutputEncoding
    $engineId = (Invoke-Docker @('info', '--format', '{{.ID}}') -join '').Trim()
    if ($engineId -ne $state.DockerEngineId) { throw 'The Docker engine differs from the saved snapshot. Use the original workplace Docker context.' }
    Assert-DatabaseUnchanged
    $existingApp = (Invoke-Docker @('container', 'ls', '--all', '--filter', "name=^/$($state.AppContainer)$", '--format', '{{.ID}}') -join '').Trim()
    if ($existingApp) {
        $labels = Read-DockerJson $state.AppContainer 'Config.Labels'
        if ($labels.'com.docker.compose.project' -ne $state.Project -or $labels.'com.docker.compose.service' -ne $state.Service) {
            throw 'The app container belongs to a different Compose project.'
        }
    }
    if ($latestBuildOnly) {
        if (-not $existingApp -or
            (Invoke-Docker @('inspect', '--format', '{{.Image}}', $state.AppContainer) -join '').Trim() -ne $state.OriginalImageId -or
            (Invoke-Docker @('inspect', '--format', '{{.State.Running}}', $state.AppContainer) -join '').Trim() -ne 'true') {
            throw 'The latest update stopped before replacing the app, but its original app image is no longer running. Stop and investigate; an older deployment was not selected.'
        }
        Write-Host 'The latest update stopped before replacing the app. The existing app image and database are unchanged; no rollback was needed.'
        return
    }
    $overrideFile = Join-Path $savedDir 'rollback.override.yml'
    "services:`n  $($state.Service):`n    image: $($state.RollbackImageTag)`n" | Set-Content -LiteralPath $overrideFile -Encoding ASCII
    $composeArgs = @('compose', '--project-directory', $deployDir, '-p', $state.Project, '-f', $state.ComposeSnapshot, '-f', $overrideFile)
    # Resolve configuration without printing environment values.
    $effective = ((Invoke-Docker ($composeArgs + @('config', '--format', 'json'))) -join "`n") | ConvertFrom-Json
    if ((Get-EnvironmentHash $effective.services.($state.Service).environment) -ne $state.EnvironmentHash) {
        throw 'The environment files differ from the original app settings. Restore the original .env/.env.docker settings before rollback. Values were not printed.'
    }
    $dbVolumes = @($effective.services.'formalin-next-db'.volumes | Where-Object { $_.target -eq '/var/lib/postgresql/data' })
    if ($dbVolumes.Count -ne 1 -or $dbVolumes[0].type -ne 'volume' -or
        $effective.volumes.($dbVolumes[0].source).name -ne $state.DatabaseVolumeName) {
        throw 'The saved Compose configuration does not reference the original database volume.'
    }
    $localImages = @(Invoke-Docker @('image', 'ls', '--no-trunc', '--quiet', '--filter', "reference=$($state.RollbackImageTag)") |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim() })
    if ($localImages -contains $state.OriginalImageId) {
        Write-Host 'Using the original app image already on this PC. No image build or database restore is needed.'
    }
    else {
        Write-Host 'Loading the saved app image archive. Database contents will remain unchanged.'
        Invoke-Docker @('image', 'load', '--input', $state.ImageArchive) | Out-Host
    }
    if ((Invoke-Docker @('image', 'inspect', '--format', '{{.Id}}', $state.RollbackImageTag) -join '').Trim() -ne $state.OriginalImageId) {
        throw 'The restored image ID differs from the saved original image.'
    }
    Invoke-Docker @('image', 'tag', $state.OriginalImageId, $state.CanonicalImageTag) | Out-Host
    Invoke-Docker ($composeArgs + @('up', '-d', '--no-deps', '--no-build', '--pull', 'never', $state.Service)) | Out-Host
    if ((Invoke-Docker @('inspect', '--format', '{{.Image}}', $state.AppContainer) -join '').Trim() -ne $state.OriginalImageId) {
        throw 'The running app did not switch back to the original image.'
    }
    Wait-LoginPage
    Assert-DatabaseUnchanged
    $state.Phase = 'RolledBack'
    $state | Add-Member -NotePropertyName RolledBackAt -NotePropertyValue (Get-Date).ToString('o') -Force
    $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $stateItem.FullName -Encoding UTF8
    Write-Host 'App rollback complete; login page HTTP 200. Database container, volume, and current records were retained.'
    Write-Host 'Check login, inventory, and history in the browser. Source files remain at the updated version.'
}
finally {
    [Console]::OutputEncoding = $originalConsoleEncoding
    $OutputEncoding = $originalOutputEncoding
    Pop-Location
}
