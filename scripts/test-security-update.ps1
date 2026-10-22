[CmdletBinding()]
param()

# Disposable test stack only. Never combine this file with docker-compose.yml.
$ErrorActionPreference = 'Stop'
$repoDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testFile = Join-Path $repoDir 'docker-compose.test.yml'
$testProject = 'formalin-security-' + [Guid]::NewGuid().ToString('N').Substring(0, 10)
$composeArgs = @('compose', '--project-directory', $repoDir, '-p', $testProject, '-f', $testFile)
$created = $false

function Invoke-TestDocker {
    param([string[]]$DockerArguments)
    & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker test command failed (exit $LASTEXITCODE)." }
}

try {
    Invoke-TestDocker @('info', '--format', '{{.ServerVersion}}') | Out-Host
    Invoke-TestDocker ($composeArgs + @('build', '--pull', 'formalin-test-app')) | Out-Host
    $created = $true
    Invoke-TestDocker ($composeArgs + @('up', '-d', '--wait', 'formalin-test-db')) | Out-Host
    Invoke-TestDocker ($composeArgs + @('run', '--rm', '--no-deps', 'formalin-test-app', 'node', 'node_modules/prisma/build/index.js', 'migrate', 'deploy')) | Out-Host
    Invoke-TestDocker ($composeArgs + @('up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'formalin-test-app')) | Out-Host

    $ready = $false
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:33003/login' -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        }
        catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'The isolated test app did not become ready.' }

    Invoke-TestDocker ($composeArgs + @('exec', '-T', '-e', 'SMOKE_TEST_ALLOW_WRITE=isolated-test-only', '-e', 'SMOKE_BASE_URL=http://127.0.0.1:3003', 'formalin-test-app', 'node', 'scripts/smoke-test.mjs')) | Out-Host
    $versions = ((Invoke-TestDocker ($composeArgs + @('exec', '-T', 'formalin-test-app', 'node', '-p', "JSON.stringify([process.versions.node,require('next/package.json').version,require('react/package.json').version])"))) -join "`n") | ConvertFrom-Json
    if ($versions[0] -ne '22.23.4' -or $versions[1] -ne '15.5.28' -or $versions[2] -ne '19.0.9') {
        throw 'The test image versions differ from the selected patched versions.'
    }
    Write-Host ('PASS: Node.js {0}, Next.js {1}, React {2}; isolated database only.' -f $versions[0], $versions[1], $versions[2])
}
finally {
    if ($created) {
        # This random project uses a tmpfs DB; production containers/volumes are never selected.
        & docker @composeArgs down
        if ($LASTEXITCODE -ne 0) { Write-Warning "Test stack cleanup failed: project $testProject" }
    }
}
