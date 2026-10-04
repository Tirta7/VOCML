@echo off
title Installasi VOC ML
cd /d "%~dp0"

echo ========================================================
echo Pemasangan Otomatis VOC ML (License Management System)
echo ========================================================
echo.

:: SILAKAN GANTI TULISAN DI BAWAH INI DENGAN TOKEN GITHUB ANDA
set GITHUB_TOKEN=MASUKKAN_TOKEN_GITHUB_ANDA_DISINI
set REPO_URL=https://%GITHUB_TOKEN%@github.com/Tirta7/VOCML.git

echo [*] Memeriksa Git...
set GIT_CMD=git
git --version >nul 2>&1
if errorlevel 1 (
    if exist "C:\Program Files\Git\cmd\git.exe" (
        set GIT_CMD="C:\Program Files\Git\cmd\git.exe"
    ) else (
        echo [!] Git belum terinstal. Menginstal Git...
        winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
        if errorlevel 1 (
            echo [X] Gagal menginstal Git. Silakan instal manual.
            pause
            exit /b
        )
        set GIT_CMD="C:\Program Files\Git\cmd\git.exe"
    )
)
echo [*] Git siap.

echo.
echo [*] Memeriksa Kodingan VOC ML...
if not exist "docker-compose.yml" (
    echo [*] Mendownload kodingan dari GitHub...
    %GIT_CMD% init
    %GIT_CMD% remote add origin %REPO_URL%
    %GIT_CMD% fetch
    %GIT_CMD% reset --hard origin/main
    %GIT_CMD% branch -M main
    %GIT_CMD% branch --set-upstream-to=origin/main main
    if errorlevel 1 (
        echo [X] Gagal mendownload! Pastikan Token GitHub Anda benar.
        pause
        exit /b
    )
) else (
    echo [*] Kodingan sudah ada, mengecek update...
    %GIT_CMD% remote set-url origin %REPO_URL%
    %GIT_CMD% pull
)

echo.
echo [*] Memeriksa file .env...
if not exist ".env" (
    echo VOCML_PORT=8080 > .env
    echo [*] File .env dibuat.
)

echo.
echo [*] Membangun dan Menjalankan Docker...
:: Coba perintah docker compose versi baru (V2) dulu, lalu versi lama (V1)
docker compose version >nul 2>&1
if not errorlevel 1 (
    docker compose up -d --build
) else (
    docker-compose up -d --build
)

if errorlevel 1 (
    echo.
    echo [X] GAGAL MENJALANKAN DOCKER!
    echo Penyebab yang sering terjadi:
    echo 1. Aplikasi Docker Desktop di PC Anda belum dibuka/menyala.
    echo 2. Proses instalasi Docker belum selesai (butuh restart PC).
    echo.
    echo Silakan buka aplikasi Docker Desktop di PC Anda, tunggu sampai icon-nya berwarna hijau (running), lalu jalankan script ini lagi.
    pause
    exit /b
)

echo.
echo [*] Merapikan folder (Menyembunyikan file kodingan agar rapi)...
attrib +h * /d >nul 2>&1
attrib -h *.bat >nul 2>&1
attrib -h .env >nul 2>&1
echo [*] Folder sudah dirapikan!

echo.
echo ========================================================
echo [V] Proses Instalasi Selesai!
echo Aplikasi berjalan di: http://localhost:8080
echo ========================================================
pause
