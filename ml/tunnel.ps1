# Keep the SSH forwards to Done & Paid's model endpoint on cover-a100 alive: local 127.0.0.1:11471 and 11472 -> the
# VM's 127.0.0.1:11480 (ml/serve.mjs: done-audit, done-chat, done-vlm by model name). Every 20 s it asks
# http://127.0.0.1:11471/api/tags; if that fails it closes its own previous forward and opens a new one. Other
# tunnels (11460, 11470) are never touched.
# Uses Windows' own OpenSSH (ssh.exe, no window) with gcloud's key, not `gcloud compute ssh`, which opens PuTTY windows
# on Windows. The VM's address is looked up again on every reconnect (it changes when the VM is preempted).
#   Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-File','D:\paypal\done\ml\tunnel.ps1'
$gcloud = (Get-Command gcloud.cmd -ErrorAction SilentlyContinue).Source
if (-not $gcloud) { $gcloud = (Get-Command gcloud).Source }
$ssh = "$env:WINDIR\System32\OpenSSH\ssh.exe"
$key = "$env:USERPROFILE\.ssh\google_compute_engine"
$hosts = "$env:USERPROFILE\.ssh\google_compute_known_hosts"
$log = "$env:TEMP\done-tunnel.log"
while ($true) {
  $ok = $false
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 http://127.0.0.1:11471/api/tags; $ok = $r.StatusCode -eq 200 } catch { $ok = $false }
  if (-not $ok) {
    # only our own forwards: the ssh/putty/plink processes whose command line forwards 11471 to 11480
    Get-CimInstance Win32_Process -Filter "Name='ssh.exe' OR Name='putty.exe' OR Name='plink.exe'" | Where-Object { $_.CommandLine -match '11471:127\.0\.0\.1:11480' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    $ip = (& $gcloud compute instances describe cover-a100 --zone us-central1-a --format "value(networkInterfaces[0].accessConfigs[0].natIP)" 2>$null | Select-Object -First 1)
    if ($ip) {
      Start-Process -WindowStyle Hidden -FilePath $ssh -ArgumentList @('-i', $key, '-o', "UserKnownHostsFile=$hosts", '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ExitOnForwardFailure=yes', '-N', '-L', '11471:127.0.0.1:11480', '-L', '11472:127.0.0.1:11480', "$($env:USERNAME.ToLower())@$ip") | Out-Null
      Add-Content $log "$(Get-Date -Format s) forward (re)opened to $ip (11471 did not answer /api/tags)"
    } else {
      Add-Content $log "$(Get-Date -Format s) no address for cover-a100 (VM stopped, or gcloud auth expired)"
    }
    Start-Sleep -Seconds 15
  }
  Start-Sleep -Seconds 20
}
