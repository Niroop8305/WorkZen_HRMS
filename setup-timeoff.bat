@echo off
echo ==========================================
echo Time Off Database Setup
echo ==========================================
echo.
echo This will create the required database tables.
echo Make sure MySQL is running!
echo.
pause

REM Try common MySQL locations
set MYSQL_PATH=
if exist "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" set MYSQL_PATH=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe
if exist "C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe" set MYSQL_PATH=C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe
if exist "C:\xampp\mysql\bin\mysql.exe" set MYSQL_PATH=C:\xampp\mysql\bin\mysql.exe
if exist "C:\wamp64\bin\mysql\mysql8.0.31\bin\mysql.exe" set MYSQL_PATH=C:\wamp64\bin\mysql\mysql8.0.31\bin\mysql.exe

if "%MYSQL_PATH%"=="" (
    echo ERROR: MySQL not found!
    echo.
    echo Please open MySQL Workbench and run: INSTALL_TIME_OFF.sql
    echo.
    pause
    exit /b 1
)

echo Found MySQL at: %MYSQL_PATH%
echo.
set /p MYSQL_PASS="Enter MySQL root password: "

echo.
echo Creating tables...
"%MYSQL_PATH%" -u root -p%MYSQL_PASS% workzen_hrms < INSTALL_TIME_OFF.sql

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS! Tables created!
    echo ========================================
    echo.
    echo Now refresh your browser at:
    echo http://localhost:5173/timeoff
    echo.
) else (
    echo.
    echo ERROR: Failed to create tables
    echo Please check your MySQL password and try again
    echo.
)

pause
