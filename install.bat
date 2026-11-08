@echo off
setlocal enabledelayedexpansion

:: typist-install.bat — Install Typist from GitHub releases (Windows)
:: Downloads a prebuilt binary — no compilation needed.
:: The launcher checks for updates on every run.

set "REPO=callenflynn/Typist"
set "INSTALL_DIR=%USERPROFILE%\.local\share\typist"
set "BIN_DIR=%USERPROFILE%\.local\bin"
set "APP_NAME=typist.exe"

echo ==> Typist installer (Windows)
echo    Install dir: %INSTALL_DIR%

:: -------------------------------------------------------------------------
:: 1. Install git (winget)
:: -------------------------------------------------------------------------
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo ==> Installing git via winget...
    winget install --id Git.Git -e --source winget
    if %errorlevel% neq 0 (
        echo Could not install git automatically. Install git from https://git-scm.com then re-run.
        pause
        exit /b 1
    )
    refreshenv
)
echo ==> git ready

:: -------------------------------------------------------------------------
:: 2. Install bun
:: -------------------------------------------------------------------------
where bun >nul 2>&1
if %errorlevel% neq 0 (
    echo ==> Installing bun...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://bun.sh/install.ps1 -useb | iex"
)
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
echo ==> bun ready

:: -------------------------------------------------------------------------
:: 3. Fetch latest release tag from GitHub API
:: -------------------------------------------------------------------------
echo ==> Checking latest release on GitHub...
powershell -NoProfile -Command "& { $r = Invoke-RestMethod -Uri 'https://api.github.com/repos/callenflynn/Typist/releases/latest'; $r.tag_name }" > "%TEMP%\typist-latest-tag.txt" 2>nul
set /p LATEST_TAG=<"%TEMP%\typist-latest-tag.txt"
if "%LATEST_TAG%"=="" (
    echo Could not fetch latest release from GitHub. Check your network connection.
    pause
    exit /b 1
)
echo    Latest release: %LATEST_TAG%

:: -------------------------------------------------------------------------
:: 4. Download prebuilt binary
:: -------------------------------------------------------------------------
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

set "ASSET_URL=https://github.com/callenflynn/Typist/releases/download/%LATEST_TAG%/typist-windows.exe"
set "BINARY_PATH=%INSTALL_DIR%\typist.exe"

echo ==> Downloading typist-windows.exe...
powershell -NoProfile -Command "Invoke-WebRequest -Uri '%ASSET_URL%' -OutFile '%BINARY_PATH%'"

:: -------------------------------------------------------------------------
:: 5. Copy to bin dir
:: -------------------------------------------------------------------------
copy /y "%BINARY_PATH%" "%BIN_DIR%\%APP_NAME%"

:: -------------------------------------------------------------------------
:: 6. Write the update-checking launcher batch
:: -------------------------------------------------------------------------
set "LAUNCHER=%BIN_DIR%\typist-launch.bat"
(
    echo @echo off
    echo setlocal enabledelayedexpansion
    echo set "REPO=callenflynn/Typist"
    echo set "INSTALL_DIR=%INSTALL_DIR%"
    echo set "BIN_DIR=%BIN_DIR%"
    echo set "APP_NAME=typist.exe"
    echo set "CURRENT_VERSION_FILE=%%INSTALL_DIR%%\.version"
    echo.
    echo rem Read current version
    echo if exist "%%CURRENT_VERSION_FILE%%" (
    echo    set /p CURRENT_VERSION=<%%CURRENT_VERSION_FILE%%
    echo )
    echo.
    echo rem Fetch latest release tag
    echo powershell -NoProfile -Command "& { \$r = Invoke-RestMethod -Uri 'https://api.github.com/repos/callenflynn/Typist/releases/latest'; \$r.tag_name }" > "%%TEMP%%\typist-latest-tag.txt" 2^>nul
    echo set /p LATEST_TAG=<%%TEMP%%\typist-latest-tag.txt
    echo.
    echo rem If newer, download and replace
    echo if defined LATEST_TAG if not "%%LATEST_TAG%%"=="%%CURRENT_VERSION%%" (
    echo    echo ==> Typist update available: %%LATEST_TAG%% (current: %%CURRENT_VERSION%%)
    echo    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/callenflynn/Typist/releases/download/%%LATEST_TAG%%/typist-windows.exe' -OutFile '%%INSTALL_DIR%%\typist.exe'"
    echo    echo %%LATEST_TAG%% > "%%CURRENT_VERSION_FILE%%"
    echo    echo ==> Typist updated to %%LATEST_TAG%%
    echo )
    echo.
    echo start "" "%%INSTALL_DIR%%\typist.exe" %*
) > "%LAUNCHER%"

:: Point the PATH copy at the launcher so updates run on every launch
copy /y "%LAUNCHER%" "%BIN_DIR%\%APP_NAME%"

:: -------------------------------------------------------------------------
:: 7. Record installed version
:: -------------------------------------------------------------------------
echo %LATEST_TAG% > "%INSTALL_DIR%\.version"

echo.
echo ==> Install complete.
echo    Launch Typist via: typist
echo    Each launch checks GitHub and auto-updates if a new release exists.
pause
