# PowerShell script to setup Time Off tables
# Run this script: .\setup-timeoff-db.ps1

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Time Off Database Setup" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# MySQL credentials (update if different)
$mysqlUser = "root"
$mysqlDatabase = "workzen_hrms"

Write-Host "Enter MySQL password for user '$mysqlUser': " -NoNewline -ForegroundColor Yellow
$mysqlPassword = Read-Host -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($mysqlPassword))

Write-Host ""
Write-Host "Creating tables..." -ForegroundColor Green

# SQL commands
$sql = @"
USE workzen_hrms;

CREATE TABLE IF NOT EXISTS leave_balances (
    balance_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    paid_time_off_balance DECIMAL(5,2) DEFAULT 24.00,
    sick_time_off_balance DECIMAL(5,2) DEFAULT 7.00,
    year INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_year (user_id, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_requests (
    request_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    employee_name VARCHAR(255),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    leave_type ENUM('Paid time Off', 'Sick time off') NOT NULL,
    total_days DECIMAL(5,2) NOT NULL,
    reason TEXT,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    reviewed_by INT,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_leave_type (leave_type),
    INDEX idx_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW leave_requests_view AS
SELECT 
    lr.request_id,
    lr.user_id,
    COALESCE(lr.employee_name, CONCAT(ep.first_name, ' ', COALESCE(ep.last_name, ''))) as employee_name,
    ep.employee_code,
    ep.department,
    lr.start_date,
    lr.end_date,
    lr.leave_type,
    lr.total_days,
    lr.reason,
    lr.status,
    lr.reviewed_by,
    lr.reviewed_at,
    lr.created_at,
    CONCAT(rev_ep.first_name, ' ', COALESCE(rev_ep.last_name, '')) as reviewed_by_name
FROM leave_requests lr
LEFT JOIN employee_profiles ep ON lr.user_id = ep.user_id
LEFT JOIN users rev_u ON lr.reviewed_by = rev_u.user_id
LEFT JOIN employee_profiles rev_ep ON rev_u.user_id = rev_ep.user_id;

INSERT INTO leave_balances (user_id, paid_time_off_balance, sick_time_off_balance, year)
SELECT 
    user_id,
    24.00,
    7.00,
    YEAR(CURDATE())
FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM leave_balances 
    WHERE leave_balances.user_id = users.user_id 
    AND leave_balances.year = YEAR(CURDATE())
);

SELECT 'Setup Complete!' as Status;
"@

# Save SQL to temp file
$sqlFile = "$env:TEMP\timeoff_setup.sql"
$sql | Out-File -FilePath $sqlFile -Encoding UTF8

# Try to find mysql.exe
$mysqlPaths = @(
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe",
    "C:\xampp\mysql\bin\mysql.exe",
    "C:\wamp64\bin\mysql\mysql8.0.31\bin\mysql.exe"
)

$mysqlExe = $null
foreach ($path in $mysqlPaths) {
    if (Test-Path $path) {
        $mysqlExe = $path
        break
    }
}

if ($null -eq $mysqlExe) {
    Write-Host "ERROR: MySQL not found in common locations." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run the SQL manually in MySQL Workbench:" -ForegroundColor Yellow
    Write-Host "File location: $sqlFile" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or specify MySQL path and run:" -ForegroundColor Yellow
    Write-Host '"C:\Path\To\mysql.exe" -u root -p workzen_hrms < "$sqlFile"' -ForegroundColor Cyan
} else {
    Write-Host "Found MySQL at: $mysqlExe" -ForegroundColor Green
    Write-Host "Executing SQL..." -ForegroundColor Green
    
    & $mysqlExe -u $mysqlUser -p"$password" $mysqlDatabase -e "source $sqlFile"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ SUCCESS! Tables created successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Now refresh your browser at http://localhost:5173/timeoff" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "ERROR: Failed to execute SQL" -ForegroundColor Red
        Write-Host "Please run the SQL manually in MySQL Workbench" -ForegroundColor Yellow
        Write-Host "File: INSTALL_TIME_OFF.sql" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
