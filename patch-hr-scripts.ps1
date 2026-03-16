# patch-hr-scripts.ps1
# Run this from your repo root: .\patch-hr-scripts.ps1
# Adds supabase-client.js + hr-config.js to all new HR module HTML files

$files = @(
    @{ html = "employees.html";       js = "js/employees.js" },
    @{ html = "employee-profile.html"; js = "js/employees.js" },
    @{ html = "onboarding.html";      js = "js/onboarding.js" },
    @{ html = "training.html";        js = "js/training.js" },
    @{ html = "performance.html";     js = "js/performance.js" },
    @{ html = "hr-ops.html";          js = "js/hr-ops.js" },
    @{ html = "payroll.html";         js = "js/payroll.js" },
    @{ html = "analytics.html";       js = "js/analytics.js" },
    @{ html = "ai-assistant.html";    js = "js/ai-assistant.js" }
)

$inject = @"
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="supabase-client.js"></script>
  <script src="js/hr-config.js"></script>
"@

foreach ($item in $files) {
    $path = $item.html
    if (-not (Test-Path $path)) {
        Write-Host "SKIP (not found): $path" -ForegroundColor Yellow
        continue
    }

    $content = Get-Content $path -Raw -Encoding UTF8

    # Skip if already patched
    if ($content -match "hr-config\.js") {
        Write-Host "ALREADY PATCHED: $path" -ForegroundColor Cyan
        continue
    }

    $jsFile = Split-Path $item.js -Leaf
    
    # Inject before the module JS script tag
    if ($content -match [regex]::Escape("<script src=`"$($item.js)`"")) {
        $content = $content -replace [regex]::Escape("<script src=`"$($item.js)`""), "$inject`n  <script src=`"$($item.js)`""
        Write-Host "PATCHED: $path" -ForegroundColor Green
    } elseif ($content -match [regex]::Escape("<script src=`"$jsFile`"")) {
        $content = $content -replace [regex]::Escape("<script src=`"$jsFile`""), "$inject`n  <script src=`"$jsFile`""
        Write-Host "PATCHED: $path" -ForegroundColor Green
    } else {
        # Fallback: inject before </body>
        $content = $content -replace "</body>", "$inject`n</body>"
        Write-Host "PATCHED (fallback): $path" -ForegroundColor Green
    }

    Set-Content $path -Value $content -Encoding UTF8
}

Write-Host ""
Write-Host "All done! Now run:" -ForegroundColor White
Write-Host "  git add ." -ForegroundColor Cyan
Write-Host "  git commit -m 'Connect HR modules to Supabase'" -ForegroundColor Cyan
Write-Host "  git push" -ForegroundColor Cyan
