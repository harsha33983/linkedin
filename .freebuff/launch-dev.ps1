[DateTime]::Now.ToString('HH:mm:ss.fff')
$p = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput 'C:\Users\Harsha\Music\linked in\.freebuff\preview-63212bae-5ba0-4285-b15e-8de04a6a30fc.log' -RedirectStandardError 'C:\Users\Harsha\Music\linked in\.freebuff\preview-63212bae-5ba0-4285-b15e-8de04a6a30fc.log.err' -WindowStyle Hidden -PassThru
$pidVar = $p.Id
Write-Host ('LAUNCHED PID={0}' -f $pidVar)
Start-Sleep -Seconds 22
try {
  $check = Get-Process -Id $pidVar -ErrorAction Stop
  Write-Host ('AFTER 22s: PID={0} ALIVE' -f $check.Id)
} catch {
  Write-Host 'AFTER 22s: PID gone - launch failed'
}
