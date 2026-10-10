#!/bin/bash

# Pindah ke direktori tempat script ini berada
cd "$(dirname "$0")"

echo "========================================================"
echo "Menjalankan VOC ML Server (MacOS)"
echo "========================================================"
echo ""

# Cek instalasi Node.js
if ! command -v node &> /dev/null; then
    echo "[!] Node.js tidak ditemukan. Silakan instal Node.js versi 22.x atau lebih baru."
    echo "    Kunjungi: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "[*] Ditemukan Node.js versi $NODE_VERSION"

# Memeriksa file .env
if [ ! -f .env ]; then
    echo "[*] Membuat file .env dengan konfigurasi default..."
    echo "VOCML_PORT=8080" > .env
    echo "PORT=8080" >> .env
    echo "ADMIN_USER=admin" >> .env
    echo "ADMIN_PASSWORD=vocml123" >> .env
fi

echo "[*] Menginstal dependensi (npm install)..."
npm install --omit=dev --no-fund --no-audit

# Muat variabel dari .env (aplikasi membaca process.env, tidak memakai dotenv)
set -a
. ./.env
set +a
PORT="${PORT:-${VOCML_PORT:-8080}}"
export PORT

# Hentikan server lama di port yang sama agar kode terbaru yang berjalan
OLD_PID=$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)
if [ -n "$OLD_PID" ]; then
    echo "[*] Menghentikan server lama di port $PORT (PID $OLD_PID)..."
    kill $OLD_PID 2>/dev/null
    sleep 1
fi

echo ""
echo "[*] Menjalankan Server..."
echo "[*] Aplikasi dapat diakses di: http://localhost:$PORT"
echo "[*] Setelah update kode, refresh browser dengan Cmd+Shift+R."
echo "========================================================"
npm start
