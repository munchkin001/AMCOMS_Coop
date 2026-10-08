# ============================================================================
# AMCOMS Database Verification Script (PowerShell)
# ============================================================================
# Purpose: Quick verification of database connectivity and basic structure
# Usage: Run from AMCOMS directory: .\scripts\verify-database.ps1
# ============================================================================

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "AMCOMS Database Verification Script" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "[FAIL] ERROR: .env.local file not found" -ForegroundColor Red
    Write-Host "   Please create .env.local with your Supabase credentials" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Environment file found" -ForegroundColor Green

# Read environment variables
$envContent = Get-Content ".env.local" -Raw
$supabaseUrl = if ($envContent -match 'VITE_SUPABASE_URL=(.+)') { $matches[1].Trim() } else { $null }
$supabaseKey = if ($envContent -match 'VITE_SUPABASE_ANON_KEY=(.+)') { $matches[1].Trim() } else { $null }

if (-not $supabaseUrl -or -not $supabaseKey) {
    Write-Host "[FAIL] ERROR: Could not read Supabase credentials from .env.local" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Supabase URL: $supabaseUrl" -ForegroundColor Green
Write-Host ""

# Function to query Supabase
function Invoke-SupabaseQuery {
    param (
        [string]$Table,
        [string]$Select = "*",
        [string]$Filter = ""
    )
    
    $url = "$supabaseUrl/rest/v1/$Table`?select=$Select"
    if ($Filter) {
        $url += "&$Filter"
    }
    
    $headers = @{
        "apikey" = $supabaseKey
        "Authorization" = "Bearer $supabaseKey"
        "Content-Type" = "application/json"
    }
    
    try {
        $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        return @{ Success = $true; Data = $response; Error = $null }
    }
    catch {
        return @{ Success = $false; Data = $null; Error = $_.Exception.Message }
    }
}

Write-Host "--- Checking Core Tables ---" -ForegroundColor Yellow
Write-Host ""

# Define required tables
$requiredTables = @(
    "members",
    "staff",
    "savings_accounts",
    "loans",
    "products",
    "cash_receipts",
    "cash_disbursements",
    "announcements"
)

$passedChecks = 0
$failedChecks = 0
$warnings = 0

foreach ($table in $requiredTables) {
    $result = Invoke-SupabaseQuery -Table $table -Select "id" -Filter "limit=1"
    
    if ($result.Success) {
        Write-Host "  [OK] Table '$table' exists and is accessible" -ForegroundColor Green
        $passedChecks++
    }
    else {
        Write-Host "  [FAIL] Table '$table' is not accessible" -ForegroundColor Red
        Write-Host "     Error: $($result.Error)" -ForegroundColor Red
        $failedChecks++
    }
}

Write-Host ""
Write-Host "--- Checking Data Integrity ---" -ForegroundColor Yellow
Write-Host ""

# Check if there are any members
$membersResult = Invoke-SupabaseQuery -Table "members" -Select "id,member_number,first_name"
if ($membersResult.Success) {
    $memberCount = ($membersResult.Data | Measure-Object).Count
    if ($memberCount -gt 0) {
        Write-Host "  [OK] Found $memberCount member(s) in database" -ForegroundColor Green
        $passedChecks++
    }
    else {
        Write-Host "  [WARN] No members found in database" -ForegroundColor Yellow
        $warnings++
    }
}

# Check if there are any staff records
$staffResult = Invoke-SupabaseQuery -Table "staff" -Select "id,email,role,user_id,member_id"
if ($staffResult.Success) {
    $staffCount = ($staffResult.Data | Measure-Object).Count
    if ($staffCount -gt 0) {
        Write-Host "  [OK] Found $staffCount staff record(s) in database" -ForegroundColor Green
        
        # Check for NULL user_id
        $nullUserIds = ($staffResult.Data | Where-Object { $null -eq $_.user_id -or $_.user_id -eq "" } | Measure-Object).Count
        if ($nullUserIds -gt 0) {
            Write-Host "  [WARN] WARNING: $nullUserIds staff record(s) have NULL user_id" -ForegroundColor Yellow
            Write-Host "     Run FIX_STAFF_USER_LINKING.sql to fix this" -ForegroundColor Yellow
            $warnings++
        }
        else {
            Write-Host "  [OK] All staff records have user_id linked" -ForegroundColor Green
            $passedChecks++
        }
        
        # Check member staff records for member_id
        $memberStaff = $staffResult.Data | Where-Object { $_.role -eq "member" }
        if ($memberStaff) {
            $nullMemberIds = ($memberStaff | Where-Object { $null -eq $_.member_id -or $_.member_id -eq "" } | Measure-Object).Count
            if ($nullMemberIds -gt 0) {
                Write-Host "  [FAIL] CRITICAL: $nullMemberIds member staff record(s) missing member_id" -ForegroundColor Red
                $failedChecks++
            }
            else {
                Write-Host "  [OK] All member staff records have member_id linked" -ForegroundColor Green
                $passedChecks++
            }
        }
    }
    else {
        Write-Host "  [WARN] No staff records found in database" -ForegroundColor Yellow
        $warnings++
    }
}

# Check savings accounts
$savingsResult = Invoke-SupabaseQuery -Table "savings_accounts" -Select "id,member_id,balance,status"
if ($savingsResult.Success) {
    $savingsCount = ($savingsResult.Data | Measure-Object).Count
    Write-Host "  [OK] Found $savingsCount savings account(s)" -ForegroundColor Green
    $passedChecks++
}

# Check loans
$loansResult = Invoke-SupabaseQuery -Table "loans" -Select "id,member_id,balance,status"
if ($loansResult.Success) {
    $loansCount = ($loansResult.Data | Measure-Object).Count
    Write-Host "  [OK] Found $loansCount loan(s)" -ForegroundColor Green
    $passedChecks++
}

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Passed Checks: $passedChecks" -ForegroundColor Green
Write-Host "  Failed Checks: $failedChecks" -ForegroundColor Red
Write-Host "  Warnings: $warnings" -ForegroundColor Yellow
Write-Host ""

if ($failedChecks -eq 0 -and $warnings -eq 0) {
    Write-Host "All checks passed! Database is ready." -ForegroundColor Green
}
elseif ($failedChecks -eq 0) {
    Write-Host "Database is functional but has warnings." -ForegroundColor Yellow
    Write-Host "Review warnings above and fix if needed." -ForegroundColor Yellow
}
else {
    Write-Host "Database has issues that need attention." -ForegroundColor Red
    Write-Host "Fix critical errors before using the application." -ForegroundColor Red
}

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. If staff.user_id is NULL, run FIX_STAFF_USER_LINKING.sql in Supabase" -ForegroundColor White
Write-Host "  2. For detailed verification, run VERIFY_DATABASE_STRUCTURE.sql in Supabase" -ForegroundColor White
Write-Host "  3. Check real-time replication in Supabase Dashboard" -ForegroundColor White
Write-Host ""
