@echo off
title Update VOC ML
echo ========================================================
echo Update Otomatis VOC ML dari GitHub
echo ========================================================
echo.

:: SILAKAN GANTI TULISAN DI BAWAH INI DENGAN TOKEN GITHUB ANDA
set GITHUB_TOKEN=MASUKKAN_TOKEN_GITHUB_ANDA_DISINI
set REPO_URL=https://%GITHUB_TOKEN%@github.com/Tirta7/VOCML.git

echo Mengatur URL akses token...
git remote set-url origin %REPO_URL%

echo Menarik kodingan terbaru dari GitHub...
git pull
if %errorlevel% neq 0 (
    echo [X] Gagal mendownload update! Pastikan Token GitHub Anda benar dan memiliki akses 'repo'.
    pause
    exit /b
)

echo.
echo Membangun ulang dan me-restart container Docker...
docker-compose up -d --build

echo.
echo [*] Merapikan folder (Menyembunyikan file kodingan agar rapi)...
attrib +h * /d >nul 2>&1
attrib -h *.bat >nul 2>&1
attrib -h .env >nul 2>&1
echo [*] Folder sudah dirapikan!

echo.
echo ========================================================
echo [V] Update Selesai!
echo Aplikasi versi terbaru sudah berjalan.
echo ========================================================
pause
