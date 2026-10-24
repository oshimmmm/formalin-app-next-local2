function Assert-HostDiskSpace {
    param(
        [Parameter(Mandatory = $true)][string]$WorkspacePath,
        [long]$ExtraWorkspaceBytes = 0
    )

    if ($ExtraWorkspaceBytes -lt 0) { throw 'Invalid disk space budget.' }
    $workspaceDrive = (Get-Item -LiteralPath $WorkspacePath -ErrorAction Stop).PSDrive
    if ($null -eq $workspaceDrive -or $workspaceDrive.Provider.Name -ne 'FileSystem') {
        throw 'Cannot identify the workspace filesystem drive.'
    }
    $driveNames = @($workspaceDrive.Name)
    if ($env:SystemDrive -match '^[A-Za-z]:$') { $driveNames += $env:SystemDrive.TrimEnd(':') }
    foreach ($driveName in @($driveNames | Select-Object -Unique)) {
        $drive = Get-PSDrive -Name $driveName -PSProvider FileSystem -ErrorAction Stop
        [long]$required = 10GB
        if ($driveName -eq $workspaceDrive.Name) { $required += $ExtraWorkspaceBytes }
        if ($null -eq $drive.Free -or [long]$drive.Free -lt $required) {
            throw ('Insufficient free disk space on {0}: {1:N2} GiB free; requires at least {2:N2} GiB. Free space before retrying; Docker build was not started.' -f $drive.Root, ([double]$drive.Free / 1GB), ([double]$required / 1GB))
        }
    }
    # Custom Docker data locations / virtual disk limits require a separate check.
}
