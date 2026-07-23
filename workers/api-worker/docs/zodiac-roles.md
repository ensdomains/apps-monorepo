# Zodiac Roles hardening for the Crossmint fulfilment wallet

Why: `ETH_PRIVATE_KEY` is a raw EOA secret, and an EOA key can never be
revoked — a leak means whatever it holds (USDC/DAI float, registrar
approvals, names in flight) is gone. This setup moves all funds and on-chain
authority to a treasury **Safe** and demotes the worker key to a **member of
one Zodiac Roles v2 role** scoped to the exact fulfilment surface. Leaked-key
blast radius collapses to "spend the Safe's standing registrar allowance on
junk registrations that land in the Safe"; revocation is one `revokeRole` tx.

## How execution changes

```
worker EOA (role member, gas dust only)
    │ execTransactionWithRole(to, 0, data, Call, roleKey, shouldRevert=true)
    ▼
Roles modifier ── permission check ──► Safe.execTransactionFromModule
    ▼
target sees msg.sender = SAFE  →  the Safe is the payer everywhere
```

`createServerWalletClient` exposes this as `client.payer` + `client.execWrite`
(see `src/services/crossmint/roles.ts`). With the env vars unset the worker
runs in direct-EOA mode — local dev and the standalone scripts are unchanged.

## Role permission set

| Target            | Function                | Conditions                                       |
| ----------------- | ----------------------- | ------------------------------------------------ |
| ETHRegistrar      | `commit`                | — (harmless)                                     |
| ETHRegistrar      | `register`              | duration ≤ cap · token ∈ {USDC, DAI} (owner = buyer, unconstrained) |
| USDC, DAI         | `approve`               | spender == registrar · amount ≤ cap              |
| VerifiableFactory | `deployProxy`           | — (resolver deploys)                             |

No value sends, no delegatecall, no token transfers, no arbitrary approvals.
The registrar charges `msg.sender` (the Safe), so names register straight to the
buyer — there is no registry transfer in the role, and `owner` is unconstrained.
The blast radius of a leaked worker key is the standing registrar allowance
(capped); the worker's registration path additionally gates spending on the
voucher's stored commitment, so a bare key with no matching paid voucher spends
nothing.

**`burn` is deliberately not in the role.** A blanket `burn(uint256)` lets a
leaked key destroy arbitrary customers' vouchers, and burning is only cosmetic
cleanup (vouchers are soulbound and single-use). It stays an ops-only path — the
Safe is **not** granted `BURNER_ROLE`.

## Runbook

1. **Create the treasury Safe** (Sepolia). Names mint straight to the buyer, so
   the Safe no longer needs to receive ERC-1155 mints — but keeping the default
   fallback handler is harmless.
2. **Add the Roles Modifier (v2)** to the Safe via the Zodiac Safe App.
3. **Scope the role**:
   ```sh
   SAFE_ADDRESS=0x… ROLES_MODULE_ADDRESS=0x… MEMBER_ADDRESS=0x…(worker EOA) \
     pnpm exec tsx scripts/setup-zodiac-roles.ts
   ```
   Upload the emitted `zodiac-roles.json` in the Safe's Transaction Builder
   (URL printed by the script) and execute the batch.
4. **Fund the Safe** with the USDC/DAI float (auto-replenished per sale by the
   voucher's forward-at-mint). Keep only gas dust on the worker EOA.
5. **Configure the worker**: set `REGISTRAR_SAFE_ADDRESS` and
   `REGISTRAR_ROLES_MODULE_ADDRESS` (vars — they're public addresses). Both or
   neither; partial config throws at client construction.

## Deployed (Sepolia staging)

Deployed and E2E-validated 2026-07-17 — a full commit→register→deliver ran
through the role with the Safe as payer (7.994534 USDC pulled by the
registrar from the Safe), and forbidden calls (`register` with owner ≠ Safe,
`usdc.transfer`, `approve` to a non-registrar spender) revert.

| | Address |
| --- | --- |
| Treasury Safe (payer/avatar; owns the Roles modifier) | `0x6A15F8314393Fa816D2b8A9437fBDFd9cca9293C` |
| Roles v2 modifier | `0x250f3a370fA3Bb0704B9998B4F0A33057b248EbD` |
| Role key | `ens-crossmint-registrar` |

Worker env for this deployment:

```
REGISTRAR_SAFE_ADDRESS=0x6A15F8314393Fa816D2b8A9437fBDFd9cca9293C
REGISTRAR_ROLES_MODULE_ADDRESS=0x250f3a370fA3Bb0704B9998B4F0A33057b248EbD
```

E2E evidence (name `cmtestmrq8na19.eth`, delivered to the buyer):
commit `0xe78c7aa0ebdf0e01d5c00c7875893143373431981c85cb601af7dbc76c949a7c`,
register `0xf8fa09d51acedc32b03f3a419b1e056f27814df3d1b71d63344859f850fdeca0`,
delivery `0x1e33365ee5ac8d1c7f640ee3926fc5875c71c859921e6f30f742b87f6f252aae`.

Operational note: gas estimation immediately after a state-changing tx can
hit a lagging backend on load-balanced RPCs and revert spuriously
(`ModuleTransactionFailed` wrapping a stale-state inner failure). The
registration queue's retry/backoff absorbs this; the standalone script may
need a re-run.

## Incident response

- Suspected worker-key leak: Safe executes `revokeRole`/`assignRoles(member,
  [roleKey], [false])` — instant; then rotate `ETH_PRIVATE_KEY` and re-assign.
- Damage cap tuning: the per-approve cap (`APPROVE_CAP_*`) bounds the standing
  allowance an attacker can burn; keep it around a week of expected volume.
