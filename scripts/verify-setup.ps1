# ============================================
# AMCOMS Database Setup Verification Script
# ============================================
# This script checks your Supabase database setup
# Run: .\scripts\verify-setup.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "AMCOMS Database Setup Verification" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the AMCOMS directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Please run this script from the AMCOMS directory" -ForegroundColor Red
    Write-Host "   cd AMCOMS" -ForegroundColor Yellow
    Write-Host "   .\scripts\verify-setup.ps1" -ForegroundColor Yellow
    exit 1
}

# Check if Supabase CLI is installed
Write-Host "1. Checking Supabase CLI..." -ForegroundColor Yellow
$supabaseCheck = Get-Command supabase -ErrorAction SilentlyContinue
if ($supabaseCheck) {
    $supabaseVersion = & supabase --version 2>&1
    Write-Host "   ✓ Supabase CLI installed: $supabaseVersion" -ForegroundColor Green
} else {
    Write-Host "   ❌ Supabase CLI not found" -ForegroundColor Red
    Write-Host "   Install: https://supabase.com/docs/guides/cli" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Check if project is linked
Write-Host "2. Checking project link..." -ForegroundColor Yellow
if (Test-Path "supabase/.temp/project-ref") {
    $projectRef = Get-Content "supabase/.temp/project-ref"
    Write-Host "   ✓ Project linked: $projectRef" -ForegroundColor Green
} else {
    Write-Host "   ❌ No project linked" -ForegroundColor Red
    Write-Host "   Run: supabase link" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Check environment variables
Write-Host "3. Checking environment variables..." -ForegroundColor Yellow
if (Test-Path ".env.local") {
    $envContent = Get-Content ".env.local" -Raw
    
    if ($envContent -match "VITE_SUPABASE_URL=(.+)") {
        Write-Host "   ✓ VITE_SUPABASE_URL is set" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  VITE_SUPABASE_URL not found" -ForegroundColor Yellow
    }
    
    if ($envContent -match "VITE_SUPABASE_ANON_KEY=(.+)") {
        Write-Host "   ✓ VITE_SUPABASE_ANON_KEY is set" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  VITE_SUPABASE_ANON_KEY not found" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  .env.local file not found" -ForegroundColor Yellow
    Write-Host "   Create it with your Supabase credentials" -ForegroundColor Yellow
}

Write-Host ""

# Check migrations
Write-Host "4. Checking migrations..." -ForegroundColor Yellow
if (Test-Path "supabase/migrations") {
    $migrations = Get-ChildItem "supabase/migrations" -Filter "*.sql" | Measure-Object
    if ($migrations.Count -gt 0) {
        Write-Host "   ✓ Found $($migrations.Count) migration files" -ForegroundColor Green
        
        # List migrations
        Get-ChildItem "supabase/migrations" -Filter "*.sql" | ForEach-Object {
            Write-Host "     - $($_.Name)" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ⚠️  No migration files found" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  supabase/migrations directory not found" -ForegroundColor Yellow
}

Write-Host ""

# Ask if they want to check database
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Database Schema Check" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Would you like to check your database schema?" -ForegroundColor Yellow
Write-Host "(This requires Supabase CLI to be authenticated)" -ForegroundColor Gray
Write-Host ""
$response = Read-Host "Check database? (Y/N)"

if ($response -eq "Y" -or $response -eq "y") {
    Write-Host ""
    Write-Host "Checking database tables..." -ForegroundColor Yellow
    
    # Check staff table
    Write-Host ""
    Write-Host "Checking staff table..." -ForegroundColor Cyan
    & supabase db execute --linked "SELECT email, first_name, last_name, role, is_active FROM staff ORDER BY role;" 2>&1 | Out-String | Write-Host
    
    # Check members table
    Write-Host ""
    Write-Host "Checking members table..." -ForegroundColor Cyan
    & supabase db execute --linked "SELECT member_number, first_name, last_name, email, membership_status FROM members LIMIT 5;" 2>&1 | Out-String | Write-Host
    
    # Count records
    Write-Host ""
    Write-Host "Record counts:" -ForegroundColor Cyan
    $sqlQuery = "SELECT 'staff' as table_name, COUNT(*) as records FROM staff UNION ALL SELECT 'members', COUNT(*) FROM members UNION ALL SELECT 'loans', COUNT(*) FROM loans UNION ALL SELECT 'requests', COUNT(*) FROM requests UNION ALL SELECT 'transactions', COUNT(*) FROM transactions UNION ALL SELECT 'products', COUNT(*) FROM products ORDER BY table_name;"
    & supabase db execute --linked $sqlQuery 2>&1 | Out-String | Write-Host
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Verification Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. If migrations are missing:" -ForegroundColor White
Write-Host "   - Check supabase/migrations/ directory" -ForegroundColor Gray
Write-Host "   - Apply migrations: supabase db push --linked" -ForegroundColor Gray
Write-Host ""
Write-Host "2. To create test users:" -ForegroundColor White
Write-Host "   - Go to Supabase Dashboard > Authentication" -ForegroundColor Gray
Write-Host "   - Create users for each role" -ForegroundColor Gray
Write-Host "   - Run SQL from LOGIN_ISSUE_FIX.md" -ForegroundColor Gray
Write-Host ""
Write-Host "3. For detailed database verification:" -ForegroundColor White
Write-Host "   - Open Supabase SQL Editor" -ForegroundColor Gray
Write-Host "   - Run: scripts/verify-database.sql" -ForegroundColor Gray
Write-Host ""
Write-Host "4. To start the app:" -ForegroundColor White
Write-Host "   - npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "For help, see: LOGIN_ISSUE_FIX.md" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
