@echo off
cd /d "%~dp0"
py -3 app.py
if errorlevel 1 (
   echo App could not start. Run setup_windows.bat first.
   pause
)
