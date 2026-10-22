[CmdletBinding()]
param()

# This regression harness invokes copied scripts with fake Docker and HTTP commands.
# It never invokes a Docker executable or contacts a database/server.
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
$artifactRoot = Join-Path $workspace '.test-artifacts'
$fixtureRoot = Join-Path $artifactRoot ('deployment-helper-mock-' + [guid]::NewGuid().ToString('N'))
$results = [System.Collections.Generic.List[object]]::new()
$savedStateTemplate = $null
$sourceHashes = @{}
foreach ($name in @('update-production.ps1', 'rollback-production.ps1')) {
    $sourceHashes[$name] = (Get-FileHash -LiteralPath (Join-Path $workspace ('scripts\' + $name)) -Algorithm SHA256).Hash
}

function Assert-Mock {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw ('MOCK ASSERTION FAILED: ' + $Message) }
}

function New-Scenario {
    param([string]$Name, [string]$BackupMode = 'valid', [bool]$FailBuild = $false)
    $root = Join-Path $fixtureRoot $Name
    New-Item -ItemType Directory -Path (Join-Path $root 'scripts') -Force | Out-Null
    foreach ($file in @('update-production.ps1', 'rollback-production.ps1')) {
        Copy-Item -LiteralPath (Join-Path $workspace ('scripts\' + $file)) -Destination (Join-Path $root ('scripts\' + $file))
    }
    Copy-Item -LiteralPath (Join-Path $workspace 'docker-compose.yml') -Destination (Join-Path $root 'docker-compose.yml')
    $dumpDir = Join-Path $root 'usb-fixture'
    New-Item -ItemType Directory -Path $dumpDir | Out-Null
    $dump = Join-Path $dumpDir 'formalin_next_db_v2.dump'
    $body = if ($BackupMode -eq 'invalid-header') { 'NOT_A_PGDMP_ARCHIVE' } else { 'PGDMPmock-custom-format-body' }
    [IO.File]::WriteAllBytes($dump, [Text.Encoding]::ASCII.GetBytes($body))
    $length = (Get-Item -LiteralPath $dump).Length
    $logCode = if ($BackupMode -eq 'failed-log') { 1 } else { 0 }
    Set-Content -LiteralPath (Join-Path $dumpDir 'backup_log.txt') -Value ('2026-10-23 17:30 exit={0} size={1} bytes' -f $logCode, $length) -Encoding ASCII
    if ($BackupMode -eq 'old') { (Get-Item -LiteralPath $dump).LastWriteTime = (Get-Date).AddHours(-25) }
    $envModel = [ordered]@{ NODE_ENV = 'production'; PORT = '3003'; DATABASE_URL = 'postgresql://mock-fixture-only' }
    $config = [ordered]@{
        services = [ordered]@{
            'formalin-next-app' = [ordered]@{
                environment = $envModel
                ports = @([ordered]@{ published = '3003'; target = 3003 })
                networks = [ordered]@{ 'formalin-network' = @{} }
            }
            'formalin-next-db' = [ordered]@{
                image = 'postgres:17'
                volumes = @([ordered]@{ type = 'volume'; source = 'formalin-next-db-data'; target = '/var/lib/postgresql/data' })
            }
        }
        volumes = [ordered]@{ 'formalin-next-db-data' = [ordered]@{ name = 'mockproject_formalin-next-db-data' } }
        networks = [ordered]@{ 'formalin-network' = [ordered]@{ name = 'mockproject_formalin-network' } }
    }
    $global:DeploymentMock = @{
        Root = $root
        Dump = $dump
        Project = 'mockproject'
        Canonical = 'mockproject-formalin-next-app'
        Config = $config
        Env = $envModel
        OldImage = 'sha256:1111111111111111111111111111111111111111111111111111111111111111'
        NewImage = 'sha256:2222222222222222222222222222222222222222222222222222222222222222'
        DbImage = 'sha256:3333333333333333333333333333333333333333333333333333333333333333'
        AppImage = 'sha256:1111111111111111111111111111111111111111111111111111111111111111'
        AppRunning = $true
        DbId = 'mock-db-container-id-unchanged'
        DbVolume = 'mockproject_formalin-next-db-data'
        Tags = @{ 'mockproject-formalin-next-app' = 'sha256:1111111111111111111111111111111111111111111111111111111111111111' }
        Calls = [System.Collections.Generic.List[object]]::new()
        UpCalls = [System.Collections.Generic.List[object]]::new()
        HttpCalls = 0
        FailBuild = $FailBuild
    }
    $global:LASTEXITCODE = 0
    return $root
}

function Get-OverrideImage {
    param([string[]]$DockerArgs)
    $files = @()
    for ($i = 0; $i -lt $DockerArgs.Count - 1; $i++) {
        if ($DockerArgs[$i] -eq '-f') { $files += $DockerArgs[$i + 1] }
    }
    Assert-Mock ($files.Count -eq 2) 'build/up must specify main configuration and one override'
    $override = Get-Content -LiteralPath $files[-1] -Raw
    Assert-Mock ($override -match '(?m)^\s+image:\s*(\S+)\s*$') 'override must contain a single image tag'
    return $Matches[1]
}

function New-SavedSnapshot {
    param([string]$Stamp, [string]$Phase, [switch]$MissingArchive, [switch]$WrongComposeHash, [string]$OriginalImage)
    $m = $global:DeploymentMock
    if ([string]::IsNullOrWhiteSpace($OriginalImage)) { $OriginalImage = $m.OldImage }
    $snapshotDir = Join-Path (Join-Path $m.Root '.deployment-backups') $Stamp
    New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
    $saved = $script:savedStateTemplate | ConvertFrom-Json
    $saved.Phase = $Phase
    $saved.DeployDirectory = $m.Root
    $saved.ComposeSnapshot = Join-Path $snapshotDir 'docker-compose.before.yml'
    $saved.ImageArchive = Join-Path $snapshotDir 'app-before.tar'
    $saved.RollbackImageTag = 'formalin-rollback:' + $Stamp
    $saved.OriginalImageId = $OriginalImage
    Copy-Item -LiteralPath (Join-Path $m.Root 'docker-compose.yml') -Destination $saved.ComposeSnapshot
    $saved.ComposeSnapshotHash = (Get-FileHash -LiteralPath $saved.ComposeSnapshot -Algorithm SHA256).Hash
    if ($WrongComposeHash) { $saved.ComposeSnapshotHash = 'changed-compose-hash' }
    $m.Tags[$saved.RollbackImageTag] = $OriginalImage
    if (-not $MissingArchive) {
        [IO.File]::WriteAllText($saved.ImageArchive, (@{ Tag = $saved.RollbackImageTag; Image = $OriginalImage } | ConvertTo-Json -Compress))
    }
    $path = Join-Path $snapshotDir 'state.json'
    $saved | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

# Function lookup shadows any Docker executable. Unknown invocations always fail closed.
function global:docker {
    $a = @($args | ForEach-Object { [string]$_ })
    $m = $global:DeploymentMock
    $m.Calls.Add([string[]]$a)
    $global:LASTEXITCODE = 0
    if ($a[0] -eq 'inspect') {
        Assert-Mock ($a.Count -eq 4 -and $a[1] -eq '--format') 'inspect argument shape'
        $format = $a[2]
        $container = $a[3]
        $isDb = $container -eq 'formalin-next-db-container'
        Assert-Mock ($isDb -or $container -eq 'formalin-next-app-container') 'unexpected inspected container'
        switch ($format) {
            '{{json .Config.Labels}}' {
                $labels = [ordered]@{
                    'com.docker.compose.project' = $m.Project
                    'com.docker.compose.service' = $(if ($isDb) { 'formalin-next-db' } else { 'formalin-next-app' })
                    'com.docker.compose.project.working_dir' = $m.Root
                    'com.docker.compose.project.config_files' = (Join-Path $m.Root 'docker-compose.yml')
                }
                return ($labels | ConvertTo-Json -Compress)
            }
            '{{json .Mounts}}' {
                if ($isDb) { return ('[{"Destination":"/var/lib/postgresql/data","Type":"volume","Name":"' + $m.DbVolume + '"}]') }
                return '[]'
            }
            '{{.State.Running}}' { if ($isDb -or $m.AppRunning) { return 'true' }; return 'false' }
            '{{.Id}}' { if ($isDb) { return $m.DbId }; return 'mock-app-container-id' }
            '{{.Image}}' { if ($isDb) { return $m.DbImage }; return $m.AppImage }
            '{{json .Config.Cmd}}' { return '["npm","run","start"]' }
            '{{json .Config.Env}}' {
                return (@($m.Env.GetEnumerator() | ForEach-Object { $_.Key + '=' + $_.Value }) | ConvertTo-Json -Compress)
            }
            '{{json .NetworkSettings.Networks}}' { return '{"mockproject_formalin-network":{}}' }
            default { throw ('Unexpected Docker inspect format: ' + $format) }
        }
    }
    if ($a[0] -eq 'compose') {
        if ($a -contains 'config') {
            if ($a -contains '--images') { return @('postgres:17', $m.Canonical) }
            Assert-Mock ($a -contains '--format' -and $a[-1] -eq 'json') 'config JSON flags'
            return ($m.Config | ConvertTo-Json -Depth 20 -Compress)
        }
        if ($a -contains 'build') {
            Assert-Mock ($a -contains '--pull' -and $a[-1] -eq 'formalin-next-app') 'build only app with --pull'
            if ($m.FailBuild) { $global:LASTEXITCODE = 37; return }
            $image = Get-OverrideImage $a
            $m.Tags[$image] = $m.NewImage
            return
        }
        if ($a -contains 'up') {
            Assert-Mock ($a -contains '--no-deps' -and $a -contains '--no-build' -and $a -contains 'never') 'up must preserve DB and use existing image'
            Assert-Mock ($a[-1] -eq 'formalin-next-app') 'up must select only app'
            $image = Get-OverrideImage $a
            Assert-Mock ($m.Tags.ContainsKey($image)) 'up image must already exist'
            $m.UpCalls.Add([string[]]$a)
            $m.AppImage = $m.Tags[$image]
            return
        }
        throw ('Unexpected Compose invocation: ' + ($a -join ' '))
    }
    if ($a[0] -eq 'image') {
        switch ($a[1]) {
            'ls' {
                Assert-Mock ($a -contains '--no-trunc' -and $a -contains '--quiet' -and $a -contains '--filter') 'local image check must return full IDs without inspect errors'
                $filter = $a[[array]::IndexOf($a, '--filter') + 1]
                Assert-Mock ($filter.StartsWith('reference=formalin-rollback:')) 'local image check must target saved rollback tag'
                $tag = $filter.Substring('reference='.Length)
                if ($m.Tags.ContainsKey($tag)) { return $m.Tags[$tag] }
                return
            }
            'tag' {
                $source = $a[2]
                $id = if ($m.Tags.ContainsKey($source)) { $m.Tags[$source] } else { $source }
                Assert-Mock ($id -in @($m.OldImage, $m.NewImage)) 'tag source must be an app image'
                $m.Tags[$a[3]] = $id
                return
            }
            'save' {
                Assert-Mock ($a[2] -eq '--output' -and $m.Tags[$a[4]] -eq $m.OldImage) 'save original image only'
                [IO.File]::WriteAllText($a[3], (@{ Tag = $a[4]; Image = $m.OldImage } | ConvertTo-Json -Compress))
                return
            }
            'load' {
                Assert-Mock ($a[2] -eq '--input') 'load must use archive file'
                $saved = Get-Content -LiteralPath $a[3] -Raw | ConvertFrom-Json
                $m.Tags[$saved.Tag] = $saved.Image
                return
            }
            'inspect' {
                Assert-Mock ($a[2] -eq '--format' -and $a[3] -eq '{{.Id}}' -and $m.Tags.ContainsKey($a[4])) 'image inspect existing known tag'
                return $m.Tags[$a[4]]
            }
            default { throw ('Unexpected image command: ' + ($a -join ' ')) }
        }
    }
    if ($a[0] -eq 'run') {
        Assert-Mock ($a -contains '--rm' -and $a -contains '--network' -and $a -contains 'none') 'probe containers must be disposable and network isolated'
        if ($a -contains 'pg_restore') {
            Assert-Mock ($a -contains '--list' -and $a -contains '--mount') 'dump probe must only read TOC'
            $mount = $a[[array]::IndexOf($a, '--mount') + 1]
            Assert-Mock ($mount.EndsWith(',target=/backup.dump,readonly')) 'dump mount must be read-only'
            Assert-Mock ($a -contains $m.DbImage) 'dump probe must use existing DB image'
            return @('1; 1259 1 TABLE public Formalin postgres', '2; 1259 2 TABLE public History postgres', '3; 1259 3 TABLE public User postgres')
        }
        Assert-Mock ($a -contains 'node') 'app probe must only read node/next versions'
        return '["22.23.4","15.5.28"]'
    }
    if ($a[0] -eq 'exec') {
        Assert-Mock ($a[1] -eq 'formalin-next-app-container' -and $a[2] -eq 'node') 'only app version exec allowed'
        Assert-Mock ($m.AppImage -eq $m.NewImage) 'running app must be updated before version check'
        return '["22.23.4","15.5.28"]'
    }
    if ($a[0] -eq 'info') { return 'mock-docker-engine-id' }
    if ($a[0] -eq 'container' -and $a[1] -eq 'ls') { return 'mock-app-container-id' }
    throw ('Unexpected fake Docker invocation: ' + ($a -join ' '))
}

function global:Invoke-WebRequest {
    param([string]$Uri, [switch]$UseBasicParsing, [int]$TimeoutSec)
    Assert-Mock ($Uri -eq 'http://127.0.0.1:3003/login') 'HTTP probe must use local login URL'
    $global:DeploymentMock.HttpCalls++
    return [pscustomobject]@{ StatusCode = 200 }
}

function Add-Result {
    param([string]$Name, [string]$Detail)
    $results.Add([pscustomobject]@{ Test = $Name; Result = 'PASS'; Detail = $Detail })
    Write-Host ('PASS: ' + $Name)
}

New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
try {
    $root = New-Scenario 'success-and-rollback'
    & (Join-Path $root 'scripts\update-production.ps1') -BackupFile $global:DeploymentMock.Dump
    $m = $global:DeploymentMock
    Assert-Mock ($m.AppImage -eq $m.NewImage) 'successful update running image'
    Assert-Mock ($m.Tags[$m.Canonical] -eq $m.NewImage) 'successful update canonical tag must target patched image'
    Assert-Mock ($m.UpCalls.Count -eq 1) 'successful update should replace app once'
    $stateFiles = @(Get-ChildItem -LiteralPath (Join-Path $root '.deployment-backups') -Filter state.json -Recurse -File)
    Assert-Mock ($stateFiles.Count -eq 1) 'successful update should persist one rollback state'
    $stateFile = $stateFiles[0].FullName
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $savedStateTemplate = $state | ConvertTo-Json -Depth 8
    Assert-Mock ($state.Phase -eq 'HttpVerified' -and $state.CanonicalImageTag -eq $m.Canonical) 'updated state phase and canonical image'
    Assert-Mock ($state.DatabaseContainerId -eq $m.DbId -and $state.DatabaseVolumeName -eq $m.DbVolume) 'recorded database identity unchanged'
    Add-Result 'Full update with two config image lines' 'DB image excluded; patched image runs and canonical tag matches; rollback archive/state retained.'
    & (Join-Path $root 'scripts\rollback-production.ps1') -StateFile $stateFile
    Assert-Mock ($m.AppImage -eq $m.OldImage -and $m.Tags[$m.Canonical] -eq $m.OldImage) 'rollback must restore both running and canonical old image'
    Assert-Mock ($m.UpCalls.Count -eq 2 -and $m.HttpCalls -eq 2) 'one verified app replacement for each direction'
    $rolledState = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    Assert-Mock ($rolledState.Phase -eq 'RolledBack') 'rollback phase persisted'
    Assert-Mock ($m.DbId -eq 'mock-db-container-id-unchanged' -and $m.DbVolume -eq 'mockproject_formalin-next-db-data') 'database identity must never change'
    Assert-Mock (@($m.Calls | Where-Object { $_[0] -eq 'image' -and $_[1] -eq 'load' }).Count -eq 0) 'local original image must skip archive loading'
    Add-Result 'Full explicit app rollback using local image' 'Original image runs and canonical tag restored without loading tar; DB container and volume retained.'

    $root = New-Scenario 'latest-build-only-no-op'
    $older = New-SavedSnapshot '20260101-010101-001' 'HttpVerified' -OriginalImage $global:DeploymentMock.NewImage
    $buildOnly = New-SavedSnapshot '20260103-010101-001' 'SnapshotSaved'
    & (Join-Path $root 'scripts\rollback-production.ps1')
    Assert-Mock ($global:DeploymentMock.UpCalls.Count -eq 0) 'latest build-only failure must not undo an earlier successful deployment'
    Assert-Mock (@($global:DeploymentMock.Calls | Where-Object { $_[0] -eq 'image' }).Count -eq 0) 'latest build-only failure must not load or retag any image'
    Assert-Mock ($global:DeploymentMock.AppImage -eq $global:DeploymentMock.OldImage) 'latest build-only failure must keep its original running image'
    Assert-Mock ((Get-Content -LiteralPath $older -Raw | ConvertFrom-Json).Phase -eq 'HttpVerified') 'previous successful deployment must remain unselected'
    Assert-Mock ((Get-Content -LiteralPath $buildOnly -Raw | ConvertFrom-Json).Phase -eq 'SnapshotSaved') 'no-op must not change the build-only phase'
    Add-Result 'Latest build failure preserves previous successful deployment' 'Checks latest attempt image and DB identity; performs no image load/tag or app replacement.'
    & (Join-Path $root 'scripts\rollback-production.ps1') -StateFile $older
    Assert-Mock ($global:DeploymentMock.UpCalls.Count -eq 1 -and $global:DeploymentMock.AppImage -eq $global:DeploymentMock.NewImage) 'explicit historical state must still permit intentionally restoring that original image'
    Add-Result 'Explicit historical StateFile remains supported' 'An older successful deployment is restored only when its state file is explicitly requested.'

    $root = New-Scenario 'latest-app-replacement'
    $older = New-SavedSnapshot '20260101-010101-001' 'HttpVerified'
    $eligible = New-SavedSnapshot '20260102-010101-001' 'ReplacingApp'
    & (Join-Path $root 'scripts\rollback-production.ps1')
    Assert-Mock ((Get-Content -LiteralPath $eligible -Raw | ConvertFrom-Json).Phase -eq 'RolledBack') 'no-args rollback must select latest attempted app replacement'
    Assert-Mock ((Get-Content -LiteralPath $older -Raw | ConvertFrom-Json).Phase -eq 'HttpVerified') 'older deployment must remain unselected'
    Assert-Mock ($global:DeploymentMock.UpCalls.Count -eq 1) 'latest rollback must replace app once'
    Add-Result 'No-args latest selects most recent app replacement' 'Selects ReplacingApp over an older successful deployment.'
    & (Join-Path $root 'scripts\rollback-production.ps1') -Latest
    Assert-Mock ($global:DeploymentMock.UpCalls.Count -eq 2) 'repeat -Latest should use same latest RolledBack snapshot'
    Assert-Mock ((Get-Content -LiteralPath $older -Raw | ConvertFrom-Json).Phase -eq 'HttpVerified') 'repeat rollback must not move backward through history'
    Add-Result 'Repeated latest rollback stays on same snapshot' 'RolledBack state remains eligible; repeating the command does not select an older release.'

    $root = New-Scenario 'build-only-history'
    New-SavedSnapshot '20260102-010101-001' 'SnapshotSaved' | Out-Null
    & (Join-Path $root 'scripts\rollback-production.ps1') -Latest
    Assert-Mock ($global:DeploymentMock.UpCalls.Count -eq 0 -and @($global:DeploymentMock.Calls | Where-Object { $_[0] -eq 'image' }).Count -eq 0) 'build-only history must be a verified no-op'
    Add-Result 'Build-only history returns verified no-op' 'Existing original app and DB remain in place without restarting the app.'

    foreach ($mismatch in @('app-image', 'app-stopped', 'database-container', 'database-volume')) {
        $root = New-Scenario ('build-only-mismatch-' + $mismatch)
        $older = New-SavedSnapshot '20260101-010101-001' 'HttpVerified'
        New-SavedSnapshot '20260102-010101-001' 'SnapshotSaved' | Out-Null
        if ($mismatch -eq 'app-image') { $global:DeploymentMock.AppImage = $global:DeploymentMock.NewImage }
        elseif ($mismatch -eq 'app-stopped') { $global:DeploymentMock.AppRunning = $false }
        elseif ($mismatch -eq 'database-container') { $global:DeploymentMock.DbId = 'different-db-id' }
        else { $global:DeploymentMock.DbVolume = 'different-db-volume' }
        $caught = $null
        try { & (Join-Path $root 'scripts\rollback-production.ps1') -Latest } catch { $caught = $_ }
        Assert-Mock ($null -ne $caught) ($mismatch + ' must stop the build-only no-op verification')
        Assert-Mock ($global:DeploymentMock.UpCalls.Count -eq 0 -and @($global:DeploymentMock.Calls | Where-Object { $_[0] -eq 'image' }).Count -eq 0) 'build-only mismatch must not load/tag images or replace the app'
        Assert-Mock ((Get-Content -LiteralPath $older -Raw | ConvertFrom-Json).Phase -eq 'HttpVerified') 'build-only mismatch must not select older successful snapshot'
        Add-Result ('Build-only mismatch rejected: ' + $mismatch) 'Identity mismatch fails closed without image changes or fallback to an older deployment.'
    }

    foreach ($localImageMode in @('missing-tag', 'wrong-tag')) {
        $root = New-Scenario ('archive-fallback-' + $localImageMode)
        $snapshot = New-SavedSnapshot '20260101-010101-001' 'HttpVerified'
        $saved = Get-Content -LiteralPath $snapshot -Raw | ConvertFrom-Json
        if ($localImageMode -eq 'missing-tag') { $global:DeploymentMock.Tags.Remove($saved.RollbackImageTag) }
        else { $global:DeploymentMock.Tags[$saved.RollbackImageTag] = $global:DeploymentMock.NewImage }
        & (Join-Path $root 'scripts\rollback-production.ps1') -Latest
        $m = $global:DeploymentMock
        Assert-Mock (@($m.Calls | Where-Object { $_[0] -eq 'image' -and $_[1] -eq 'load' }).Count -eq 1) 'missing/wrong local tag must load saved archive once'
        Assert-Mock ($m.AppImage -eq $m.OldImage -and $m.Tags[$m.Canonical] -eq $m.OldImage) 'archive fallback restores original running image and canonical tag'
        Add-Result ('Archive fallback: ' + $localImageMode) 'Saved archive loaded and original image verified when local saved tag is missing or incorrect.'
    }

    foreach ($scenario in @('empty-history', 'incomplete-latest-snapshot', 'missing-latest-archive', 'changed-latest-compose', 'malformed-latest-state')) {
        $root = New-Scenario $scenario
        if ($scenario -ne 'empty-history') {
            New-SavedSnapshot '20260101-010101-001' 'HttpVerified' | Out-Null
            $newest = New-SavedSnapshot '20260102-010101-001' 'HttpVerified' -MissingArchive:($scenario -eq 'missing-latest-archive') -WrongComposeHash:($scenario -eq 'changed-latest-compose')
            if ($scenario -eq 'incomplete-latest-snapshot') { Remove-Item -LiteralPath $newest }
            if ($scenario -eq 'malformed-latest-state') { Set-Content -LiteralPath $newest -Value '{broken JSON' -Encoding UTF8 }
        }
        $caught = $null
        try { & (Join-Path $root 'scripts\rollback-production.ps1') -Latest } catch { $caught = $_ }
        Assert-Mock ($null -ne $caught) ($scenario + ' must reject rollback')
        Assert-Mock ($global:DeploymentMock.Calls.Count -eq 0) ($scenario + ' must stop before Docker and must not fall back to an older deployment')
        Add-Result ('Latest rejects: ' + $scenario) 'Stops before Docker instead of guessing or selecting an older unusable snapshot.'
    }

    $root = New-Scenario 'mutually-exclusive-parameters'
    $snapshot = New-SavedSnapshot '20260101-010101-001' 'HttpVerified'
    $caught = $null
    try { & (Join-Path $root 'scripts\rollback-production.ps1') -Latest -StateFile $snapshot } catch { $caught = $_ }
    Assert-Mock ($null -ne $caught -and $global:DeploymentMock.Calls.Count -eq 0) 'Latest and StateFile must be mutually exclusive'
    Add-Result 'Latest and StateFile are mutually exclusive' 'Parameter binding rejects ambiguous rollback commands before Docker.'

    $root = New-Scenario 'build-failure' -FailBuild $true
    $caught = $null
    try { & (Join-Path $root 'scripts\update-production.ps1') -BackupFile $global:DeploymentMock.Dump } catch { $caught = $_ }
    $m = $global:DeploymentMock
    Assert-Mock ($null -ne $caught -and $caught.Exception.Message -match 'exit 37') 'native build failure must surface exit37'
    Assert-Mock ($m.UpCalls.Count -eq 0 -and $m.AppImage -eq $m.OldImage -and $m.Tags[$m.Canonical] -eq $m.OldImage) 'build failure must not stop/replace app or retag canonical'
    Add-Result 'Build failure exit 37' 'Failure propagated; no compose up; original running/canonical images unchanged.'

    foreach ($scenario in @(
        @{ Name = 'Old backup'; Mode = 'old'; Pattern = 'older than 24 hours' },
        @{ Name = 'Invalid PGDMP header'; Mode = 'invalid-header'; Pattern = 'PGDMP' },
        @{ Name = 'Failed backup log'; Mode = 'failed-log'; Pattern = 'backup log' }
    )) {
        $root = New-Scenario $scenario.Mode -BackupMode $scenario.Mode
        $caught = $null
        try { & (Join-Path $root 'scripts\update-production.ps1') -BackupFile $global:DeploymentMock.Dump } catch { $caught = $_ }
        Assert-Mock ($null -ne $caught -and $caught.Exception.Message -match $scenario.Pattern) ($scenario.Name + ' must reject with appropriate message')
        Assert-Mock ($global:DeploymentMock.Calls.Count -eq 0 -and $global:DeploymentMock.UpCalls.Count -eq 0) ($scenario.Name + ' must fail before Docker')
        Add-Result $scenario.Name 'Rejected before any Docker command or app replacement.'
    }
    foreach ($name in $sourceHashes.Keys) {
        Assert-Mock ((Get-FileHash -LiteralPath (Join-Path $workspace ('scripts\' + $name)) -Algorithm SHA256).Hash -eq $sourceHashes[$name]) 'production scripts must remain unchanged'
    }
    $report = [pscustomobject]@{
        Runtime = $PSVersionTable.PSVersion.ToString()
        CompletedAt = (Get-Date).ToString('o')
        RealDockerCommands = 0
        Tests = $results.ToArray()
        SourceSHA256 = $sourceHashes
    }
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $artifactRoot 'deployment-helper-mock-results.json') -Encoding UTF8
    Write-Host ('Mock regression: {0} tests passed; no real Docker/HTTP/database calls.' -f $results.Count)
}
finally {
    Remove-Item -LiteralPath 'Function:\docker' -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath 'Function:\Invoke-WebRequest' -ErrorAction SilentlyContinue
    Remove-Variable -Name DeploymentMock -Scope Global -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $fixtureRoot) {
        $resolved = (Resolve-Path -LiteralPath $fixtureRoot).Path
        if ((Split-Path -Parent $resolved) -ne $artifactRoot -or (Split-Path -Leaf $resolved) -notmatch '^deployment-helper-mock-[0-9a-f]{32}$') {
            throw 'Refusing cleanup outside the validated mock fixture directory.'
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
        Write-Host 'Validated mock fixture and snapshots removed.'
    }
}
