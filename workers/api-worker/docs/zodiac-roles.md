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
| ETHRegistrar      | `register`              | owner == Safe · duration ≤ cap · token ∈ {USDC, DAI} |
| USDC, DAI         | `approve`               | spender == registrar · amount ≤ cap              |
| Registry (1155)   | `safeTransferFrom`      | from == Safe                                     |
| VerifiableFactory | `deployProxy`           | — (resolver deploys)                             |
| Voucher           | `burn`                  | —                                                |

No value sends, no delegatecall, no token transfers, no arbitrary approvals.
`owner == Safe` means even junk registrations by an attacker land in the Safe
and are recoverable by the admins.

## Runbook

1. **Create the treasury Safe** (Sepolia). Keep the default fallback handler —
   the Safe must accept the registrar's ERC-1155 name mints.
2. **Add the Roles Modifier (v2)** to the Safe via the Zodiac Safe App.
3. **Scope the role**:
   ```sh
   SAFE_ADDRESS=0x… ROLES_MODULE_ADDRESS=0x… MEMBER_ADDRESS=0x…(worker EOA) \
     pnpm exec tsx scripts/setup-zodiac-roles.ts
   ```
   Upload the emitted `zodiac-roles.json` in the Safe's Transaction Builder
   (URL printed by the script) and execute the batch.
4. **Fund the Safe** with the USDC/DAI float. Keep only gas dust on the worker
   EOA. Sweep voucher-contract proceeds to the Safe (`withdrawToken`) — same
   asset in, same asset out, no swaps.
5. **Grant the voucher's `BURNER_ROLE` to the Safe** (voucher admin action in
   web-contracts), so post-delivery burns run through the role too.
6. **Configure the worker**: set `REGISTRAR_SAFE_ADDRESS` and
   `REGISTRAR_ROLES_MODULE_ADDRESS` (vars — they're public addresses). Both or
   neither; partial config throws at client construction.

## Incident response

- Suspected worker-key leak: Safe executes `revokeRole`/`assignRoles(member,
  [roleKey], [false])` — instant; then rotate `ETH_PRIVATE_KEY` and re-assign.
- Damage cap tuning: the per-approve cap (`APPROVE_CAP_*`) bounds the standing
  allowance an attacker can burn; keep it around a week of expected volume.
