# Local assembly of both checked-out frontends for the shared technovahub.in host.
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$starlitRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$biometricRoot = [IO.Path]::GetFullPath((Join-Path $starlitRoot '..\biometric'))
if (-not (Test-Path -LiteralPath (Join-Path $biometricRoot 'frontend\package.json'))) {
  throw 'The sibling biometric checkout is required. Use the two-project hosting instructions for separate Git builds.'
}
if (-not $SkipBuild) {
  $previousApiUrl = [Environment]::GetEnvironmentVariable('VITE_API_URL', 'Process')
  try {
    $env:VITE_API_URL = 'https://biometric-1z8l.onrender.com/api'
    npm --prefix (Join-Path $biometricRoot 'frontend') run build
    if ($LASTEXITCODE -ne 0) { throw 'SecureVerify build failed.' }
    $env:VITE_API_URL = 'https://production-automation-5ss0.onrender.com'
    npm --prefix (Join-Path $starlitRoot 'frontend') run build
    if ($LASTEXITCODE -ne 0) { throw 'Starlit build failed.' }
  } finally {
    [Environment]::SetEnvironmentVariable('VITE_API_URL', $previousApiUrl, 'Process')
  }
}
node (Join-Path $biometricRoot 'scripts\models.mjs') --check
if ($LASTEXITCODE -ne 0) { throw 'SecureVerify model validation failed.' }
$source = Join-Path $biometricRoot 'frontend\dist'
$destination = Join-Path $starlitRoot 'frontend\dist\biometric'
if (-not (Test-Path -LiteralPath (Join-Path $source 'models\face_recognition_model-shard2'))) {
  throw 'Build SecureVerify first: its production models are missing.'
}
if (-not (Test-Path -LiteralPath (Join-Path $starlitRoot 'frontend\dist\index.html'))) {
  throw 'Build Starlit first.'
}
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $destination -Recurse -Force
Write-Host "Combined static artifact ready at $(Join-Path $starlitRoot 'frontend\dist'). No deployment performed."
