# Restarts the Scrapling scraper service in live mode (SCRAPER_MODE=scrapling) detached.
# Usage: powershell -NoProfile -File .freebuff/restart-scraper.ps1
$ErrorActionPreference = 'Continue'
$port = 8100
$log = 'C:\Users\Harsha\Music\linked in\.freebuff\scraper-live.log'
$err = "$log.err"
$svc = 'C:\Users\Harsha\Music\linked in\scraper-service'

# 1. Kill any existing listener on the port
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Stop-Process -Id $conn.OwningProcess -Force
  Write-Host ('KILLED OLD PID=' + $conn.OwningProcess)
  Start-Sleep -Seconds 1
} else {
  Write-Host 'NO OLD LISTENER'
}

# 2. Launch the new service in live Scrapling mode
$env:SCRAPER_MODE = 'scrapling'
$p = Start-Process -FilePath 'python' `
  -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8100' `
  -WorkingDirectory $svc `
  -RedirectStandardOutput $log -RedirectStandardError $err `
  -WindowStyle Hidden -PassThru

Write-Host ('LAUNCHED PID=' + $p.Id)
Start-Sleep -Seconds 5

try {
  $check = Get-Process -Id $p.Id -ErrorAction Stop
  Write-Host ('AFTER 5s: PID=' + $check.Id + ' ALIVE')
} catch {
  Write-Host 'AFTER 5s: PID GONE - launch failed, see log'
}
