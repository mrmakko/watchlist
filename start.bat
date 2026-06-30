@echo off
REM Crypto Watchlist launcher (Windows). Double-click to run.
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install || goto :err
)

echo Building frontend...
call npm run build || goto :err

echo Starting server on http://localhost:3000 ...
start "" http://localhost:3000
call npm start
goto :eof

:err
echo.
echo Failed. See output above.
pause
