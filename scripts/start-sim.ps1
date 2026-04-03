# Windows PowerShell equivalent of scripts/start-sim.sh
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv = Join-Path $ScriptDir "..\RobotArm_Project\venv"
$Main = Join-Path $ScriptDir "..\RobotArm_Project\main.py"

if (-not (Test-Path $Venv)) {
    Write-Error "venv not found — run: npm run sim:setup"
    exit 1
}

& "$Venv\Scripts\Activate.ps1"
Write-Host "Starting robot simulator..."
python $Main
