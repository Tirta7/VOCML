@echo off
title Setup Cloudflare Tunnel
echo ========================================================
echo Setup Cloudflare Tunnel (Tanpa Kartu Kredit)
echo ========================================================
echo.

echo [1/5] Mengunduh program Cloudflared CLI...
if not exist "cloudflared.exe" (
    curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)

echo.
echo [2/5] Login ke Cloudflare (Browser akan terbuka)...
echo PENTING: Silakan pilih domain vocpos.id di browser Anda dan klik "Authorize".
cloudflared.exe tunnel login

echo.
echo [3/5] Membuat Tunnel bernama "vocml-tunnel"...
cloudflared.exe tunnel create vocml-tunnel

echo.
echo [4/5] Mengarahkan subdomain vocml.vocpos.id ke Tunnel ini...
cloudflared.exe tunnel route dns vocml-tunnel vocml.vocpos.id

echo.
echo [5/5] Merakit file konfigurasi untuk Docker...
:: Mengambil nama file JSON kredensial yang baru saja dibuat
for /f "delims=" %%i in ('dir /b /od "%USERPROFILE%\.cloudflared\*.json"') do set CF_JSON=%%i

echo tunnel: vocml-tunnel > "%USERPROFILE%\.cloudflared\config.yml"
echo credentials-file: /home/nonroot/.cloudflared/%CF_JSON% >> "%USERPROFILE%\.cloudflared\config.yml"
echo ingress: >> "%USERPROFILE%\.cloudflared\config.yml"
echo   - hostname: vocml.vocpos.id >> "%USERPROFILE%\.cloudflared\config.yml"
echo     service: http://vocml:8080 >> "%USERPROFILE%\.cloudflared\config.yml"
echo   - service: http_status:404 >> "%USERPROFILE%\.cloudflared\config.yml"

echo.
echo ========================================================
echo [V] Setup Cloudflare Tunnel Berhasil!
echo Anda sekarang bisa menjalankan file INSTALL.bat atau UPDATE.bat
echo ========================================================
pause
