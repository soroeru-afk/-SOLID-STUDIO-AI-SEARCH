@echo off
title SOLID STUDIO AI SEARCH ビルド
chcp 65001 > nul
cd /d "%~dp0"

if exist "C:\Users\soroe\node-v22.13.1-win-x64" (
    set "PATH=C:\Users\soroe\node-v22.13.1-win-x64;%PATH%"
)

echo ===================================================
echo   SOLID STUDIO AI SEARCH - 本番用ビルド実行
echo ===================================================
echo.
echo アプリケーションをビルドしています...
echo.

cmd /c npm run build
if exist dist\index.html (
    echo.
    echo ビルド成功。Run_AI_Search.html を更新しています...
    copy /y dist\index.html Run_AI_Search.html
)

pause
