@echo off
title Installasi VOC ML
echo ========================================================
echo Pemasangan Otomatis VOC ML (License Management System)
echo ========================================================
echo.

echo Memeriksa Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Docker belum terinstal. Menginstal Docker Desktop via winget...
    winget install --id Docker.DockerDesktop -e --source winget --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [X] Gagal menginstal Docker otomatis. 
        echo Silakan download dan instal manual dari: https://www.docker.com/products/docker-desktop
        pause
        exit /b
    )
    echo [*] Docker berhasil diinstal. 
    echo [!] PENTING: Anda harus me-restart komputer atau membuka aplikasi Docker Desktop secara manual satu kali agar mesin Docker mulai berjalan.
    echo Setelah Docker Desktop berjalan, silakan jalankan script INSTALL.bat ini lagi.
    pause
    exit /b
) else (
    echo [*] Docker sudah terinstal dan siap digunakan.
)

echo.
echo Memeriksa file pengaturan port (.env)...
if not exist ".env" (
    echo VOCML_PORT=8080 > .env
    echo [*] File .env dibuat (Port: 8080).
) else (
    echo [*] File .env sudah ada.
)

echo.
echo Membangun dan Menjalankan Aplikasi via Docker Compose...
docker-compose up -d --build

echo.
echo ========================================================
echo [V] Proses Instalasi Selesai!
echo Jika baru pertama kali, tunggu sekitar 1-2 menit agar Docker selesai men-download bahan.
echo Aplikasi akan terbuka di: http://localhost:8080
echo ========================================================
pause
