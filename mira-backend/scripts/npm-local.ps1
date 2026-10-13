# Optional launcher for the project-local Node downloaded during implementation.
# After installing Node 24 normally, use npm commands directly instead.
$miraRoot = Split-Path -Parent $PSScriptRoot
$miraWorkspace = Split-Path -Parent $miraRoot
$miraNode = Join-Path $miraWorkspace '.tools\node_modules\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $miraNode)) { throw 'Install Node 24 and use npm directly; the optional local runtime was not found.' }
$miraNpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$miraNpmCli = Join-Path (Split-Path -Parent $miraNpmCommand) 'node_modules\npm\bin\npm-cli.js'
$miraPreviousPath = $env:PATH
try {
  $env:PATH = (Split-Path -Parent $miraNode) + [IO.Path]::PathSeparator + $miraPreviousPath
  & $miraNode $miraNpmCli @args
  exit $LASTEXITCODE
} finally { $env:PATH = $miraPreviousPath }
