@echo off
setlocal EnableDelayedExpansion
title Setup - GitHub Pages

echo.
echo ==========================================
echo   Auto Deploy to GitHub Pages
echo ==========================================
echo.

:: Get GitHub username automatically
for /f "tokens=*" %%U in ('gh api user --jq .login 2^>nul') do set GH_USER=%%U
if "!GH_USER!"=="" (
    echo [LOI] Chua dang nhap GitHub CLI
    echo Chay lenh: gh auth login
    pause
    exit /b 1
)
echo [OK] GitHub user: !GH_USER!

:: Use current folder name as repo name
for %%I in (.) do set REPO_NAME=%%~nxI
echo [OK] Repo name: !REPO_NAME!

:: Check Git
git --version >nul 2>&1
if errorlevel 1 (
    echo [LOI] Git chua cai dat - tai tai https://git-scm.com
    pause
    exit /b 1
)
echo [OK] Git san sang

echo.
echo ------------------------------------------
echo  Git init + commit
echo ------------------------------------------

if exist ".git" (
    echo [OK] Da co git repo, bo qua init
) else (
    git init -q
    echo [OK] Git init
)

git add .
git commit -q -m "deploy: initial commit"
echo [OK] Commit xong

echo.
echo ------------------------------------------
echo  Tao GitHub repo va push
echo ------------------------------------------

gh repo create !GH_USER!/!REPO_NAME! --public --source=. --remote=origin --push 2>nul
if errorlevel 1 (
    echo [!] Repo co the da ton tai, thu push...
    git remote remove origin 2>nul
    git remote add origin https://github.com/!GH_USER!/!REPO_NAME!.git
    git branch -M main
    git push -u origin main
    if errorlevel 1 (
        echo [LOI] Push that bai
        pause
        exit /b 1
    )
)
echo [OK] Push len GitHub thanh cong

echo.
echo ------------------------------------------
echo  Bat GitHub Pages
echo ------------------------------------------

gh api repos/!GH_USER!/!REPO_NAME!/pages --method POST --field source[branch]=main --field source[path]=/ >nul 2>&1
if errorlevel 1 (
    echo [!] Pages co the da bat roi, bo qua
) else (
    echo [OK] GitHub Pages da bat
)

echo.
echo ==========================================
echo   XONG!
echo ==========================================
echo.
echo   URL: https://!GH_USER!.github.io/!REPO_NAME!
echo.
echo   (mat 1-3 phut de GitHub build lan dau)
echo ==========================================
echo.

start "" "https://!GH_USER!.github.io/!REPO_NAME!"

pause
