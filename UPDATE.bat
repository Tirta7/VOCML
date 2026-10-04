@echo off
title Update VOC ML
echo ========================================================
echo Update Otomatis VOC ML dari GitHub
echo ========================================================
echo.

echo Menarik kodingan terbaru dari GitHub...
git pull

echo.
echo Membangun ulang dan me-restart container Docker...
docker-compose up -d --build

echo.
echo ========================================================
echo [V] Update Selesai!
echo Aplikasi versi terbaru sudah berjalan di port yang sama.
echo ========================================================
pause
