@echo off
echo ============================================
echo  Payslip Feature Setup and Test
echo ============================================
echo.

:menu
echo 1. Insert Mock Data into Database
echo 2. Test API Endpoints
echo 3. Run Both (Insert Data + Test API)
echo 4. Exit
echo.
set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" goto insert_data
if "%choice%"=="2" goto test_api
if "%choice%"=="3" goto run_both
if "%choice%"=="4" goto end

echo Invalid choice! Please try again.
goto menu

:insert_data
echo.
echo Inserting mock data into database...
echo.
mysql -u root -p workzen_hrms < PAYSLIP_MOCK_DATA_FIXED.sql
echo.
echo Done! Press any key to return to menu...
pause >nul
goto menu

:test_api
echo.
echo Testing API endpoints...
echo.
powershell -ExecutionPolicy Bypass -File test-payslip-api.ps1
echo.
echo Done! Press any key to return to menu...
pause >nul
goto menu

:run_both
echo.
echo Step 1: Inserting mock data...
echo.
mysql -u root -p workzen_hrms < PAYSLIP_MOCK_DATA_FIXED.sql
echo.
echo Step 2: Testing API endpoints...
echo.
powershell -ExecutionPolicy Bypass -File test-payslip-api.ps1
echo.
echo Done! Press any key to return to menu...
pause >nul
goto menu

:end
echo.
echo Exiting...
exit
