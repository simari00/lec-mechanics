@echo off
setlocal

rem ============================================
rem  LEC Mechanics - one-click dev server
rem  Builds the SQLite database if missing, then
rem  starts the PHP server at http://127.0.0.1:8000
rem ============================================

set "PROJECT=%~dp0"
set "PORT=8000"

rem --- Locate PHP (PATH first, then the winget install) ---
set "PHP=php"
where php >nul 2>&1
if %errorlevel%==0 goto :havephp

set "PHP=%LOCALAPPDATA%\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe"
if exist "%PHP%" goto :havephp

echo [ERROR] PHP was not found on this computer.
echo         Install it with:  winget install PHP.PHP.8.3
echo.
pause
exit /b 1

:havephp

rem --- Build the SQLite database if it does not exist yet ---
if exist "%PROJECT%backend\lec_mechanics.sqlite" goto :databaseok

echo Building SQLite database...
"%PHP%" "%PROJECT%backend\init_sqlite.php"
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build the database. See message above.
    echo.
    pause
    exit /b 1
)
echo.

:databaseok

rem --- If the port is already serving, just open the browser ---
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo Server is already running at http://127.0.0.1:%PORT%
    start "" "http://127.0.0.1:%PORT%/"
    timeout /t 3 >nul
    exit /b 0
)

echo Starting LEC Mechanics at http://127.0.0.1:%PORT% ...
echo (close this window to stop the server)
echo.

rem Open the browser once the server has had a moment to boot
start "" cmd /c "timeout /t 2 >nul & start "" http://127.0.0.1:%PORT%/"

"%PHP%" -S 127.0.0.1:%PORT% -t "%PROJECT%"
