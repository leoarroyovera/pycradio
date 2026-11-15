# Empaqueta y firma la app de TV: deja dist\PoesiaYCumbia.wgt
# Uso:   .\build.ps1                       (solo empaqueta)
#        .\build.ps1 -Install 192.168.1.50 (empaqueta e instala en la TV con esa IP)
param(
    [string]$Install = "",
    [string]$Profile = "Profile-TV"
)

$ErrorActionPreference = "Stop"
$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path $env:USERPROFILE ".tizen-extension-platform\server\sdktools\data\tools"
$tizen = Join-Path $tools "ide\bin\tizen.bat"
$sdb   = Join-Path $tools "sdb.exe"
if (-not (Test-Path $tizen)) { throw "No encontré tizen.bat en $tools (¿está instalada la extensión Tizen de VS Code?)" }

# Copia limpia, sin archivos de desarrollo
$stage = Join-Path $env:TEMP "pyc-tv-build"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory $stage | Out-Null
foreach ($item in "config.xml", "icon.png", "index.html", "css", "js", "fonts", "images") {
    Copy-Item -Recurse (Join-Path $here $item) $stage
}

& $tizen package -t wgt -s $Profile -- $stage
if ($LASTEXITCODE -ne 0) { throw "Falló el empaquetado" }

$dist = Join-Path $here "dist"
New-Item -ItemType Directory -Force $dist | Out-Null
$wgt = Get-ChildItem $stage -Filter *.wgt | Select-Object -First 1
$out = Join-Path $dist "PoesiaYCumbia.wgt"
Move-Item -Force $wgt.FullName $out
Write-Host "Listo: $out"

if ($Install) {
    & $sdb connect $Install
    $serial = "${Install}:26101"
    & $tizen install -s $serial -n $out
    & $tizen run -s $serial -p PeYwX5Y1V2.PYC
}
