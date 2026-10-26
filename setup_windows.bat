@echo off
cd /d "%~dp0"
py -3 -m pip install -r requirements.txt
if errorlevel 1 (
    echo Setup failed. Install Python 3.11+ from python.org and try again.
    pause
    exit /b 1
)
echo Dependencies installed. Use run_windows.bat from now on, including offline.
pause
