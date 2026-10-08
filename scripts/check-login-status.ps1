# ============================================
# Check Login Status for All Users
# ============================================
# This script checks which users can/cannot log in
# ============================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "AMCOMS Login Status Checker" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "[FAIL] .env.local file not found" -ForegroundColor Red
    Write-Host "Please create .env.local with Supabase credentials" -ForegroundColor Yellow
    exit 1
}

# Read environment variables
$envContent = Get-Content ".env.local" -Raw
$supabaseUrl = if ($envContent -match 'VITE_SUPABASE_URL=(.+)') { $matches[1].Trim() } else { $null }
$supabaseKey = if ($envContent -match 'VITE_SUPABASE_ANON_KEY=(.+)') { $matches[1].Trim() } else { $null }

if (-not $supabaseUrl -or -not $supabaseKey) {
    Write-Host "[FAIL] Could not read Supabase credentials" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Connected to: $supabaseUrl" -ForegroundColor Green
Write-Host ""

# Function to query Supabase
function Invoke-SupabaseQuery {
    param (
        [string]$Table,
        [string]$Select = "*"
    )
    
    $url = "$supabaseUrl/rest/v1/$Table`?select=$Select"
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

Write-Host "Checking staff records..." -ForegroundColor Yellow
Write-Host ""

$staffResult = Invoke-SupabaseQuery -Table "staff" -Select "email,role,user_id,is_active"

if ($staffResult.Success) {
    $staffData = $staffResult.Data
    
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "STAFF LOGIN STATUS" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    
    $canLogin = 0
    $cannotLogin = 0
    $inactive = 0
    
    foreach ($staff in $staffData) {
        $email = $staff.email
        $role = $staff.role
        $userId = $staff.user_id
        $isActive = $staff.is_active
        
        Write-Host "Email: $email" -ForegroundColor White
        Write-Host "  Role: $role" -ForegroundColor Gray
        
        if (-not $isActive) {
            Write-Host "  Status: INACTIVE - Account disabled" -ForegroundColor Red
            Write-Host "  Can Login: NO" -ForegroundColor Red
            $inactive++
        }
        elseif ($null -eq $userId -or $userId -eq "") {
            Write-Host "  Status: NOT LINKED - user_id is NULL" -ForegroundColor Red
            Write-Host "  Can Login: NO" -ForegroundColor Red
            Write-Host "  Fix: Run URGENT_FIX_LOGIN.sql in Supabase" -ForegroundColor Yellow
            $cannotLogin++
        }
        else {
            Write-Host "  Status: LINKED - Ready to login" -ForegroundColor Green
            Write-Host "  Can Login: YES" -ForegroundColor Green
            $canLogin++
        }
        Write-Host ""
    }
    
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "SUMMARY" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Total Staff: $($staffData.Count)" -ForegroundColor White
    Write-Host "  Can Login: $canLogin" -ForegroundColor Green
    Write-Host "  Cannot Login (Not Linked): $cannotLogin" -ForegroundColor Red
    Write-Host "  Inactive Accounts: $inactive" -ForegroundColor Yellow
    Write-Host ""
    
    if ($cannotLogin -gt 0) {
        Write-Host "ACTION REQUIRED:" -ForegroundColor Red
        Write-Host "  $cannotLogin user(s) cannot log in because user_id is NULL" -ForegroundColor Red
        Write-Host ""
        Write-Host "TO FIX:" -ForegroundColor Yellow
        Write-Host "  1. Open Supabase Dashboard" -ForegroundColor White
        Write-Host "  2. Go to SQL Editor" -ForegroundColor White
        Write-Host "  3. Copy and run: AMCOMS/URGENT_FIX_LOGIN.sql" -ForegroundColor White
        Write-Host "  4. Takes 30 seconds, fixes all users" -ForegroundColor White
    }
    else {
        Write-Host "ALL USERS CAN LOG IN!" -ForegroundColor Green
    }
}
else {
    Write-Host "[FAIL] Could not fetch staff records" -ForegroundColor Red
    Write-Host "Error: $($staffResult.Error)" -ForegroundColor Red
    Write-Host ""
    Write-Host "This might be due to Row Level Security." -ForegroundColor Yellow
    Write-Host "Run URGENT_FIX_LOGIN.sql in Supabase SQL Editor instead." -ForegroundColor Yellow
}

Write-Host ""
