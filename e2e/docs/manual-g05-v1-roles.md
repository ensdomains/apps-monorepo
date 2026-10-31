# Manual local test — G05 independent V1 owner and manager edits

An unwrapped V1 `.eth` name has two independent authority slots:

- **Owner / registrant** — holder of the BaseRegistrar ERC-721.
- **Manager / controller** — owner of the name's node in ENSRegistry; controls
  the resolver and records.

Moving one slot does not move the other. A complete transfer deliberately does
both: it reclaims the registry controller for the recipient and transfers the
registrar NFT. Therefore full Transfer cannot replace an independent Owner or
Manager edit.

G05 exists because ens-app-v3 exposed those independent edits, while the
replacement apps expose Reclaim and full Transfer but no equivalent role
editor. Reclaim only assigns Manager to the connected Owner. It cannot assign
an arbitrary manager and cannot change Owner.

## Start and seed

Start the local stack and Explorer from the repository root:

```bash
pnpm e2e:infra:up
VITE_RPC_URL=http://127.0.0.1:8545 \
VITE_BIGNAME_API_URL=http://127.0.0.1:5660 \
VITE_USE_MOCK_WALLET=true \
pnpm --filter portal dev -- --port 3001
```

Optionally start Manager in a second terminal:

```bash
VITE_RPC_URL=http://127.0.0.1:8545 \
VITE_BIGNAME_API_URL=http://127.0.0.1:5660 \
VITE_USE_MOCK_WALLET=true \
VITE_FF_USE_EOA=true \
pnpm --filter manager dev -- --port 3000
```

Seed the role matrix:

```bash
pnpm --filter @ens-apps/e2e seed:g05-roles
```

The command prints direct URLs and writes the complete role state to
`e2e/test-results/g05-manual-env.json`.

## Wallets

| Role | Address |
|---|---|
| Connected mock wallet | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Alternate current holder | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Proposed replacement holder | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |

No wallet switching is needed for the primary checks.

## Cases

### Manager only — L094 and L174

The connected wallet is Manager, while the alternate wallet is Owner. The
connected Manager should be able to assign Manager to the proposed wallet,
leaving Owner unchanged. It must not be able to change Owner.

The bug is reproduced when neither app offers an independent Manager edit.
Full Transfer is not an equivalent action because it changes ownership too.

### Owner only — L175 and L176

The connected wallet is Owner, while the alternate wallet is Manager. Two
independent actions should be available:

1. Change Owner to the proposed wallet while Manager remains alternate.
2. Change Manager to the proposed wallet while Owner remains connected.

Reclaim only changes Manager back to the connected wallet. Full Transfer moves
both Owner and Manager to the recipient. Neither satisfies these postconditions.

### Owner and manager control

The connected wallet holds both roles. This is a control for the supported full
Transfer path; moving both roles is correct here.

## What to record

On each Ownership page, record the displayed Owner and Manager and the actions
offered. Do not complete full Transfer when testing the split cases because it
destroys the fixture and proves a different behavior. The gap is confirmed if
there is no Edit roles, Change owner, or Change manager action capable of
preserving the unselected role.

Running the seed command again creates fresh names. Restarting the local chain
removes all seeded sets.
