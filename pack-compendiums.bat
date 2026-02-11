@echo off
echo Packing Dolmenwood Compendiums...
echo.

REM Adjust this path to your Foundry installation
set FOUNDRY_PATH=C:\Program Files\FoundryVTT\resources\app

REM Get the current directory (system path)
set SYSTEM_PATH=%~dp0

echo Foundry Path: %FOUNDRY_PATH%
echo System Path: %SYSTEM_PATH%
echo.

echo Packing Kindreds...
node "%FOUNDRY_PATH%\main.mjs" package workon dolmenwood --type System
node "%FOUNDRY_PATH%\main.mjs" package pack kindreds --in _source

echo.
echo Packing Classes...
node "%FOUNDRY_PATH%\main.mjs" package pack classes --in _source

echo.
echo Done! You can now use the compendiums in Foundry.
pause
