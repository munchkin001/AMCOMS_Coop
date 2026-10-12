# Deploy semaphore-sms edge function to Supabase
# This fixes the CORS issue by allowing both port 5173 and 5174

Write-Host "Deploying semaphore-sms edge function..." -ForegroundColor Cyan

# Check if supabase CLI is installed
$supabaseCli = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseCli) {
    Write-Host "ERROR: Supabase CLI is not installed!" -ForegroundColor Red
    Write-Host "Install it with: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Deploy the function
Write-Host "Deploying to Supabase..." -ForegroundColor Yellow
supabase functions deploy semaphore-sms --project-ref gfefilzhdbotutiocezz

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSMS function deployed successfully!" -ForegroundColor Green
    Write-Host "The function now accepts requests from both port 5173 and 5174" -ForegroundColor Green
} else {
    Write-Host "`nDeployment failed! Check the error above." -ForegroundColor Red
}
