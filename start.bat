@echo off
rem Double-click to run OneNote Clone. Opens the app in your browser; close this window
rem (or press Ctrl+C) to stop it. Your notes are saved in the data\ folder either way.
setlocal EnableDelayedExpansion
if "%~1"==":openwhenready" goto openwhenready

rem Absolute path, so a copy of this file works from anywhere (e.g. the Desktop).
set "APP_DIR=D:\CODING\New Projects\27_OneNoteClone"
if not exist "%APP_DIR%\server\index.js" (
  echo OneNote Clone was not found at %APP_DIR%
  echo If you moved the project, update APP_DIR at the top of this file.
  pause
  exit /b 1
)
cd /d "%APP_DIR%"
title OneNote Clone

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node 22.13 or newer from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo First run: installing dependencies...
  call npm install --omit=dev
  if errorlevel 1 (
    echo npm install failed. See the messages above.
    pause
    exit /b 1
  )
)

set "CURL=%SystemRoot%\System32\curl.exe"
if not defined PORT set "PORT=3000"

rem Find a free port. If the app itself is already running on one, just open it.
rem (Port 3000 is often taken by VS Code's Live Preview.)
for /l %%i in (1,1,10) do (
  netstat -ano | findstr /r /c:"127.0.0.1:!PORT! .*LISTENING" /c:"0.0.0.0:!PORT! .*LISTENING" /c:"\[::\]:!PORT! .*LISTENING" >nul
  if errorlevel 1 goto haveport
  "%CURL%" -s -f -o nul --max-time 2 "http://127.0.0.1:!PORT!/api/notebooks"
  if not errorlevel 1 (
    echo OneNote Clone is already running at http://127.0.0.1:!PORT!
    start "" "http://127.0.0.1:!PORT!"
    timeout /t 3 >nul
    exit /b 0
  )
  echo Port !PORT! is used by another program, trying the next one...
  set /a PORT+=1
)
echo Could not find a free port between 3000 and %PORT%.
pause
exit /b 1

:haveport
echo Starting OneNote Clone on http://127.0.0.1:%PORT%  (close this window to stop it)
echo.
start "" /b cmd /c call "%~f0" :openwhenready %PORT%
node server\index.js
if errorlevel 1 pause
exit /b

rem Runs in the background: waits until the server answers, then opens the browser.
:openwhenready
set "CURL=%SystemRoot%\System32\curl.exe"
for /l %%i in (1,1,30) do (
  "%CURL%" -s -f -o nul --max-time 1 "http://127.0.0.1:%~2/api/notebooks"
  if not errorlevel 1 (
    start "" "http://127.0.0.1:%~2"
    exit /b 0
  )
  timeout /t 1 >nul
)
exit /b 1
