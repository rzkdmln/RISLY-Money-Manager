@echo off
setlocal
cd /d "%~dp0"
echo.
echo   RISLY Money Manager
echo   Membuka http://127.0.0.1:8080
echo   Tekan Ctrl+C untuk menghentikan server.
echo.
start "" "http://127.0.0.1:8080/"
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8080 --bind 127.0.0.1
) else (
  py -m http.server 8080 --bind 127.0.0.1
)
echo.
echo Server berhenti. Tekan tombol apa saja untuk menutup.
pause >nul
