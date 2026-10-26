# Manual local test — G02 V1 child deletion

This environment reproduces the V1 child-deletion gap with the Explorer on a
local Sepolia fork. It covers failed legacy cases L040, L043, L045, L046, L192
and L198, plus L044 as a negative control.

## Start and seed

From the repository root:

```bash
pnpm e2e:infra:up
VITE_RPC_URL=http://127.0.0.1:8545 \
VITE_BIGNAME_API_URL=http://127.0.0.1:5660 \
VITE_USE_MOCK_WALLET=true \
pnpm --filter portal dev -- --port 3001
```

In another terminal:

```bash
pnpm --filter @ens-apps/e2e seed:g02-delete
```

The seed command prints the five direct URLs and saves the same information to
`e2e/test-results/g02-manual-env.json`. The mock wallet is Anvil account 0,
`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, and is the child holder in every
positive case. No wallet switching is needed.

Do not run Playwright while `VITE_USE_MOCK_WALLET=true`; the test fixture waits
for a Connect button which the mock-wallet build intentionally removes.

## Test matrix

| Seeded case | Authority | Legacy cases | Expected replacement behaviour |
|---|---|---|---|
| `unwrapped-child` | connected wallet owns only the registry child | L040 | Delete is visible and clears the registry owner |
| `wrapped-child` | connected wallet owns only the wrapped child | L043, L192 | Delete is visible and burns/removes the wrapped child |
| `emancipated-both` | connected wallet owns parent and emancipated child | L045 | Delete is visible and removes the child |
| `emancipated-child` | connected wallet owns only the emancipated child | L046, L198 | Delete is visible and removes the child |
| `emancipated-parent-control` | connected wallet owns only the parent | L044 | Negative control: Delete is absent and the UI says only the child holder can delete |

For each URL, find the `delete-me` row in the parent's Subnames table. In the
four positive cases, confirm the Delete action is present, submit it, and check
that the row disappears. The current G02 defect is reproduced when the action
is missing. In the negative control, do not submit anything; absence is correct.

Running the seed command again creates a fresh set of names. Restarting the
local chain removes every seeded set.
