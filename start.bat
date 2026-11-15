@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo  Khoi dong Kaned... Web: http://localhost:5173
call npm run dev
pause
