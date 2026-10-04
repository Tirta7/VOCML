@echo off
title Installasi VOC ML
echo ========================================================
echo Pemasangan Otomatis VOC ML (License Management System)
echo ========================================================
echo.

:: SILAKAN GANTI TULISAN DI BAWAH INI DENGAN TOKEN GITHUB ANDA
set GITHUB_TOKEN=MASUKKAN_TOKEN_GITHUB_ANDA_DISINI
set REPO_URL=https://%GITHUB_TOKEN%@github.com/Tirta7/VOCML.git

echo Memeriksa Git...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Git belum terinstal. Menginstal Git...
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [X] Gagal menginstal Git. Silakan instal manual.
        pause
        exit /b
    )
)

echo.
echo Memeriksa Kodingan VOC ML...
if not exist "docker-compose.yml" (
    echo [*] Mendownload kodingan dari GitHub...
    git clone %REPO_URL% .
    if %errorlevel% neq 0 (
        echo [X] Gagal mendownload! Pastikan Token GitHub Anda benar dan memiliki akses 'repo'.
        pause
        exit /b
    )
) else (
    echo [*] Kodingan sudah ada, mengatur ulang URL token...
    git remote set-url origin %REPO_URL%
    git pull
)

echo.
echo Memeriksa Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Docker belum terinstal. Menginstal Docker Desktop via winget...
    winget install --id Docker.DockerDesktop -e --source winget --accept-package-agreements --accept-source-agreements
    echo [*] Docker berhasil diinstal. 
    echo [!] PENTING: Buka aplikasi Docker Desktop satu kali agar mesin Docker mulai berjalan.
    echo Setelah Docker berjalan, jalankan script ini lagi.
    pause
    exit /b
)

echo.
echo Memeriksa file pengaturan port (.env)...
if not exist ".env" (
    echo VOCML_PORT=8080 > .env
    echo [*] File .env dibuat (Port: 8080).
)

echo.
echo Membangun dan Menjalankan Aplikasi via Docker Compose...
docker-compose up -d --build

echo.
echo ========================================================
echo [V] Proses Instalasi Selesai!
echo Aplikasi akan terbuka di: http://localhost:8080
echo ========================================================
pause
