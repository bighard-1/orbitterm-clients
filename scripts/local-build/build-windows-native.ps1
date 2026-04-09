param(
  [string]$ClientRepoPath = "",
  [string]$ReleaseTag = "",
  [switch]$NoPublish,
  [switch]$Push,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Text)
  Write-Host "==> $Text" -ForegroundColor Cyan
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Invoke-Build {
  param([string[]]$Args)
  & npx tauri build @Args
  return $LASTEXITCODE
}

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

if ($env:OS -ne "Windows_NT") {
  throw "This script must run on Windows host / Windows VM."
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root

if ([string]::IsNullOrWhiteSpace($ClientRepoPath)) {
  $ClientRepoPath = Join-Path (Split-Path $root -Parent) "orbitterm-clients"
}

Require-Command "npm"
Require-Command "rustup"
Require-Command "cargo"
Require-Command "git"
Require-Command "npx"

$packageJsonPath = Join-Path $root "package.json"
$packageVersion = (Get-Content $packageJsonPath -Raw | ConvertFrom-Json).version
if ([string]::IsNullOrWhiteSpace($ReleaseTag)) {
  $ReleaseTag = "v$packageVersion"
}

$disableUpdaterScript = Join-Path $root "scripts\disable-tauri-updater.mjs"
$srcTauriConfigPath = Join-Path $root "src-tauri\tauri.conf.json"
$tmpTauriConfigPath = Join-Path $env:TEMP "orbitterm-tauri.conf.windows.no-updater.json"
$backupTauriConfigPath = Join-Path $env:TEMP "orbitterm-tauri.conf.windows.backup.json"
$configSwapped = $false

function Restore-TauriConfig {
  if (-not $configSwapped) { return }
  if (Test-Path $tmpTauriConfigPath) {
    Remove-Item -Path $tmpTauriConfigPath -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path $backupTauriConfigPath) {
    Copy-Item -Path $backupTauriConfigPath -Destination $srcTauriConfigPath -Force
    Remove-Item -Path $backupTauriConfigPath -Force -ErrorAction SilentlyContinue
  }
  $script:configSwapped = $false
}

trap {
  Restore-TauriConfig
  throw $_
}

Write-Step "Project root: $root"
Write-Step "Client repo: $ClientRepoPath"
Write-Step "Release tag: $ReleaseTag"

if (Test-Path $disableUpdaterScript) {
  Write-Step "Prepare temporary tauri config (updater artifacts disabled for local Windows build)"
  node $disableUpdaterScript $srcTauriConfigPath $tmpTauriConfigPath
  if ($LASTEXITCODE -ne 0) { throw "Failed to prepare updater-disabled tauri config." }
  Copy-Item -Path $srcTauriConfigPath -Destination $backupTauriConfigPath -Force
  Copy-Item -Path $tmpTauriConfigPath -Destination $srcTauriConfigPath -Force
  $configSwapped = $true
}

if (-not $SkipBuild) {
  Write-Step "Install node dependencies"
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

  Write-Step "Install rust target x86_64-pc-windows-msvc"
  rustup target add x86_64-pc-windows-msvc
  if ($LASTEXITCODE -ne 0) { throw "rustup target add failed." }

  Write-Step "Build Windows bundles (msi, nsis)"
  $code = Invoke-Build @("--target", "x86_64-pc-windows-msvc", "--bundles", "msi,nsis")
  if ($code -ne 0) {
    Write-Host "[WARN] msi+nsis failed, fallback to msi only..." -ForegroundColor Yellow
    $code = Invoke-Build @("--target", "x86_64-pc-windows-msvc", "--bundles", "msi")
  }
  if ($code -ne 0) {
    Write-Host "[WARN] msi failed, fallback to nsis only..." -ForegroundColor Yellow
    $code = Invoke-Build @("--target", "x86_64-pc-windows-msvc", "--bundles", "nsis")
  }
  if ($code -ne 0) {
    throw "Windows bundle build failed."
  }
}

$bundleRoot = Join-Path $root "src-tauri\target\x86_64-pc-windows-msvc\release\bundle"
if (-not (Test-Path $bundleRoot)) {
  $bundleRoot = Join-Path $root "src-tauri\target\release\bundle"
}
if (-not (Test-Path $bundleRoot)) {
  throw "Bundle directory not found: $bundleRoot"
}

$artifactFiles = @()
$msiDir = Join-Path $bundleRoot "msi"
$nsisDir = Join-Path $bundleRoot "nsis"
if (Test-Path $msiDir) {
  $artifactFiles += Get-ChildItem -Path $msiDir -File -Filter *.msi
}
if (Test-Path $nsisDir) {
  $artifactFiles += Get-ChildItem -Path $nsisDir -File -Filter *.exe
}
$artifactFiles = $artifactFiles | Sort-Object FullName -Unique

if (-not $artifactFiles -or $artifactFiles.Count -eq 0) {
  throw "No Windows installer artifacts found in: $bundleRoot"
}

Write-Step "Built artifacts"
$artifactFiles | ForEach-Object { Write-Host "  $($_.FullName)" }

if ($NoPublish) {
  Write-Step "NoPublish set. Skip copying/publishing."
  Restore-TauriConfig
  Write-Step "Done"
  return
}

if (-not (Test-Path $ClientRepoPath)) {
  throw "Client repo path does not exist: $ClientRepoPath"
}

$latestJsonPath = Join-Path $ClientRepoPath "releases\latest.json"
if (-not (Test-Path $latestJsonPath)) {
  throw "Missing releases/latest.json in client repo: $latestJsonPath"
}

$releaseDir = Join-Path $ClientRepoPath "releases\$ReleaseTag"
New-Item -Path $releaseDir -ItemType Directory -Force | Out-Null

Write-Step "Copy artifacts to client repo release dir"
$hashTable = @{}
foreach ($file in $artifactFiles) {
  $destPath = Join-Path $releaseDir $file.Name
  Copy-Item -Path $file.FullName -Destination $destPath -Force
  $sha = (Get-FileHash -Path $destPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $hashTable[$file.Name] = $sha
}

$shaOut = Join-Path $releaseDir "SHA256SUMS.windows.txt"
$shaLines = @()
foreach ($name in ($hashTable.Keys | Sort-Object)) {
  $shaLines += "$($hashTable[$name])  ./$name"
}
Write-Utf8NoBom -Path $shaOut -Content ($shaLines -join "`n")

$latest = Get-Content $latestJsonPath -Raw | ConvertFrom-Json
$primaryMsi = $artifactFiles | Where-Object { $_.Extension -eq ".msi" } | Select-Object -First 1
$primaryExe = $artifactFiles | Where-Object { $_.Extension -eq ".exe" } | Select-Object -First 1
$primary = if ($null -ne $primaryMsi) { $primaryMsi.Name } else { $primaryExe.Name }

$latest.version = $ReleaseTag
$latest.date = (Get-Date -Format "yyyy-MM-dd")
$latest.windowsPackage = $primary
$latest.windowsSha256 = $hashTable[$primary]
$latest.windowsDownloadUrl = "https://raw.githubusercontent.com/bighard-1/orbitterm-clients/main/releases/$ReleaseTag/$primary"

$windowsPackages = [ordered]@{}
foreach ($f in $artifactFiles) {
  $key = if ($f.Extension -eq ".msi") { "msi" } elseif ($f.Extension -eq ".exe") { "nsis" } else { $f.Extension.TrimStart(".") }
  $windowsPackages[$key] = [ordered]@{
    file = $f.Name
    sha256 = $hashTable[$f.Name]
  }
}
$latest | Add-Member -MemberType NoteProperty -Name windowsPackages -Value $windowsPackages -Force

$manifestPath = Join-Path $releaseDir "release-manifest.json"
$latestJson = $latest | ConvertTo-Json -Depth 30
Write-Utf8NoBom -Path $latestJsonPath -Content $latestJson
Write-Utf8NoBom -Path $manifestPath -Content $latestJson

$websiteMetaPath = Join-Path $root "website\public\release-meta.json"
if (Test-Path $websiteMetaPath) {
  Write-Utf8NoBom -Path $websiteMetaPath -Content $latestJson
}

Write-Step "Published release metadata"
Write-Host "  $latestJsonPath"
Write-Host "  $manifestPath"
Write-Host "  $websiteMetaPath"

if ($Push) {
  Write-Step "Commit and push client repo"
  Push-Location $ClientRepoPath
  git add "releases/latest.json" "releases/$ReleaseTag"
  if ($LASTEXITCODE -ne 0) { throw "git add failed (client repo)." }
  git commit -m "release(client): publish $ReleaseTag windows package"
  if ($LASTEXITCODE -ne 0) { throw "git commit failed (client repo)." }
  git push origin main
  if ($LASTEXITCODE -ne 0) { throw "git push failed (client repo)." }
  Pop-Location

  Write-Step "Commit and push main repo website release meta"
  Push-Location $root
  git add "website/public/release-meta.json"
  if ($LASTEXITCODE -ne 0) { throw "git add failed (main repo)." }
  git commit -m "chore(website): sync release meta for $ReleaseTag windows build"
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] No changes to commit in main repo."
  } else {
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw "git push failed (main repo)." }
  }
  Pop-Location
}

Restore-TauriConfig
Write-Step "Done"
