#!/bin/bash
# ============================================================
# PAYROLL END-TO-END TEST SCRIPT
# Test payroll calculation, execution, and payslip persistence
# ============================================================

set -e

SUPABASE_URL="$1"
SUPABASE_KEY="$2"
COMPANY_ID="$3"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ] || [ -z "$COMPANY_ID" ]; then
  echo "Usage: ./test-payroll.sh <SUPABASE_URL> <SUPABASE_ANON_KEY> <COMPANY_ID>"
  exit 1
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  PAYROLL E2E TEST SUITE                                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ──────────────────────────────────────────────────────────
# TEST 1: Create test employee with salary
# ──────────────────────────────────────────────────────────
echo "TEST 1: Creating test employee with $5000 salary..."

TEST_EMP_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

curl -s -X POST "$SUPABASE_URL/rest/v1/employees" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$TEST_EMP_ID\",
    \"first_name\": \"Test\",
    \"last_name\": \"Employee\",
    \"email\": \"test+$(date +%s)@simpaticohr.in\",
    \"job_title\": \"Software Engineer\",
    \"employment_type\": \"full_time\",
    \"status\": \"active\",
    \"company_id\": \"$COMPANY_ID\"
  }" > /dev/null

echo "✓ Employee created: $TEST_EMP_ID"
echo ""

# ──────────────────────────────────────────────────────────
# TEST 2: Create employee salary record
# ──────────────────────────────────────────────────────────
echo "TEST 2: Creating salary record ($5000)..."

curl -s -X POST "$SUPABASE_URL/rest/v1/employee_salaries" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"employee_id\": \"$TEST_EMP_ID\",
    \"base_salary\": 5000,
    \"currency\": \"USD\",
    \"employment_type\": \"full_time\",
    \"company_id\": \"$COMPANY_ID\"
  }" > /dev/null

echo "✓ Salary record created"
echo ""

# ──────────────────────────────────────────────────────────
# TEST 3: Create deduction record ($100 health insurance)
# ──────────────────────────────────────────────────────────
echo "TEST 3: Creating deduction record ($100 health)..."

curl -s -X POST "$SUPABASE_URL/rest/v1/payroll_deductions" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"employee_id\": \"$TEST_EMP_ID\",
    \"type\": \"health_insurance\",
    \"amount\": 100,
    \"frequency\": \"monthly\",
    \"status\": \"active\",
    \"company_id\": \"$COMPANY_ID\"
  }" > /dev/null

echo "✓ Deduction created"
echo ""

# ──────────────────────────────────────────────────────────
# TEST 4: Verify calculations via frontend API
# ──────────────────────────────────────────────────────────
echo "TEST 4: Verifying payroll calculations..."

PERIOD=$(date +%Y-%m)
RESPONSE=$(curl -s -X POST "http://localhost:5500/payroll/calculate" \
  -H "Content-Type: application/json" \
  -d "{
    \"period\": \"$PERIOD\",
    \"company_id\": \"$COMPANY_ID\"
  }")

GROSS=$(echo $RESPONSE | jq -r '.total_gross // .gross // 0')
NET=$(echo $RESPONSE | jq -r '.total_net // .net // 0')
DEDUCTIONS=$(echo $RESPONSE | jq -r '.deductions_total // .deductions // 0')

echo "Calculation Results:"
echo "  Gross Pay:       \$$GROSS"
echo "  Deductions:      \$$DEDUCTIONS"
echo "  Net Pay:         \$$NET"
echo ""

# Verify calculations
if [ "$GROSS" == "5000" ]; then
  echo "✓ Gross pay correct (expected $5000)"
else
  echo "✗ FAIL: Gross pay incorrect (expected 5000, got $GROSS)"
  exit 1
fi

if [ "$DEDUCTIONS" == "100" ]; then
  echo "✓ Deductions correct (expected $100)"
else
  echo "✗ FAIL: Deductions incorrect (expected 100, got $DEDUCTIONS)"
  exit 1
fi

if [ "$NET" == "4900" ]; then
  echo "✓ Net pay correct (expected $4900)"
else
  echo "✗ FAIL: Net pay incorrect (expected 4900, got $NET)"
  exit 1
fi
echo ""

# ──────────────────────────────────────────────────────────
# TEST 5: Run full payroll execution
# ──────────────────────────────────────────────────────────
echo "TEST 5: Executing payroll run..."

PAY_DATE=$(date -v+30d +%Y-%m-%d 2>/dev/null || date -d "+30 days" +%Y-%m-%d)

PAYROLL_RESPONSE=$(curl -s -X POST "http://localhost:5500/payroll/run" \
  -H "Content-Type: application/json" \
  -d "{
    \"period\": \"$PERIOD\",
    \"pay_date\": \"$PAY_DATE\",
    \"type\": \"monthly\",
    \"company_id\": \"$COMPANY_ID\"
  }")

echo "Payroll run response: $(echo $PAYROLL_RESPONSE | jq '.' | head -20)"
echo ""

# ──────────────────────────────────────────────────────────
# TEST 6: Verify payslips were created
# ──────────────────────────────────────────────────────────
echo "TEST 6: Verifying payslips persisted..."

PAYSLIPS=$(curl -s -X GET "$SUPABASE_URL/rest/v1/payslips?period=eq.$PERIOD&company_id=eq.$COMPANY_ID" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json")

PAYSLIP_COUNT=$(echo $PAYSLIPS | jq 'length')

if [ "$PAYSLIP_COUNT" -gt 0 ]; then
  echo "✓ Payslips created: $PAYSLIP_COUNT record(s)"
  echo "Payslip details:"
  echo $PAYSLIPS | jq '.[] | {employee_id, gross_pay, deductions_total, net_pay, status}' | head -30
else
  echo "✗ FAIL: No payslips found"
  exit 1
fi
echo ""

# ──────────────────────────────────────────────────────────
# TEST 7: Cleanup
# ──────────────────────────────────────────────────────────
echo "TEST 7: Cleaning up test data..."

curl -s -X DELETE "$SUPABASE_URL/rest/v1/employees?id=eq.$TEST_EMP_ID" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" > /dev/null

echo "✓ Test data cleaned up"
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ALL PAYROLL E2E TESTS PASSED ✓                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
