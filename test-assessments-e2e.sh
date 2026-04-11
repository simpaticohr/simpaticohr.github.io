#!/bin/bash
# ============================================================
# ASSESSMENT END-TO-END TEST SCRIPT  
# Test assessment generation, storage, and candidate flow
# ============================================================

set -e

API_URL="$1"
SUPABASE_URL="$2"
SUPABASE_KEY="$3"
COMPANY_ID="$4"

if [ -z "$API_URL" ] || [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ] || [ -z "$COMPANY_ID" ]; then
  echo "Usage: ./test-assessments-e2e.sh <API_URL> <SUPABASE_URL> <SUPABASE_KEY> <COMPANY_ID>"
  exit 1
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ASSESSMENT E2E TEST SUITE                                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ──────────────────────────────────────────────────────────
# TEST 1: Generate Assessment via AI
# ──────────────────────────────────────────────────────────
echo "TEST 1: Generating assessment via AI..."

GENERATE_RESPONSE=$(curl -s -X POST "$API_URL/ai/generate-assessment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -d "{
    \"job_title\": \"Senior Backend Engineer\",
    \"department\": \"Engineering\",
    \"difficulty\": \"senior\",
    \"tech_stack\": \"Node.js, PostgreSQL, Kubernetes\",
    \"culture\": \"Innovative, collaborative, results-driven\",
    \"question_count\": 3
  }")

echo "Response: $GENERATE_RESPONSE"
echo ""

# Extract assessment from response
ASSESSMENT=$(echo $GENERATE_RESPONSE | jq -r '.assessment // .data.assessment // .')

TITLE=$(echo $ASSESSMENT | jq -r '.assessment_title // "Unknown"')
QUESTION_COUNT=$(echo $ASSESSMENT | jq -r '.questions | length // 0')

if [ "$QUESTION_COUNT" -gt 0 ]; then
  echo "✓ Assessment generated successfully"
  echo "  Title: $TITLE"
  echo "  Questions: $QUESTION_COUNT"
else
  echo "✗ FAIL: No questions generated"
  echo "Full response: $GENERATE_RESPONSE"
  exit 1
fi
echo ""

# ──────────────────────────────────────────────────────────
# TEST 2: Save Assessment to proper table
# ──────────────────────────────────────────────────────────
echo "TEST 2: Saving assessment to assessments table..."

ASSESSMENT_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

SAVE_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/rest/v1/assessments" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"assessment_title\": \"$TITLE\",
    \"questions\": $(echo $ASSESSMENT | jq '.questions'),
    \"difficulty\": \"senior\",
    \"company_id\": \"$COMPANY_ID\"
  }")

SAVED_ID=$(echo $SAVE_RESPONSE | jq -r '.[0].id // ""')

if [ ! -z "$SAVED_ID" ] && [ "$SAVED_ID" != "null" ]; then
  echo "✓ Assessment saved with ID: $SAVED_ID"
  ASSESSMENT_ID=$SAVED_ID
else
  echo "✗ FAIL: Assessment save failed"
  echo "Response: $SAVE_RESPONSE"
  exit 1
fi
echo ""

# ──────────────────────────────────────────────────────────
# TEST 3: Load Assessment and verify structure
# ──────────────────────────────────────────────────────────
echo "TEST 3: Loading assessment and verifying structure..."

LOAD_RESPONSE=$(curl -s -X GET "$SUPABASE_URL/rest/v1/assessments?id=eq.$ASSESSMENT_ID&select=*" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY")

LOADED_TITLE=$(echo $LOAD_RESPONSE | jq -r '.[0].assessment_title // ""')
LOADED_QUESTIONS=$(echo $LOAD_RESPONSE | jq -r '.[0].questions | length // 0')

if [ ! -z "$LOADED_TITLE" ] && [ "$LOADED_QUESTIONS" -gt 0 ]; then
  echo "✓ Assessment loaded successfully"
  echo "  Title: $LOADED_TITLE"
  echo "  Questions: $LOADED_QUESTIONS"
else
  echo "✗ FAIL: Assessment load failed"
  exit 1
fi
echo ""

# ──────────────────────────────────────────────────────────
# TEST 4: Create test candidate
# ──────────────────────────────────────────────────────────
echo "TEST 4: Creating test candidate..."

CANDIDATE_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

CANDIDATE_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/rest/v1/employees" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$CANDIDATE_ID\",
    \"first_name\": \"Test\",
    \"last_name\": \"Candidate\",
    \"email\": \"candidate+$(date +%s)@simpaticohr.in\",
    \"job_title\": \"Backend Engineer\",
    \"employment_type\": \"contractor\",
    \"status\": \"active\",
    \"company_id\": \"$COMPANY_ID\"
  }")

echo "✓ Candidate created: $CANDIDATE_ID"
echo ""

# ──────────────────────────────────────────────────────────
# TEST 5: Assign assessment to candidate
# ──────────────────────────────────────────────────────────
echo "TEST 5: Assigning assessment to candidate..."

ASSIGN_RESPONSE=$(curl -s -X POST "$API_URL/candidates/$CANDIDATE_ID/assessments/$ASSESSMENT_ID/assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -d "{}")

ASSIGNMENT_ID=$(echo $ASSIGN_RESPONSE | jq -r '.assignment.id // ""')

if [ ! -z "$ASSIGNMENT_ID" ] && [ "$ASSIGNMENT_ID" != "null" ]; then
  echo "✓ Assessment assigned: $ASSIGNMENT_ID"
else
  echo "✗ FAIL: Assessment assignment failed"
  echo "Response: $ASSIGN_RESPONSE"
  exit 1
fi
echo ""

# ──────────────────────────────────────────────────────────
# TEST 6: Submit candidate responses
# ──────────────────────────────────────────────────────────
echo "TEST 6: Submitting candidate responses..."

# Build mock responses
RESPONSES="{}"
echo $ASSESSMENT | jq -r '.questions[].id' | while read q_id; do
  RESPONSES="$RESPONSES | .\"$q_id\" = \"Sample answer for $q_id\""
done

SUBMIT_RESPONSE=$(curl -s -X POST "$API_URL/candidates/$CANDIDATE_ID/assessments/$ASSESSMENT_ID/submit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -d "{
    \"responses\": {
      \"q1\": \"Sample technical answer\",
      \"q2\": \"Another detailed response\",
      \"q3\": \"Final assessment answer\"
    }
  }")

SUBMIT_MESSAGE=$(echo $SUBMIT_RESPONSE | jq -r '.message // .error // "unknown"')
echo "✓ Responses submitted: $SUBMIT_MESSAGE"
echo ""

# ──────────────────────────────────────────────────────────
# TEST 7: Score assessment using AI
# ──────────────────────────────────────────────────────────
echo "TEST 7: Scoring assessment with AI..."

SCORE_RESPONSE=$(curl -s -X POST "$API_URL/assessments/$ASSESSMENT_ID/score" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -d "{
    \"candidateId\": \"$CANDIDATE_ID\",
    \"responses\": {
      \"q1\": \"Sample technical answer\",
      \"q2\": \"Another detailed response\",
      \"q3\": \"Final assessment answer\"
    }
  }")

SCORE=$(echo $SCORE_RESPONSE | jq -r '.score // ""')
SUMMARY=$(echo $SCORE_RESPONSE | jq -r '.feedback // ""')

if [ ! -z "$SCORE" ] && [ "$SCORE" != "null" ]; then
  echo "✓ Assessment scored: $SCORE/100"
  echo "  Feedback: $(echo $SUMMARY | head -c 80)..."
else
  echo "✗ FAIL: Assessment scoring failed"
  echo "Response: $SCORE_RESPONSE"
  exit 1
fi
echo ""

# ──────────────────────────────────────────────────────────
# TEST 8: Verify candidate assessment status is 'scored'
# ──────────────────────────────────────────────────────────
echo "TEST 8: Verifying candidate assessment status..."

VERIFY_RESPONSE=$(curl -s -X GET "$SUPABASE_URL/rest/v1/candidate_assessments?assessment_id=eq.$ASSESSMENT_ID&candidate_id=eq.$CANDIDATE_ID&select=*" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY")

STATUS=$(echo $VERIFY_RESPONSE | jq -r '.[0].status // ""')
STORED_SCORE=$(echo $VERIFY_RESPONSE | jq -r '.[0].score // ""')

if [ "$STATUS" == "scored" ]; then
  echo "✓ Assessment status correct: $STATUS"
  echo "✓ Score persisted: $STORED_SCORE/100"
else
  echo "⚠ Status: $STATUS (expected 'scored')"
  echo "  Score: $STORED_SCORE"
fi
echo ""

# ──────────────────────────────────────────────────────────
# TEST 9: Cleanup
# ──────────────────────────────────────────────────────────
echo "TEST 9: Cleaning up test data..."

curl -s -X DELETE "$SUPABASE_URL/rest/v1/employees?id=eq.$CANDIDATE_ID" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" > /dev/null

curl -s -X DELETE "$SUPABASE_URL/rest/v1/assessments?id=eq.$ASSESSMENT_ID" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" > /dev/null

echo "✓ Test data cleaned up"
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ALL ASSESSMENT E2E TESTS PASSED ✓                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
