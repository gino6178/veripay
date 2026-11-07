# Keep cover-a100 (a spot VM) running while Done & Paid's GPU work lasts: every 60 s it asks GCP for the VM's status;
# when it was stopped (spot preemption), it starts it again (retrying while capacity is short) and runs
# ml/after_boot.sh there, which brings back the model endpoint and resumes every run from its checkpoints.
# ml/tunnel.ps1 reconnects the local forwards by itself. Stop this watcher (Stop-Process) when the GPU work is done,
# before stopping the VM, or it will start it again.
#   Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','D:\paypal\done\ml\vm_watch.ps1'
$log = "$env:TEMP\done-vmwatch.log"
function Say($m) { Add-Content $log "$(Get-Date -Format s) $m" }
while ($true) {
  $s = (& gcloud compute instances describe cover-a100 --zone us-central1-a --format="value(status)" 2>$null | Out-String).Trim()
  if (-not $s) {
    # no answer from gcloud: usually expired auth (gcloud auth login) or no network; say so every 10 minutes
    if (-not $lastWarn -or ((Get-Date) - $lastWarn).TotalMinutes -ge 10) { Say "gcloud gave no VM status (auth expired? run: gcloud auth login)"; $lastWarn = Get-Date }
  }
  if ($s -eq "TERMINATED" -or $s -eq "STOPPED") {
    Say "VM ${s}: starting"
    for ($i = 0; $i -lt 20; $i++) {
      & gcloud compute instances start cover-a100 --zone us-central1-a 2>&1 | Out-Null
      $s = (& gcloud compute instances describe cover-a100 --zone us-central1-a --format="value(status)" 2>$null | Out-String).Trim()
      if ($s -eq "RUNNING") { break }
      Start-Sleep -Seconds 45
    }
    Say "VM $s"
    if ($s -eq "RUNNING") {
      for ($i = 0; $i -lt 30; $i++) { $o = (& gcloud compute ssh cover-a100 --zone us-central1-a --command "echo UP" 2>$null | Out-String); if ($o -match "UP") { break }; Start-Sleep -Seconds 10 }
      & gcloud compute ssh cover-a100 --zone us-central1-a --command "cd ~/done; (setsid nohup bash ml/after_boot.sh > /tmp/after_boot.log 2>&1 < /dev/null &); echo launched" 2>&1 | Out-Null
      Say "after_boot launched"
    }
  }
  Start-Sleep -Seconds 60
}
