# rms-design-system-engine installer for Windows (PowerShell). The same steps as install.sh, the Windows way.
#
#   irm https://raw.githubusercontent.com/rafaelmatosdasilva/rms-design-system-engine/main/install.ps1 | iex
#
# A company's setup, as with install.sh: download it and pass the two values.
#   & ([scriptblock]::Create((irm <this file's link>))) -Client "Acme" -Profile "<the profile's link>"
#
# What it does, with nothing that needs an administrator:
#   - clones the engine (or updates it) into %USERPROFILE%\.claude\skills\rms-design-system-engine
#   - links the skill's guide into %USERPROFILE%\.claude\commands, so /rms-design-system-engine works in Claude Code
#   - writes the terminal command (rms-design-system-engine.cmd, and a bash script for Git Bash) into %USERPROFILE%\.local\bin, and puts that folder on
#     the user's PATH
#   - keeps axe-core and the web-features data the checks read, and says what is missing (Chrome or Edge, TypeScript)
param(
  [string]$Client = '',
  [string]$Profile = '',
  [string]$Folder = ''
)
$ErrorActionPreference = 'Stop'

$Repo = if ($env:RMS_DSE_REPO) { $env:RMS_DSE_REPO } else { 'https://github.com/rafaelmatosdasilva/rms-design-system-engine' }
$Ref = $env:RMS_DSE_REF
$CloneDir = Join-Path $HOME '.claude\skills\rms-design-system-engine'
$CommandsDir = Join-Path $HOME '.claude\commands'
$BinDir = Join-Path $HOME '.local\bin'
$SkillFile = 'rms-design-system-engine.md'

if (($Client -or $Profile) -and -not ($Client -and $Profile)) {
  Write-Host "❌  A company's setup needs both: -Client <client> -Profile <the profile's link>"; exit 2
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host '❌  git is required (https://git-scm.com/download/win).'; exit 1 }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host '❌  Node.js 22 or newer is required (https://nodejs.org).'; exit 1 }
$NodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($NodeMajor -lt 22) {
  Write-Host "❌  Node.js 22 or newer is required: this is $(node -v). The engine talks to Chrome over Node's built-in WebSocket, which older versions do not have."
  Write-Host '    Install it from https://nodejs.org.'
  exit 1
}

$Notes = @()
if (Test-Path (Join-Path $CloneDir '.git')) {
  Write-Host "↻  Updating existing install at $CloneDir"
  git -C $CloneDir pull --ff-only
} else {
  Write-Host "⬇  Installing to $CloneDir"
  New-Item -ItemType Directory -Force -Path (Split-Path $CloneDir) | Out-Null
  if ($Ref) { git clone --depth 1 --branch $Ref $Repo $CloneDir } else { git clone --depth 1 $Repo $CloneDir }
}
if ($LASTEXITCODE -ne 0) { Write-Host '❌  The engine could not be downloaded (the line above says why).'; exit 1 }

# The guide, where Claude Code finds /rms-design-system-engine: a hard link, which needs no administrator and follows
# every update of the clone; a copy where the folder is on another drive.
New-Item -ItemType Directory -Force -Path $CommandsDir | Out-Null
$Target = Join-Path $CommandsDir $SkillFile
if (Test-Path $Target) { Remove-Item -Force $Target }
try { New-Item -ItemType HardLink -Path $Target -Target (Join-Path $CloneDir $SkillFile) | Out-Null }
catch { Copy-Item (Join-Path $CloneDir $SkillFile) $Target; $Notes += "ℹ️  The guide was copied into $CommandsDir (a link was refused): run this installer again after an update." }
try { node (Join-Path $CloneDir 'lib\codex-skill.mjs') } catch { }

# The terminal command, for PowerShell and the command prompt alike, and a bash script beside it for Git Bash, the shell
# Claude Code runs its commands in on Windows, which starts a .cmd only by its full name.
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
Set-Content -Encoding ASCII -Path (Join-Path $BinDir 'rms-design-system-engine.cmd') -Value "@node `"$CloneDir\audit.mjs`" %*"
$Audit = (Join-Path $CloneDir 'audit.mjs') -replace '\\', '/'
[IO.File]::WriteAllText((Join-Path $BinDir 'rms-design-system-engine'), "#!/usr/bin/env bash`nexec node `"$Audit`" `"`$@`"`n")
$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($UserPath -split ';') -contains $BinDir)) {
  [Environment]::SetEnvironmentVariable('Path', (@($UserPath, $BinDir) | Where-Object { $_ }) -join ';', 'User')
  $env:Path = "$env:Path;$BinDir"
  $Notes += "ℹ️  $BinDir was added to your PATH: open a new terminal for rms-design-system-engine to be found."
}

try { node (Join-Path $CloneDir 'lib\a11y-check.mjs') --fetch-axe } catch { }
try { node (Join-Path $CloneDir 'lib\web-features-data.mjs') --fetch } catch { }

# A browser to measure with: Chrome where Windows installs it, else Edge (the same engine underneath).
$Browsers = @($env:CHROME_PATH)
foreach ($d in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
  if ($d) { $Browsers += (Join-Path $d 'Google\Chrome\Application\chrome.exe'); $Browsers += (Join-Path $d 'Microsoft\Edge\Application\msedge.exe') }
}
$Browser = $Browsers | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $Browser) {
  $Notes += "⚠️  No Chrome found, so nothing can be measured as a browser draws it: rendered parity, the accessibility check and every picture are skipped. Install Google Chrome (https://google.com/chrome), or set CHROME_PATH to where you keep it."
}

if ($Client) {
  $Slug = (($Client.ToLower()) -replace '[^a-z0-9]+', '-').Trim('-')
  if (-not $Folder) { $Folder = Join-Path $HOME "$Slug-design-system" }
  New-Item -ItemType Directory -Force -Path $Folder | Out-Null
  $EnvFile = Join-Path $Folder '.env'
  if (-not (Test-Path $EnvFile)) { New-Item -ItemType File -Path $EnvFile | Out-Null }
  $Has = { param($k) (Select-String -Path $EnvFile -Pattern "^\s*$k\s*=\s*\S" -Quiet) }
  $GitlabHost = if ($Profile -match '^https?://([^/]+)/') { $Matches[1] } else { '' }
  if ($GitlabHost -and $GitlabHost -ne 'gitlab.com' -and -not (& $Has 'GITLAB_HOST')) { Add-Content -Path $EnvFile -Value "GITLAB_HOST=$GitlabHost" }
  if (-not (& $Has 'GITLAB_TOKEN')) {
    $TokenHost = if ($GitlabHost) { $GitlabHost } else { 'gitlab.com' }
    Write-Host ''
    Write-Host "🔑  Your GitLab token: one for every project, kept only in $EnvFile."
    Write-Host "    Make it at https://$TokenHost/-/user_settings/personal_access_tokens (fine-grained: Read on the company's"
    Write-Host '    design-system projects, Code: Read and Download, Commit and Merge request: Read and Create). Paste it below.'
    $Secure = Read-Host '    Token (GITLAB_TOKEN, Enter to add it later)' -AsSecureString
    $Plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure))
    if ($Plain) { Add-Content -Path $EnvFile -Value "GITLAB_TOKEN=$Plain" }
    Remove-Variable Plain, Secure
  }
  Push-Location $Folder
  try {
    node (Join-Path $CloneDir 'audit.mjs') --make-command $Slug --profile $Profile 2>&1 | Where-Object { $_ -notmatch '^NEXT:' }
    if ($LASTEXITCODE -ne 0) { Write-Host "❌  The company's command was not written (the line above says why)."; exit 1 }
    node (Join-Path $CloneDir 'audit.mjs') --profile $Profile --store 2>&1 | Where-Object { $_ -notmatch '^NEXT:' }
  } finally { Pop-Location }
  Write-Host ''
  Write-Host "✅  Set up for $Client in $Folder"
  Write-Host "    Your token is in $EnvFile`: never share or commit it."
  $Notes | ForEach-Object { Write-Host $_ }
  Write-Host ''
  Write-Host '    To start, open Claude Code in that folder:'
  Write-Host ''
  Write-Host "      cd `"$Folder`"; claude"
  Write-Host ''
  Write-Host "    Then ask: /rms-design-system-engine-$Slug"
  exit 0
}

Write-Host ''
Write-Host '✅  Installed. Command: /rms-design-system-engine   ·   Terminal: rms-design-system-engine'
$Notes | ForEach-Object { Write-Host $_ }
Write-Host ''
Write-Host '  Use it inside any project:'
Write-Host ''
Write-Host '    cd my-project'
Write-Host '    rms-design-system-engine --init --project=.        # first-time setup: the code is this folder'
Write-Host '    rms-design-system-engine "check the button"        # ask in plain words'
Write-Host '    rms-design-system-engine                           # audit the whole design system'
