# Design: Pre-registered V1 Name Blocks New Registration

**Date:** 2026-04-28  
**Scope:** `e2e/projects/manager/tests/migration.spec.ts`

## Goal

Add an E2E test that verifies a V1 name pre-registered by USER 1 cannot be registered again on the new V2 app by USER 2. The app should show it as already registered, not as an available name.

## Approach

Option C — single test, no authentication required for USER 2.

- Register a V1 name directly on Anvil via `createMakeV1Name()` (no browser interaction).
- Use the plain `page` fixture (unauthenticated) to simulate USER 2 visiting the app.
- Assert the registration UI shows the name as unavailable.

No subgraph mock is needed. Availability is determined on-chain via the V1 registrar's `isAvailable()` function, which the Anvil fork reflects immediately after registration.

## Test Details

**Fixture:** `page` (unauthenticated — plain Playwright page, no Para wallet auth)

**Setup:**
```ts
const makeV1Name = createMakeV1Name()
const v1Name = await makeV1Name({ label: 'migblock' })
// → e.g. "migblock-1714000000.eth"
```

**Flow:**
1. `page.goto(MANAGER_APP_URL)` — homepage, no wallet connected
2. Find the search input via `findSearchInput(page)`
3. Fill the label (strip `.eth`) into the search input
4. Click the matching name suggestion in the dropdown
5. Assert `page.getByText('This name is already registered or not available for registration.')` is visible

**Assertion text** (from [RegistrationPanel.tsx:78](apps/manager/src/features/register/components/CheckAvailability/RegistrationPanel.tsx#L78)):
> "This name is already registered or not available for registration."

## Placement

New `test(...)` added inside the existing `test.describe('ENS V1 → V2 Migration')` block in [migration.spec.ts](e2e/projects/manager/tests/migration.spec.ts), after the last existing test.

## What is NOT in scope

- USER 2 being authenticated
- Checking that USER 1 (the owner) can still migrate
- Any subgraph mocking
- Changes to fixtures or helpers
