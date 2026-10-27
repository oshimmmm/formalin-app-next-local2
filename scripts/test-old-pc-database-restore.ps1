[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\','/')
$art=Join-Path $repo '.test-artifacts'
$fixtures=Join-Path $art ('old-pc-restore-mock-'+[guid]::NewGuid().ToString('N'))
$results=New-Object 'System.Collections.Generic.List[object]'
function Assert-Mock { param([bool]$Ok,[string]$Message) if(-not $Ok){throw ('MOCK ASSERTION: '+$Message)} }
function New-Case {
 param([string]$Name)
 $root=Join-Path $fixtures $Name
 New-Item -ItemType Directory -Path (Join-Path $root 'scripts') -Force|Out-Null
 foreach($file in @('restore-old-pc-database.ps1','host-disk-space.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $root ('scripts\'+$file))}
 $dump=Join-Path $root 'database-before.dump';$backupFixture=Join-Path $root 'mock-current-db.dump'
 [IO.File]::WriteAllBytes($dump,[Text.Encoding]::ASCII.GetBytes('PGDMPmock-source-dump'))
 [IO.File]::WriteAllBytes($backupFixture,[Text.Encoding]::ASCII.GetBytes('PGDMPmock-existing-db-different-data'))
 $global:RestoreMock=@{Root=$root;Dump=$dump;BackupFixture=$backupFixture;Hash=(Get-FileHash $dump -Algorithm SHA256).Hash;BackupHash=(Get-FileHash $backupFixture -Algorithm SHA256).Hash;Calls=(New-Object 'System.Collections.Generic.List[object]');Sql=(New-Object 'System.Collections.Generic.List[string]');Context='desktop-linux';Endpoint='npipe:////./pipe/dockerDesktopLinuxEngine';AppId='mock-app-id';DbId='mock-db-id';AppService='formalin-next-app';DbService='formalin-next-db';AppProject='mockproject';DbProject='mockproject';WorkingDir=$root;MountType='volume';Volume='mockproject_data';AppRunning=$true;DbRunning=$true;DiskFree=[long](100GB);MissingTable=$false;FailBackup=$false;FailRestore=$false;CorruptSourceHash=$false;CorruptBackupCopy=$false;ChangeVolume=$false;MountReads=0;Stops=0;Starts=0;Backups=0;Restores=0;Remote=@{};BackupCopies=(New-Object 'System.Collections.Generic.List[string]');Http=0}
 $global:LASTEXITCODE=0
}
function global:Get-PSDrive {param([string]$Name,[string]$PSProvider,$ErrorAction) [pscustomobject]@{Name=$Name;Root=($Name+':\');Free=$global:RestoreMock.DiskFree}}
function global:Invoke-WebRequest {param([string]$Uri,[switch]$UseBasicParsing,[int]$TimeoutSec) Assert-Mock ($Uri -eq 'http://127.0.0.1:3003/login') 'HTTP must remain local';$global:RestoreMock.Http++;[pscustomobject]@{StatusCode=200}}
function global:docker {
 $a=@($args|ForEach-Object{[string]$_});$stdinText=@($input|ForEach-Object{[string]$_}) -join ([Environment]::NewLine);$m=$global:RestoreMock;$m.Calls.Add([string[]]$a);$global:LASTEXITCODE=0
 if($a[0] -eq 'context' -and $a[1] -eq 'show'){return $m.Context}
 Assert-Mock ($a.Count -gt 2 -and $a[0] -eq '--context' -and $a[1] -eq $m.Context) 'all remaining Docker calls must pin validated context'
 $a=@($a|Select-Object -Skip 2)
 if($a[0] -eq 'context'){Assert-Mock ($a[1] -eq 'inspect' -and $a[2] -eq $m.Context -and $a[-1] -eq '{{json .Endpoints.docker.Host}}') 'context endpoint check';return ($m.Endpoint|ConvertTo-Json -Compress)}
 if($a[0] -eq 'inspect'){
  Assert-Mock ($a.Count -eq 4 -and $a[1] -eq '--format') 'explicit inspect field required'
  $db=$a[3] -in @('formalin-next-db-container',$m.DbId);$app=$a[3] -in @('formalin-next-app-container',$m.AppId);Assert-Mock ($db -or $app) 'unexpected inspected container'
  switch($a[2]){
   '{{json .Config.Labels}}' {$v=[ordered]@{'com.docker.compose.project'=$(if($db){$m.DbProject}else{$m.AppProject});'com.docker.compose.service'=$(if($db){$m.DbService}else{$m.AppService});'com.docker.compose.project.working_dir'=$m.WorkingDir}}
   '{{json .Mounts}}' {if($app){return '[]'};$m.MountReads++;$volume=if($m.ChangeVolume -and $m.MountReads -gt 1){'unexpected-other-volume'}else{$m.Volume};$v=@([ordered]@{Destination='/var/lib/postgresql/data';Type=$m.MountType;Name=$volume})}
   '{{json .State.Running}}' {$v=if($db){$m.DbRunning}else{$m.AppRunning}}
   '{{json .Id}}' {$v=if($db){$m.DbId}else{$m.AppId}}
   default {throw ('Unexpected inspect field '+$a[2])}
  };return (ConvertTo-Json -InputObject $v -Compress -Depth 8)
 }
 if($a[0] -in @('stop','start')){Assert-Mock ($a[-1] -eq $m.AppId) 'only app may stop/start';if($a[0] -eq 'stop'){$m.Stops++;$m.AppRunning=$false}else{$m.Starts++;$m.AppRunning=$true};return $m.AppId}
 if($a[0] -eq 'cp'){
  Assert-Mock ($a.Count -eq 3) 'copy shape'
  if($a[1].StartsWith($m.DbId+':')){Assert-Mock ($m.Backups -eq 1 -and -not $m.FailBackup) 'copy only completed safety backup';Copy-Item -LiteralPath $m.BackupFixture -Destination $a[2];if($m.CorruptBackupCopy){[IO.File]::AppendAllText($a[2],'changed')};$m.BackupCopies.Add($a[2]);return}
  Assert-Mock ($a[2].StartsWith($m.DbId+':/tmp/formalin-restore-')) 'source target must be bounded temp path'
  Assert-Mock ((Get-FileHash -LiteralPath $a[1] -Algorithm SHA256).Hash -eq $m.Hash) 'source hash';$m.Remote[$a[2].Substring(($m.DbId+':').Length)]=$m.Hash;return
 }
 if($a[0] -eq 'exec'){
  $ix=[array]::IndexOf($a,[string]$m.DbId);Assert-Mock ($ix -ge 1) 'exec must target existing DB ID';$cmd=$a[$ix+1]
  if($cmd -eq 'sha256sum'){Assert-Mock ($m.Remote.ContainsKey($a[-1])) 'hash only known temporary dump';$hash=if($m.CorruptSourceHash -and $a[-1].EndsWith('-source.dump')){'0'*64}else{$m.Remote[$a[-1]]};return ($hash+'  '+$a[-1])}
  if($cmd -eq 'pg_restore' -and $a -contains '--list'){$toc=@('1; 1259 1 TABLE public Formalin postgres','2; 1259 2 TABLE public History postgres');if(-not ($m.MissingTable -and $a[-1].EndsWith('-source.dump'))){$toc+='3; 1259 3 TABLE public User postgres'};return $toc}
  if($cmd -in @('pg_dump','pg_restore','psql')){foreach($arg in @('/var/run/postgresql','5432','-w','postgres','formalin_next_db_v2')){Assert-Mock ($a -contains $arg) ('local socket/noninteractive database arg missing: '+$arg)}}
  if($cmd -eq 'psql'){
   Assert-Mock ($a -contains '-i' -and $a -contains '-X' -and $a -contains 'ON_ERROR_STOP=1') 'SQL stdin/error stop';$m.Sql.Add($stdinText);Assert-Mock ($stdinText -notmatch '(?i)\b(DROP|DELETE|TRUNCATE|CREATE|INSERT|UPDATE)\b') 'only read-only SQL verification'
   if($stdinText -match 'pg_database_size'){return '1048576'}
   if($stdinText -match '(?i)count\('){return @('Formalin=3','History=8','User=1')}
   throw 'Unexpected SQL query'
  }
  if($cmd -eq 'pg_dump'){$m.Backups++;Assert-Mock (-not $m.AppRunning -and $m.Stops -eq 1) 'stop app before current backup';Assert-Mock ($a -contains '-F' -and $a -contains 'c') 'backup custom format';if($m.FailBackup){$global:LASTEXITCODE=41;return};$m.Remote[$a[-1]]=$m.BackupHash;return}
  if($cmd -eq 'pg_restore'){
   $m.Restores++;Assert-Mock (-not $m.AppRunning -and $m.BackupCopies.Count -eq 1) 'durable PC backup required before restore'
   foreach($flag in @('--clean','--if-exists','--single-transaction','--exit-on-error','--no-owner','--no-privileges')){Assert-Mock ($a -contains $flag) ('missing restore flag '+$flag)}
   Assert-Mock (-not ($a -contains '--create') -and -not ($a -contains '-C')) 'must not create/drop DB';if($m.FailRestore){$global:LASTEXITCODE=42};return
  }
  if($cmd -eq 'rm'){foreach($path in @($a|Select-Object -Skip ($ix+2)|Where-Object{$_ -notin @('-f','--')})){Assert-Mock ($path -match '^/tmp/formalin-restore-[a-f0-9]+-(source|before)\.dump$') 'cleanup limited to run temp dumps'};return}
  throw ('Unexpected exec command '+$cmd)
 }
 throw ('Unexpected Docker operation; executable is never called: '+($a -join ' '))
}
function Invoke-Case {
 param([string]$ExpectedComputerName=[Environment]::MachineName)
 $lines=New-Object 'System.Collections.Generic.List[string]';$caught=$null;$m=$global:RestoreMock
 try{& (Join-Path $m.Root 'scripts\restore-old-pc-database.ps1') -ExpectedComputerName $ExpectedComputerName -DumpFile $m.Dump *>&1|ForEach-Object{$lines.Add([string]$_)}}catch{$caught=$_;$lines.Add($_.Exception.Message)}
 Assert-Mock (($lines -join ([Environment]::NewLine)) -notmatch '(?i)POSTGRES_PASSWORD|DB_PASSWORD|PGPASSWORD') 'no password output'
 Assert-Mock ((Get-FileHash -LiteralPath $m.Dump -Algorithm SHA256).Hash -eq $m.Hash) 'source remains unchanged'
 [pscustomobject]@{Error=$caught;Output=($lines -join ([Environment]::NewLine))}
}
function Add-Pass {param([string]$Name) $results.Add([pscustomobject]@{Test=$Name;Result='PASS'})}
try{
 New-Case 'wrong-PC';$r=Invoke-Case -ExpectedComputerName ('WRONG-'+[guid]::NewGuid().ToString('N'));Assert-Mock ($null -ne $r.Error -and $global:RestoreMock.Calls.Count -eq 0) 'wrong PC before Docker';Add-Pass 'Wrong PC rejected before Docker'
 New-Case 'low-disk';$global:RestoreMock.DiskFree=[long](1GB);$r=Invoke-Case;Assert-Mock ($null -ne $r.Error -and $global:RestoreMock.Calls.Count -eq 0) 'low disk before Docker';Add-Pass 'Low disk rejected before Docker'
 New-Case 'invalid-header';[IO.File]::WriteAllBytes($global:RestoreMock.Dump,[Text.Encoding]::ASCII.GetBytes('INVALID_DUMP'));$global:RestoreMock.Hash=(Get-FileHash $global:RestoreMock.Dump -Algorithm SHA256).Hash;$r=Invoke-Case;Assert-Mock ($null -ne $r.Error -and $global:RestoreMock.Calls.Count -eq 0) 'invalid source before Docker';Add-Pass 'Invalid source rejected before Docker'
 foreach($endpoint in @('tcp://remote.invalid:2376','npipe:////./pipe/unexpected-engine')){
  New-Case ('remote-'+$results.Count);$global:RestoreMock.Endpoint=$endpoint;$r=Invoke-Case;$m=$global:RestoreMock;Assert-Mock ($null -ne $r.Error -and $m.Calls.Count -eq 2) 'reject unexpected endpoint before container inspection';Add-Pass ('Docker endpoint rejected: '+$endpoint)
 }
 foreach($case in @('app-service','db-service','project','bind-mount','working-directory','db-stopped','app-stopped')){
  New-Case $case;$m=$global:RestoreMock
  switch($case){'app-service'{$m.AppService='wrong'};'db-service'{$m.DbService='wrong'};'project'{$m.DbProject='wrong'};'bind-mount'{$m.MountType='bind'};'working-directory'{$m.WorkingDir=$repo};'db-stopped'{$m.DbRunning=$false};'app-stopped'{$m.AppRunning=$false}}
  $r=Invoke-Case;Assert-Mock ($null -ne $r.Error -and $m.Stops -eq 0 -and $m.Backups -eq 0 -and $m.Restores -eq 0) ('identity rejection '+$case);Add-Pass ('Identity rejected: '+$case)
 }
 New-Case 'volume-changes';$global:RestoreMock.ChangeVolume=$true;$r=Invoke-Case;$m=$global:RestoreMock;Assert-Mock ($null -ne $r.Error -and $m.Stops -eq 0 -and $m.Restores -eq 0) 'volume changes must reject before app stop';Add-Pass 'Named volume change rejected'
 New-Case 'source-TOC';$global:RestoreMock.MissingTable=$true;$r=Invoke-Case;$m=$global:RestoreMock;Assert-Mock ($null -ne $r.Error -and $m.Stops -eq 0 -and $m.Restores -eq 0) 'incomplete TOC before app stop';Add-Pass 'Incomplete source TOC rejected'
 New-Case 'source-copy-hash';$global:RestoreMock.CorruptSourceHash=$true;$r=Invoke-Case;$m=$global:RestoreMock;Assert-Mock ($null -ne $r.Error -and $m.Stops -eq 0 -and $m.Restores -eq 0) 'source copy hash mismatch before stop';Add-Pass 'Source copy hash mismatch rejected'
 New-Case 'backup-failure';$global:RestoreMock.FailBackup=$true;$r=Invoke-Case;$m=$global:RestoreMock;Assert-Mock ($null -ne $r.Error -and $m.Backups -eq 1 -and $m.Restores -eq 0 -and $m.Stops -eq 1 -and $m.Starts -eq 1 -and $m.AppRunning) 'backup failure prevents restore and restarts same app';Add-Pass 'Backup failure restarts app without restore'
 New-Case 'backup-copy-hash';$global:RestoreMock.CorruptBackupCopy=$true;$r=Invoke-Case;$m=$global:RestoreMock;Assert-Mock ($null -ne $r.Error -and $m.Restores -eq 0 -and $m.Starts -eq 1) 'safety copy mismatch prevents restore';Add-Pass 'Safety backup copy hash mismatch rejected'
 New-Case 'restore-failure';$global:RestoreMock.FailRestore=$true;$r=Invoke-Case;$m=$global:RestoreMock;Assert-Mock ($null -ne $r.Error -and $m.Restores -eq 1 -and $m.BackupCopies.Count -eq 1 -and $m.Stops -eq 1 -and $m.Starts -eq 1 -and $m.AppRunning) 'restore failure retains backup and restarts app';Assert-Mock (Test-Path -LiteralPath $m.BackupCopies[0] -PathType Leaf) 'safety backup retained';Add-Pass 'Transactional restore failure retains safety backup'
 New-Case 'success';$r=Invoke-Case;$m=$global:RestoreMock;Assert-Mock ($null -eq $r.Error) ('success path must complete: '+$r.Output);Assert-Mock ($m.Backups -eq 1 -and $m.Restores -eq 1 -and $m.BackupCopies.Count -eq 1 -and $m.Stops -eq 1 -and $m.Starts -eq 1 -and $m.AppRunning -and $m.DbRunning -and $m.Http -eq 1) 'one safety backup/restore, only app restart, local health verified';Assert-Mock (@($m.Sql|Where-Object{$_ -match '(?i)count\('}).Count -eq 1) 'row counts verified with SELECT';Assert-Mock (@($m.Calls|Where-Object{$_ -contains '{{json .Mounts}}'}).Count -ge 3) 'DB volume rechecked';Assert-Mock ($r.Output -match 'Formalin=3' -and $r.Output -match 'History=8' -and $r.Output -match 'User=1') 'row counts printed';Add-Pass 'Successful restore preserves existing DB and checks counts'
 [pscustomobject]@{Runtime=$PSVersionTable.PSVersion.ToString();CompletedAt=(Get-Date).ToString('o');RealDockerCommands=0;Tests=$results.ToArray()}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $art 'old-pc-db-restore-mock-results.json') -Encoding UTF8
 Write-Host ('PASS: '+$results.Count+' old-PC restore mock tests; no real Docker/HTTP/database calls.')
}finally{
 Remove-Item -LiteralPath 'Function:\docker' -ErrorAction SilentlyContinue
 Remove-Item -LiteralPath 'Function:\Invoke-WebRequest' -ErrorAction SilentlyContinue
 Remove-Item -LiteralPath 'Function:\Get-PSDrive' -ErrorAction SilentlyContinue
 Remove-Variable -Name RestoreMock -Scope Global -ErrorAction SilentlyContinue
 if(Test-Path -LiteralPath $fixtures){$resolved=(Resolve-Path -LiteralPath $fixtures).Path;if((Split-Path -Parent $resolved) -ne $art -or (Split-Path -Leaf $resolved) -notmatch '^old-pc-restore-mock-[a-f0-9]{32}$'){throw 'Refusing unexpected mock fixture cleanup target'};Remove-Item -LiteralPath $resolved -Recurse -Force}
}
