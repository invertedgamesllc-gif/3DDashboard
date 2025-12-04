@echo off
echo ========================================
echo Deploying Authentication System
echo ========================================
echo.

echo Step 1: Checking wrangler login status...
call npx wrangler whoami
if %errorlevel% neq 0 (
    echo.
    echo You need to login to Cloudflare first.
    echo Running: npx wrangler login
    call npx wrangler login
)

echo.
echo Step 2: Deploying database schema updates...
call npx wrangler d1 execute etsy-3d-print-db --remote --file=schema.sql
if %errorlevel% neq 0 (
    echo Failed to deploy schema. Please check the error above.
    pause
    exit /b 1
)

echo.
echo Step 3: Deploying worker with authentication...
call npx wrangler deploy
if %errorlevel% neq 0 (
    echo Failed to deploy worker. Please check the error above.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Deployment Complete!
echo ========================================
echo.
echo Your 3D Print Manager now has:
echo - User authentication (login/logout)
echo - Admin user management
echo - Activity logging for quotes
echo.
echo First time? Open the app and you'll see
echo the Initial Setup screen to create your
echo admin account.
echo.
pause
