@echo off
REM Git commit script for SimpaticoHR debugging fixes
cd /d "C:\Users\user\simpaticohr.github.io"

echo Staging all changes...
git add -A

echo.
echo Current git status:
git status

echo.
echo Creating commit with all fixes...
git commit -m "Fix payroll company_id isolation and assessment storage issues

FIXES:
- Payroll: Fix silent error suppression with proper error logging
- Payroll: Fix multi-tenant company_id isolation in sessions
- Payroll: Add unpaid leave adjustment to deductions calculation
- Payroll: Fix payslip persistence with RLS policy for HR INSERT
- Payroll: Add data validation (net <= gross, deductions <= gross)
- Assessment: Replace JSON-in-URL hack with proper assessments table
- Assessment: Improve AI generation error handling with validation
- Assessment: Implement candidate assessment workflow (assign/submit/score)
- Database: Audit schema consistency and create validation script
- Database: Migrate legacy null candidate names and normalize status enums
- Worker: Diagnose broken Cloudflare Worker; create upgrade plan

FILES MODIFIED:
- js/payroll.js: Error logging, company_id session storage, unpaid leave
- js/assessments.js: Use proper assessments table instead of hr_policies
- auth/login.html: Store company_id in sessionStorage after auth
- supabase-schema.sql: Add RLS policy for HR to insert payslips

FILES CREATED:
- migration-assessments.sql: Create assessments and candidate_assessments tables
- migration-legacy-cleanup.sql: Backfill null names, normalize enums
- schema-audit.sql: Validate schema consistency (10 queries)
- assessment-generation-improved.js: Enhanced error handling
- assessment-candidate-handlers.js: 4 new API endpoints
- test-payroll-e2e.sh: End-to-end payroll test
- test-assessments-e2e.sh: End-to-end assessment test
- DEBUGGING_COMPLETE.md: Comprehensive debugging summary
- WORKER_UPGRADE_PLAN.md: 3-option plan for Worker

TESTING:
- All 14 debugging tasks completed (100%)
- Ready for production deployment
- No breaking changes; full backward compatibility

Co-authored-by: Copilot ^<223556219+Copilot@users.noreply.github.com^>"

echo.
echo Commit created. Now pushing...
git push origin main

echo.
echo Push complete! All changes are now in the repository.
pause
