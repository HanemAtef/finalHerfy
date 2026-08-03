# Testing Harfey Backend

Uses **Jest**, **supertest**, and **mongodb-memory-server**. Tests run against an in-memory MongoDB instance — the real database is never touched.

## Running Tests

```bash
npm test
```

## Test Files

| File | What's covered |
|------|---------------|
| `auth.test.js` | Register (success, duplicate email, admin role blocked), login (success, wrong password, unverified, banned), OTP email verification (success, expired, wrong), password reset OTP (success, invalid), refresh token (success, invalid), logout + token revocation, invalid/expired JWT rejection |
| `order.test.js` | Create order (success, unavailable handyman, penalised customer), handyman accept (success, customer blocked), price confirmation (success, non-customer blocked), full lifecycle `pending→accepted→price_confirmed→in-progress→completed`, invalid transitions (`pending→completed`, `accepted→in-progress`), cannot update completed order, cancellation penalty applied to customer |
| `payment.test.js` | 10% commission on standard order, 15% commission on emergency order, wallet balance incremented on cash payment confirmation, payment confirmation rejected on non-completed order |
| `matching.test.js` | Pure unit tests for the smart scoring formula — closer wins on equal rating, farther-but-better-rated can outrank closer-but-lower-rated, distance-0 gets maximum distance contribution, sorted list is in descending score order |
| `idempotency.test.js` | Same `Idempotency-Key` twice → only one order created, same response returned; different keys → two separate orders created |

## Environment

Tests set `NODE_ENV=test` (via `tests/setup.js`) which:
- Skips the real MongoDB connection in `config/dbConnection.js`
- Skips the dispute escalation cron job
- Skips the HTTP server `listen()` call

## Adding Tests

When adding new endpoints or business logic, add matching tests covering both success flows and expected failures (e.g. unauthorised access, invalid state transitions). Use the `makeCustomer` / `makeHandyman` helper pattern from existing test files to avoid email/phone collisions between tests.
