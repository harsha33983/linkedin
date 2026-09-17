# Starts the scraper service detached. Mode comes from scraper-service/.env
# (SCRAPER_MODE=scrapegraphai-cloud with SGAI_API_KEY, or mock).
# Usage: powershell -NoProfile -File .freebuff/launch-scraper.ps1
$log = Join-Path $PSScriptRoot "scraper-service.log"
$err = "$log.err"
$py = "python"
$argList = @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8100')
$p = Start-Process -FilePath $py -ArgumentList $argList -WorkingDirectory (Join-Path $PSScriptRoot "..\scraper-service") -RedirectStandardOutput $log -RedirectStandardError $err -WindowStyle Hidden -PassThru
Write-Output "SCRAPER_PID=$($p.Id)"
