# Run a command on the GCP VM cover-a100 with Windows OpenSSH (no PuTTY windows), like ml/tunnel.ps1.
param([string]$Cmd)
$ip = (Get-Content "$PSScriptRoot\vm-ip.txt" | Select-Object -First 1).Trim()
$ssh = "$env:WINDIR\System32\OpenSSH\ssh.exe"
& $ssh -i "$env:USERPROFILE\.ssh\google_compute_engine" -o "UserKnownHostsFile=$env:USERPROFILE\.ssh\google_compute_known_hosts" -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ServerAliveInterval=30 "gino@$ip" $Cmd
