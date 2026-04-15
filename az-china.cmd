@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
if not defined AZURE_CONFIG_DIR set "AZURE_CONFIG_DIR=%SCRIPT_DIR%.azure-china"

if not exist "%AZURE_CONFIG_DIR%" (
    mkdir "%AZURE_CONFIG_DIR%" >nul 2>nul
)

set "ACTIVE_CLOUD="
for /f "delims=" %%i in ('az cloud show --query name -o tsv 2^>nul') do set "ACTIVE_CLOUD=%%i"

if /I not "%ACTIVE_CLOUD%"=="AzureChinaCloud" (
    call az cloud set --name AzureChinaCloud >nul
    if errorlevel 1 exit /b %errorlevel%
)

call az config set core.enable_broker_on_windows=false --only-show-errors >nul 2>nul
if errorlevel 1 exit /b %errorlevel%

if "%~1"=="" (
    call az account show -o json
    exit /b %errorlevel%
)

call az %*
exit /b %errorlevel%
