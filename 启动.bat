@echo off
setlocal
title Stadium Viewer - local server
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8088"

echo.
echo   Folder : %CD%
echo   Local  : http://localhost:%PORT%/
echo   LAN    : http://YOUR-LAN-IP:%PORT%/
echo.
echo   Press Ctrl+C in this window to stop the server.
echo.

start "" "http://localhost:%PORT%/"
python -m http.server %PORT% --bind 0.0.0.0
pause
