@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20 or newer, then run this launcher again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8080 on this computer after the server starts.
echo T - Phone tilt using an HTTPS tunnel ^(requires cloudflared^)
echo L - Phone tilt on the same network ^(see README for certificate setup^)
echo K - Keyboard or same-network phone pedals
choice /C TLK /N /M "Choose T, L, or K: "
if errorlevel 3 goto keyboard
if errorlevel 2 goto local
if errorlevel 1 goto tunnel
exit /b 1
:tunnel
node server.js --tunnel
goto done
:local
node server.js --lan-https
goto done
:keyboard
node server.js
:done
pause
