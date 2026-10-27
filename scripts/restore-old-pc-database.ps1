[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ExpectedComputerName,
    [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$DumpFile
)

$ErrorActionPreference = 'Stop'
if ([Environment]::MachineName -ine $ExpectedComputerName.Trim()) {
    throw "Wrong computer. Expected '$ExpectedComputerName'; this PC is '$([Environment]::MachineName)'. No Docker commands were run."
}
$repoDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
. (Join-Path $PSScriptRoot 'host-disk-space.ps1')
$appName = 'formalin-next-app-container'
$dbName = 'formalin-next-db-container'
$database = 'formalin_next_db_v2'
$socket = '/var/run/postgresql'
$appStopped = $false
$restoreCommitted = $false
$restartFailed = $false
$tempCreated = $false
$backupSaved = $false
$restoreContext = $null
$oldEncoding = [Console]::OutputEncoding
$oldOutputEncoding = $OutputEncoding

function Invoke-RestoreDocker {
    param([string[]]$DockerArguments)
    & docker --context $restoreContext @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed (exit $LASTEXITCODE): $($DockerArguments -join ' ')" }
}
function Read-ContainerField {
    param([string]$Container, [string]$Field)
    return (((Invoke-RestoreDocker @('inspect', '--format', "{{json .$Field}}", $Container)) -join "`n") | ConvertFrom-Json)
}
function Read-CustomDump {
    param([string]$Path)
    $file = Get-Item -LiteralPath $Path -ErrorAction Stop
    if ($file.PSIsContainer -or $file.Length -le 5) { throw 'The custom-format dump is missing or empty.' }
    $stream = [IO.File]::OpenRead($file.FullName)
    try {
        $header = New-Object byte[] 5
        if ($stream.Read($header, 0, 5) -ne 5 -or [Text.Encoding]::ASCII.GetString($header) -ne 'PGDMP') {
            throw 'The selected dump does not have a PostgreSQL custom-format PGDMP header.'
        }
    }
    finally { $stream.Dispose() }
    return $file
}
function Assert-SourceUnchanged {
    $now = Get-Item -LiteralPath $source.FullName -ErrorAction Stop
    if ($now.Length -ne $sourceLength -or $now.LastWriteTimeUtc -ne $sourceTime -or
        (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash -ne $sourceHash) {
        throw 'The source dump changed. Database restore was not started.'
    }
}
function Read-StackIdentity {
    $appLabels = Read-ContainerField $appName 'Config.Labels'
    $dbLabels = Read-ContainerField $dbName 'Config.Labels'
    $projectName = [string]$appLabels.'com.docker.compose.project'
    foreach ($labels in @($appLabels, $dbLabels)) {
        $workingDir = [string]$labels.'com.docker.compose.project.working_dir'
        if ([string]::IsNullOrWhiteSpace($workingDir) -or
            [IO.Path]::GetFullPath($workingDir).TrimEnd('\', '/') -ne $repoDir -or
            $labels.'com.docker.compose.project' -ne $projectName) {
            throw 'Container project or working directory does not match this OLD PC repository.'
        }
    }
    $mounts = @(Read-ContainerField $dbName 'Mounts' | Where-Object { $_.Destination -eq '/var/lib/postgresql/data' })
    if ($projectName -notmatch '^[a-z0-9][a-z0-9_-]*$' -or
        $appLabels.'com.docker.compose.service' -ne 'formalin-next-app' -or
        $dbLabels.'com.docker.compose.service' -ne 'formalin-next-db' -or
        $mounts.Count -ne 1 -or $mounts[0].Type -ne 'volume' -or [string]::IsNullOrWhiteSpace($mounts[0].Name)) {
        throw 'The expected application/database services and named database volume were not found.'
    }
    if (-not (Read-ContainerField $dbName 'State.Running')) { throw 'The OLD PC database is not running.' }
    return [pscustomobject]@{
        AppId = [string](Read-ContainerField $appName 'Id')
        DbId = [string](Read-ContainerField $dbName 'Id')
        Project = $projectName
        Volume = [string]$mounts[0].Name
    }
}
function Assert-StackUnchanged {
    $now = Read-StackIdentity
    if ($now.AppId -ne $identity.AppId -or $now.DbId -ne $identity.DbId -or
        $now.Project -ne $identity.Project -or $now.Volume -ne $identity.Volume) {
        throw 'The application/database identity changed. Restore was stopped.'
    }
}
function Invoke-LocalSql {
    param([string]$Sql)
    # Text stdin preserves quoted SQL identifiers in Windows PowerShell 5.1.
    $Sql | & docker --context $restoreContext exec -i $identity.DbId psql -X -h $socket -p 5432 -w -U postgres -d $database -At -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "Local database query failed (exit $LASTEXITCODE)." }
}

try {
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
    $OutputEncoding = [Console]::OutputEncoding
    Assert-HostDiskSpace -WorkspacePath $repoDir
    $source = Read-CustomDump $DumpFile
    $sourceLength = $source.Length
    $sourceTime = $source.LastWriteTimeUtc
    $sourceHash = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash
    $restoreContext = ((& docker context show) -join '').Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($restoreContext)) { throw 'Cannot identify the current local Docker context.' }
    $endpoint = ((Invoke-RestoreDocker @('context', 'inspect', $restoreContext, '--format', '{{json .Endpoints.docker.Host}}')) -join '') | ConvertFrom-Json
    if ($endpoint -notin @('npipe:////./pipe/docker_engine', 'npipe:////./pipe/dockerDesktopLinuxEngine')) {
        throw 'Restore requires a local Windows Docker Desktop named-pipe context. Remote contexts are refused.'
    }
    $identity = Read-StackIdentity
    if (-not (Read-ContainerField $appName 'State.Running')) { throw 'The existing OLD PC application must be running before restore.' }
    $dbSizeText = ((Invoke-LocalSql 'SELECT pg_database_size(current_database());') -join '').Trim()
    [long]$dbBytes = 0
    if (-not [long]::TryParse($dbSizeText, [ref]$dbBytes) -or $dbBytes -le 0) { throw 'Cannot determine current database size for the safety backup.' }
    Assert-HostDiskSpace -WorkspacePath $repoDir -ExtraWorkspaceBytes ([long][math]::Ceiling(2.0 * $dbBytes + $sourceLength))
    $token = [guid]::NewGuid().ToString('N')
    $tempSource = '/tmp/formalin-restore-' + $token + '-source.dump'
    $tempBackup = '/tmp/formalin-restore-' + $token + '-before.dump'
    try {
        $tempCreated = $true
        Invoke-RestoreDocker @('cp', $source.FullName, "$($identity.DbId):$tempSource") | Out-Host
        Assert-SourceUnchanged
        $copiedHash = ((Invoke-RestoreDocker @('exec', $identity.DbId, 'sha256sum', $tempSource)) -join '').Split(' ')[0]
        if ($copiedHash -ine $sourceHash) { throw 'The copied source dump hash differs. Restore was not started.' }
        $contents = @(Invoke-RestoreDocker @('exec', $identity.DbId, 'pg_restore', '--list', $tempSource))
        foreach ($table in @('Formalin', 'History', 'User')) {
            if (-not ($contents -match (' TABLE public ' + $table + ' '))) { throw "The source dump does not contain $table. Restore was not started." }
        }
        Assert-StackUnchanged
        Assert-SourceUnchanged
        $backupDir = Join-Path (Join-Path $repoDir '.database-restore-backups') ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + $token.Substring(0, 8))
        New-Item -ItemType Directory -Path $backupDir -ErrorAction Stop | Out-Null
        $backupPath = Join-Path $backupDir 'database-before-restore.dump'
        $appStopped = $true
        Invoke-RestoreDocker @('stop', '--time', '30', $identity.AppId) | Out-Host
        Assert-StackUnchanged
        Invoke-RestoreDocker @('exec', $identity.DbId, 'pg_dump', '-h', $socket, '-p', '5432', '-w', '-U', 'postgres', '-d', $database, '-F', 'c', '-f', $tempBackup) | Out-Host
        Invoke-RestoreDocker @('cp', "$($identity.DbId):$tempBackup", $backupPath) | Out-Host
        $safetyBackup = Read-CustomDump $backupPath
        Invoke-RestoreDocker @('exec', $identity.DbId, 'pg_restore', '--list', $tempBackup) | Out-Null
        $backupHash = ((Invoke-RestoreDocker @('exec', $identity.DbId, 'sha256sum', $tempBackup)) -join '').Split(' ')[0]
        if ($backupHash -ine (Get-FileHash -LiteralPath $safetyBackup.FullName -Algorithm SHA256).Hash) {
            throw 'The safety backup copy hash differs. Restore was not started.'
        }
        $backupSaved = $true
        Write-Host "Old database safety backup retained: $backupPath"
        Assert-StackUnchanged
        Assert-SourceUnchanged
        Invoke-RestoreDocker @('exec', $identity.DbId, 'pg_restore', '--clean', '--if-exists', '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', '-h', $socket, '-p', '5432', '-w', '-U', 'postgres', '-d', $database, $tempSource) | Out-Host
        $restoreCommitted = $true
        Write-Host 'DATABASE RESTORE COMMITTED. The selected dump now replaces the OLD PC application data.'
    }
    finally {
        if ($appStopped) {
            try { Invoke-RestoreDocker @('start', $identity.AppId) | Out-Host }
            catch { $restartFailed = $true; Write-Warning "The same app container could not be restarted: $($_.Exception.Message)" }
        }
        if ($tempCreated) {
            # Keep the container-side safety dump if its PC copy was not verified.
            $tempCleanup = @('exec', $identity.DbId, 'rm', '-f', '--', $tempSource)
            if ($backupSaved) { $tempCleanup += $tempBackup }
            try { Invoke-RestoreDocker $tempCleanup | Out-Null }
            catch { Write-Warning 'Temporary source cleanup failed. Retained PC safety backups were not deleted.' }
        }
    }
    if ($restartFailed) { throw 'Application restart failed after the database restore committed.' }
    Assert-StackUnchanged
    $counts = @(Invoke-LocalSql 'SELECT ''Formalin='' || count(*) FROM "Formalin" UNION ALL SELECT ''History='' || count(*) FROM "History" UNION ALL SELECT ''User='' || count(*) FROM "User";')
    Write-Host ('Restored row counts: ' + ($counts -join '; '))
    $ready = $false
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3003/login' -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        }
        catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'The login page did not return HTTP 200 within 90 seconds.' }
    Write-Host 'Restore and login-page check complete. Check inventory/history and log in using an account in the dump.'
}
catch {
    if ($restoreCommitted) { Write-Warning 'The database restore committed; a later application/health check failed. No automatic database rollback was performed.' }
    else { Write-Warning 'Restore did not report success. SQL errors roll back its single transaction; Docker/connection failures require checking the database before retrying.' }
    throw
}
finally {
    [Console]::OutputEncoding = $oldEncoding
    $OutputEncoding = $oldOutputEncoding
}
