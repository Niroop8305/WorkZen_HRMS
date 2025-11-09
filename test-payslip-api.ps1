# PowerShell Test Script for Payslip API
# Run this after executing PAYSLIP_MOCK_DATA_FIXED.sql

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Payslip API Test Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:5000/api"

# Test 1: Get all employees
Write-Host "Test 1: Getting all employees..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/employees" -Method Get
    Write-Host "✓ Success! Found $($response.count) employees" -ForegroundColor Green
    $response.employees | Format-Table -Property id, name, emp_id, basic_salary
} catch {
    Write-Host "✗ Failed: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: Get available months
Write-Host "Test 2: Getting available months..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/employees/months" -Method Get
    Write-Host "✓ Success! Found $($response.count) months with data" -ForegroundColor Green
    $response.months | Format-Table -Property month, year, employee_count
} catch {
    Write-Host "✗ Failed: $_" -ForegroundColor Red
}

Write-Host ""

# Test 3: Get attendance for employee 1, October 2025
Write-Host "Test 3: Getting attendance for Employee 1 (October 2025)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/employees/1/attendance?month=October&year=2025" -Method Get
    Write-Host "✓ Success!" -ForegroundColor Green
    $response.attendance | Format-List
} catch {
    Write-Host "✗ Failed: $_" -ForegroundColor Red
}

Write-Host ""

# Test 4: Create draft payslip
Write-Host "Test 4: Creating draft payslip for Employee 1 (October 2025)..." -ForegroundColor Yellow
try {
    $body = @{
        emp_id = 1
        month = "October"
        year = 2025
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/payslip/new" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✓ Success! Created payslip ID: $($response.payslip.id)" -ForegroundColor Green
    $payslipId = $response.payslip.id
} catch {
    Write-Host "✗ Failed: $_" -ForegroundColor Red
    $payslipId = $null
}

Write-Host ""

# Test 5: Compute salary
Write-Host "Test 5: Computing salary for Employee 1 (October 2025)..." -ForegroundColor Yellow
try {
    $body = @{
        emp_id = 1
        month = "October"
        year = 2025
        present_days = 22
        paid_leaves = 2
        unpaid_leaves = 0
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/payslip/compute" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✓ Success!" -ForegroundColor Green
    Write-Host "  Earned Salary: ₹$($response.computation.earned_salary)" -ForegroundColor White
    Write-Host "  Gross Salary: ₹$($response.computation.gross_salary)" -ForegroundColor White
    Write-Host "  Total Deductions: ₹$($response.computation.total_deductions)" -ForegroundColor White
    Write-Host "  Net Salary: ₹$($response.computation.net_salary)" -ForegroundColor Cyan
} catch {
    Write-Host "✗ Failed: $_" -ForegroundColor Red
}

Write-Host ""

# Test 6: Generate payrun for October 2025
Write-Host "Test 6: Generating payrun for all employees (October 2025)..." -ForegroundColor Yellow
try {
    $body = @{
        month = "October"
        year = 2025
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/payrun/generate" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✓ Success!" -ForegroundColor Green
    Write-Host "  Payrun ID: $($response.payrun.id)" -ForegroundColor White
    Write-Host "  Total Employees: $($response.payrun.total_employees)" -ForegroundColor White
    Write-Host "  Total Cost: ₹$($response.payrun.total_cost)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Generated Payslips:" -ForegroundColor White
    $response.payslips | Format-Table -Property employee_name, employee_id, net_salary, status
} catch {
    Write-Host "✗ Failed: $_" -ForegroundColor Red
}

Write-Host ""

# Test 7: Get all payslips
Write-Host "Test 7: Getting all payslips..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/payslip/" -Method Get
    Write-Host "✓ Success! Found $($response.count) payslips" -ForegroundColor Green
    $response.payslips | Select-Object -First 5 | Format-Table -Property id, employee_name, month, year, net_salary, status
} catch {
    Write-Host "✗ Failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
