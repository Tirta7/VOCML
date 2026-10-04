<#
  VOC ML - Generator Machine ID (dijalankan di Windows HOST, bukan di dalam Docker)

  Machine ID dibuat dari UUID sistem + serial motherboard + serial disk utama,
  lalu di-hash SHA-256 menjadi format MID-XXXX-XXXX-XXXX.

  Pemakaian di file .bat installer:
    powershell -NoProfile -ExecutionPolicy Bypass -File get-machine-id.ps1 -EnvFile "C:\posapp\.env"

  Hasilnya baris VOCML_MACHINE_ID=MID-.... ditulis/diperbarui di file .env,
  lalu docker-compose aplikasi POS meneruskannya ke container sebagai env variable.
#>
param(
  [string]$EnvFile = ""
)

$ErrorActionPreference = "SilentlyContinue"

$uuid  = (Get-CimInstance Win32_ComputerSystemProduct).UUID
$board = (Get-CimInstance Win32_BaseBoard).SerialNumber
$disk  = (Get-CimInstance Win32_DiskDrive | Sort-Object Index | Select-Object -First 1).SerialNumber

$raw = ("{0}|{1}|{2}" -f $uuid, $board, $disk).Trim().ToUpper()
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($raw))
$hex = ($hash | ForEach-Object { $_.ToString("X2") }) -join ""
$mid = "MID-{0}-{1}-{2}" -f $hex.Substring(0, 4), $hex.Substring(4, 4), $hex.Substring(8, 4)

if ($EnvFile -ne "") {
  $lines = @()
  if (Test-Path $EnvFile) {
    $lines = Get-Content $EnvFile | Where-Object { $_ -notmatch '^VOCML_MACHINE_ID=' }
  }
  $lines += "VOCML_MACHINE_ID=$mid"
  Set-Content -Path $EnvFile -Value $lines -Encoding ASCII
}

Write-Output $mid
