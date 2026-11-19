# F10 frontend integration-readiness report — 2026-11-13

Assessment: the implemented expense-sharing flows are hardened and integration-tested; the complete V1 frontend is NOT ready for release. No backend source, approved API, financial rule or production deployment was changed.

## Confirmed fixes
- Cancel superseded session checks during login/logout; ignore cancelled responses even when body parsing finishes late, preventing stale 401s or session results from changing the current session.
- Share concurrent CSRF initialization while preserving one retry only for CSRF_FAILED and no automatic retry of uncertain writes.
- Reject control characters/whitespace in login redirect targets.
- Keep busy confirmations open on Escape; restore opener focus on close; constrain dialog height for small screens.
- Handle changed verification tokens without duplicate submissions or stale-result overwrites; remove an incorrect guarantee that a timed-out token was unused.
- Give expense edit forms and comments distinct React keys; fix duplicate IDs in comment test fixtures.
- Point the lint command to the existing Oxlint dependency instead of uninstalled ESLint.
- Bring the outage test fixture up to date with notification/dashboard requests, rather than weakening application error handling.

## Test/build evidence
- Complete normal frontend suite run ONCE: 246 tests, 242 passed and 4 failed, no skips. The four failures came from the outdated outage fixture.
- After its correction: targeted outage and expense suites passed all 25 tests. All 246 normal test cases have passing results across the full run and targeted reruns; the full suite was not repeated.
- The duplicate-key regression assertion additionally passed in a focused one-test run (13 nonselected tests skipped by its filter).
- Seven new hardening regressions and all 38 API-client tests passed (45 targeted tests), and were included in the complete run.
- One production build passed: Vite 8.3.6; 96 modules; main JS 352.30 kB / 108.02 kB gzip.
- npm audit checked production and development dependencies: zero reported vulnerabilities. This is advisory coverage, not a guarantee of absence of vulnerabilities.
- Lint attempted with configured Oxlint, including outside the sandbox: blocked by Windows Application Control loading its native binding. Its official optional WASM package was unavailable in the registry. No Windows protection was changed. No TypeScript/typecheck script is configured.

## Real integration versus mocks
`scripts/run_live_integration.py` starts the actual Django WSGI application against a uniquely named temporary PostgreSQL database and invokes the actual frontend API modules over HTTP. Both live tests passed. The server and temporary database are stopped/removed afterward; development data is untouched.

The first live case verified registration, unverified-login rejection, verification and single-use token behavior, login/session persistence, group creation, invitation acceptance, expense creation/editing and exact shares, balances, settlement generation, immutable assigned expenses, payer report/receiver confirmation, duplicate-state 409, settlement completion/history, notification counts/read state/recipient isolation, logout and 401.

The second stopped the real Django listener, confirmed a real network failure, rendered the actual React app in jsdom and successfully calculated Quick Split while the backend was unreachable.

No API response/function was mocked in the live tests. Node fetch uses a cookie-jar adapter carrying real server cookies and CSRF headers. Verification email is captured in memory and passed through a temporary test-only file that is removed afterward; tokens, cookies and passwords are not logged. This does not validate live SMTP, browser cookie policy, the Vite proxy, or a deployed HTTPS environment. Normal component tests use explicit mocked responses and are reported separately.

## Remaining release gates
- `/profile` remains the existing placeholder. R1.2 profile/photo/UPI editing is an existing feature gap; it was not added during a no-new-features hardening task.
- Backend production settings remain blocked as documented in B9. Frontend release must use real API mode (`VITE_USE_MOCKS=false`) with an agreed HTTPS/same-origin API route; Vite's development proxy is not production hosting configuration.
- Browser access host was unavailable. Responsive CSS, keyboard interactions, dialog cancellation/focus, money/date handling, UPI URI validation and participant-only QR access were reviewed/tested, but actual viewport layout and browser cookie/CSRF behavior still need a focused browser pass.
- Oxlint must run on an environment that permits its signed/approved runtime before lint can be certified clean. No lint result was fabricated or suppressed.
- No deployment, live email delivery, or external payment processing was performed.

## Files changed for F10
`package.json`, `vite.config.js`, `src/api/client.js`, `src/context/AuthContext.jsx`, `src/utils/safeNext.js`, `src/components/Modal.jsx`, `src/pages/SettlementPage.jsx`, `src/pages/VerifyEmailPage.jsx`, `src/features/settlements/GenerateSettlement.jsx`, `src/features/expenses/ExpenseDetail.jsx`, `src/styles/global.css`, `src/tests/hardening.test.jsx`, `src/tests/authOutage.test.jsx`, `src/tests/expenses.test.jsx`, `scripts/run_live_integration.py`, `scripts/vitest.live.config.js`, `scripts/live.integration.test.jsx`, and this report.

Reproduce live integration from frontend: `..\backend\.venv\Scripts\python.exe scripts/run_live_integration.py` (requires the existing local PostgreSQL test-database creation permission).
