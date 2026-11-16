@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

echo.
echo  ===============================================
echo   Kaned - cai dat va khoi dong
echo  ===============================================
echo.

if not exist "apps\api\.env" (
  echo  [!] Thieu apps\api\.env
  echo      Copy apps\api\.env.example thanh apps\api\.env
  echo      roi dien DATABASE_URL truoc khi chay lai.
  goto :fail
)
if not exist "apps\web\.env" copy "apps\web\.env.example" "apps\web\.env" >nul

rem Always install: after a git pull the dependencies may have changed.
rem When nothing changed this takes a few seconds.
echo  [1/4] Cai / cap nhat dependencies...
call npm install --no-audit --no-fund || goto :fail

echo  [2/4] Build goi dung chung...
call npm run build:shared || goto :fail

echo  [3/4] Tao bang trong database...
call npm run db:migrate || goto :fail

echo  [4/4] Nap du lieu mau...
call npm run db:seed || goto :fail

echo.
echo  ===============================================
echo   Xong. Dang khoi dong API va web...
echo.
echo   Web : http://localhost:5173
echo   API : http://localhost:4000/health
echo   Sinh vien : ngoc.tb@fpt.edu.vn / kaned2026
echo   Quan tri  : admin@kaned.vn / kaned2026  (vao /admin)
echo  ===============================================
echo.
call npm run dev
goto :end

:fail
echo.
echo  !! Co loi o buoc tren - doc thong bao ngay phia tren dong nay.
echo     Loi hay gap nhat la DATABASE_URL trong apps\api\.env chua dung.
echo.

:end
pause
