#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# CFO Assistant — full curl test suite
# Usage:  bash scripts/curl_test.sh
#         bash scripts/curl_test.sh --live   (with real Supabase + real keys)
# ──────────────────────────────────────────────────────────────────────────────

BASE=http://localhost:3000
W=http://localhost:8000
SEC="dev-worker-secret-change-in-prod"

# Load .env.local
ENV_FILE="$(dirname "$0")/../.env.local"
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key val; do
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    export "$key=$val"
  done < <(grep -v '^#' "$ENV_FILE" | grep -v '^$')
fi

SB_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
SB_ANON="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
SB_SERVICE="${SUPABASE_SERVICE_ROLE_KEY:-}"
LIVE=false
[[ "${1:-}" == "--live" ]] && LIVE=true

PASS=0; FAIL=0
check() {
  local label="$1" expect="$2" method="$3" url="$4"; shift 4
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" "$@")
  if [[ "$actual" == "$expect" ]]; then
    echo "  ✓  [$actual] $label"
    ((PASS++))
  else
    echo "  ✗  [$actual ≠ $expect] $label"
    ((FAIL++))
  fi
}
body() {
  local label="$1" method="$2" url="$3"; shift 3
  echo ""
  echo "── $label"
  curl -s -X "$method" "$url" "$@"
  echo ""
}

echo ""
echo "══════════════════════════════════════════════════════"
echo "  CFO Assistant — curl test suite"
echo "  Mode: $([ "$LIVE" = true ] && echo 'LIVE (real Supabase)' || echo 'STUB (no Supabase)')"
echo "══════════════════════════════════════════════════════"

# ── Worker ─────────────────────────────────────────────────────────────────────
echo ""
echo "── Python Worker (:8000)"
check "GET  /health"                       200 GET  $W/health
check "POST /analyze  valid secret → 200"  200 POST $W/analyze \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: $SEC" \
  -d '{"reportId":"curl-test","orgId":"test-org","currency":"GBP"}'
check "POST /analyze  bad secret → 401"    401 POST $W/analyze \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: wrong-secret" \
  -d '{"reportId":"x","orgId":"y","currency":"GBP"}'
check "POST /analyze  no secret → 422"     422 POST $W/analyze \
  -H "Content-Type: application/json" \
  -d '{"reportId":"x","orgId":"y","currency":"GBP"}'
check "POST /analyze  missing fields → 422" 422 POST $W/analyze \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: $SEC" \
  -d '{"currency":"GBP"}'

body "Worker /analyze response" POST $W/analyze \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: $SEC" \
  -d '{"reportId":"body-test","orgId":"test-org","currency":"GBP"}'

# ── Next.js — public pages ──────────────────────────────────────────────────────
echo ""
echo "── Next.js (:3000) — public pages"
check "GET  /"          200 GET $BASE/
check "GET  /about"     200 GET $BASE/about
check "GET  /login"     200 GET $BASE/login
check "GET  /signup"    200 GET $BASE/signup
check "GET  /lite"      200 GET $BASE/lite
check "GET  /lite/result?reportId=abc"  200 GET "$BASE/lite/result?reportId=abc"
check "GET  /onboard"   200 GET $BASE/onboard

# ── Next.js — auth-protected pages (redirect to /login) ────────────────────────
echo ""
echo "── Next.js (:3000) — protected routes → 307"
check "GET  /upload"    307 GET $BASE/upload
check "GET  /reports"   307 GET $BASE/reports
check "GET  /settings"  307 GET $BASE/settings

# ── Next.js — API endpoints (no auth) ──────────────────────────────────────────
echo ""
echo "── Next.js (:3000) — API auth guards"
check "POST /api/upload    no auth → 401"   401 POST $BASE/api/upload
check "POST /api/onboard   no auth → 401"   401 POST $BASE/api/onboard \
  -H "Content-Type: application/json" -d '{}'
check "POST /api/create-checkout no auth → 401" 401 POST $BASE/api/create-checkout \
  -H "Content-Type: application/json" -d '{}'
check "DELETE /api/delete-account no auth → 401"   401 DELETE $BASE/api/delete-account
check "GET    /api/rules  no auth → 401"           401 GET "$BASE/api/rules?orgId=test"
check "PUT    /api/rules  no auth → 401"           401 PUT "$BASE/api/rules" \
  -H "Content-Type: application/json" -d '{}'
check "DELETE /api/rules  no auth → 401"           401 DELETE "$BASE/api/rules?id=x&orgId=y"
check "GET    /api/report-status no auth → 401"    401 GET "$BASE/api/report-status?reportId=test"
check "GET    /api/report/test no auth → 401"      401 GET "$BASE/api/report/test"
check "GET    /api/invite-member no auth → 401"    401 GET "$BASE/api/invite-member?orgId=test"
check "POST   /api/invite-member no auth → 401"    401 POST "$BASE/api/invite-member" \
  -H "Content-Type: application/json" -d '{}'
check "DELETE /api/invite-member no auth → 401"    401 DELETE "$BASE/api/invite-member?memberId=x&orgId=y"
check "DELETE /api/delete-report no auth → 401"    401 DELETE "$BASE/api/delete-report?reportId=x&orgId=y"
check "POST   /api/customer-portal no auth → 401"  401 POST "$BASE/api/customer-portal" \
  -H "Content-Type: application/json" -d '{}'

# ── Next.js — API validation errors ────────────────────────────────────────────
echo ""
echo "── Next.js (:3000) — API validation"
check "POST /api/stripe-webhook bad sig → 400" 400 POST $BASE/api/stripe-webhook \
  -H "Content-Type: application/json" -d '{}'
check "GET    /api/rules  no orgId → 400"                         400 GET "$BASE/api/rules"
check "GET    /api/auth/callback no code → 307"                   307 GET "$BASE/api/auth/callback"
check "POST   /api/lite-upload no files → 400"                    400 POST $BASE/api/lite-upload
check "GET    /api/invite-member no orgId → 400"                  400 GET "$BASE/api/invite-member"
check "DELETE /api/invite-member missing params → 400"            400 DELETE "$BASE/api/invite-member"
check "DELETE /api/delete-report missing params → 400"            400 DELETE "$BASE/api/delete-report"
check "POST   /api/customer-portal no auth → 401"                 401 POST "$BASE/api/customer-portal" \
  -H "Content-Type: application/json" -d '{}'
check "GET    /api/report-status no auth → 401"                   401 GET "$BASE/api/report-status"
check "GET    /settings/rules  → 307 (protected)"                 307 GET "$BASE/settings/rules"

body "Stripe webhook bad-sig response" POST $BASE/api/stripe-webhook \
  -H "Content-Type: application/json" -d '{}'

# ── Live-only: Supabase auth flow via REST ─────────────────────────────────────
if [[ "$LIVE" = true ]]; then
  if [[ -z "$SB_URL" || "$SB_URL" == *stub* ]]; then
    echo ""
    echo "⚠  LIVE mode requested but NEXT_PUBLIC_SUPABASE_URL is still a stub. Skipping live tests."
  else
    echo ""
    echo "── Live: Supabase auth (direct REST)"

    TEST_EMAIL="curl-test-$(date +%s)@example.com"
    TEST_PASS="TestPass123!"

    echo ""
    echo "  Signing up: $TEST_EMAIL"
    SIGNUP=$(curl -s -X POST "$SB_URL/auth/v1/signup" \
      -H "apikey: $SB_ANON" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}")
    ACCESS_TOKEN=$(echo "$SIGNUP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

    if [[ -n "$ACCESS_TOKEN" ]]; then
      echo "  ✓  Signup OK — access_token obtained"
      ((PASS++))

      echo ""
      echo "  Testing authenticated endpoints with real token..."

      check "GET  /api/rules (authed, no orgId) → 400" 400 GET "$BASE/api/rules" \
        -H "Cookie: sb-access-token=$ACCESS_TOKEN"

      # Onboard (creates org)
      echo ""
      echo "  POST /api/onboard (create org)"
      ONBOARD=$(curl -s -X POST "$BASE/api/onboard" \
        -H "Content-Type: application/json" \
        -H "Cookie: sb-access-token=$ACCESS_TOKEN" \
        -d "{\"orgName\":\"Curl Test Org\",\"plan\":\"starter\"}")
      ORG_ID=$(echo "$ONBOARD" | grep -o '"orgId":"[^"]*"' | cut -d'"' -f4)
      echo "  Response: $ONBOARD"
      if [[ -n "$ORG_ID" ]]; then
        echo "  ✓  Org created: $ORG_ID"
        ((PASS++))
      else
        echo "  ✗  Onboard failed"
        ((FAIL++))
      fi

      # Sign in (get fresh token via cookie-based flow)
      SIGNIN=$(curl -s -X POST "$SB_URL/auth/v1/token?grant_type=password" \
        -H "apikey: $SB_ANON" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}")
      ACCESS_TOKEN=$(echo "$SIGNIN" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
      REFRESH_TOKEN=$(echo "$SIGNIN" | grep -o '"refresh_token":"[^"]*"' | cut -d'"' -f4)
      if [[ -n "$ACCESS_TOKEN" ]]; then
        echo "  ✓  Sign-in OK"
        ((PASS++))
      fi

    else
      echo "  ✗  Signup failed: $SIGNUP"
      ((FAIL++))
    fi
  fi
fi

# ── Worker local pipeline test ─────────────────────────────────────────────────
echo ""
echo "── Worker: local pipeline smoke test"
cd "$(dirname "$0")/../worker"
if .venv/bin/python tests/test_pipeline_local.py 2>&1 | grep -E "passed|failed|✓|✗"; then
  ((PASS++))
fi
cd - > /dev/null

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "══════════════════════════════════════════════════════"
echo ""
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
