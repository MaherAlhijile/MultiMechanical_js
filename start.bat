@echo off
REM =========================================
REM Batch file to start dispatcher, frontend, and GUI tests
REM =========================================

REM 1. Start dispatcher/src
start cmd /k "cd dispatcher\src && (
    for /f "tokens=2 delims==" %%a in ('findstr PORT .env') do set PORT=%%a
    echo Using port %PORT%
    netstat -ano | findstr :%PORT% >nul
    if %errorlevel%==0 (
        for /f "tokens=5" %%p in ('netstat -ano ^| findstr :%PORT%') do taskkill /PID %%p /F
    )
    node app.js
)"

REM 2. Start frontend
start cmd /k "cd frontend && npm start"


echo All processes started.
