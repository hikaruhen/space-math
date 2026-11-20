@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 LTS from https://nodejs.org/
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo Please run npm ci --legacy-peer-deps and npm run build first.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:4173/space-math/"
node scripts/serve-preview.mjs
pause
