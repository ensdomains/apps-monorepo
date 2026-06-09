# Privy (manager app) — architecture & production setup

The manager app uses **Privy** as a headless signer/auth vendor: social login
(Google + X) that produces a wallet + signer, plus external wallets (MetaMask /
EIP-6963 + WalletConnect). Privy is signer-only — ENS owns the connection layer
(wagmi) and the account layer (Rhinestone).

## Architecture

```
Social login (Privy, headless) ─┐
External wallet (EIP-6963 / WC) ─┤→ wagmi connector → useConnection() ← single source of truth
                                 │     (Privy: src/lib/privy/privy-connector.ts)
viem signer (src/lib/privy/privy-signer.ts, for the Privy embedded wallet)
                                 └→ Rhinestone HCA + Warp (gas-sponsored, owner-signed Intents)
```

- `usePrivySession` — headless auth hooks (Google/X), `getSigner`, `exportWallet`, `logout`.
- `usePrivyWagmiBridge` — installs the Privy signer on our connector and mirrors logout.
- `LoginModalProvider` / `useLoginModal` — the app-level "open login" entry point.

## Non-negotiable constraints (enforced)

1. **Never install `@privy-io/wagmi`.** It replaces our wagmi config (vendor
   takeover). CI check `pnpm --filter manager audit:wagmi-providers` (in
   `test.yml`) hard-fails on its presence; `WagmiBootAssertion` in
   `RootProviders.tsx` throws at boot. Use `src/lib/privy/privy-connector.ts`.
2. **Never enable Privy "smart wallets" or "global wallets."** Rhinestone is the
   account layer; ENS is the identity layer.
3. **Stay headless.** Never call Privy's `login()` modal — use the headless
   hooks. The one exception is key export (Privy's isolated dialog).

## Dev vs production: two Privy apps

OAuth providers never need our app URLs — Privy brokers OAuth server-side, so
Google/X only ever call back to `https://auth.privy.io/api/v1/oauth/callback`
(set once per provider). The only origin-aware allowlist is **Privy → Allowed
Origins**, and Privy refuses wildcards on shared hosting domains like
`*.ens-cf.workers.dev`. So we run **two Privy apps**:

| Env | Privy app | Allowed Origins | `VITE_PRIVY_APP_ID` |
|---|---|---|---|
| Local + PR previews | **dev app** | **empty** (any origin — Privy endorses this for dev) | committed in `.env` |
| Production | **prod app** | strict: the production domain only | Cloudflare **Production** build env var |

`VITE_*` vars are inlined at build time, and an env var present when Vite runs
takes precedence over `.env`. So setting `VITE_PRIVY_APP_ID` in Cloudflare's
**Production** environment overrides the committed dev id for prod builds, while
local + preview builds fall back to the dev id in `.env`. No code change needed.

## Per-app dashboard checklist (dashboard.privy.io)

- Login methods: **Google + X (Twitter)** only.
- Embedded wallets: create on login for users without wallets; `showWalletUIs` off.
- **Smart wallets: OFF. Global wallets: OFF.** Key-export quorum: not enabled.
- Allowed Origins: empty (dev app) / production domain (prod app).
- Google + X: **custom credentials** (Client ID + Secret pasted into Privy), with
  the provider's Callback/Redirect URI set to
  `https://auth.privy.io/api/v1/oauth/callback`. Do **not** add app origins to
  Google/X (not even JS origins) — only the Privy callback.

## HttpOnly cookies — current limitation

Privy stores its session in a cookie named `privy-token`. **"HttpOnly cookies"
is currently OFF**, which is required for the client-side reconnect-gap guards
(`useOnDisconnected`, `ConnectionCookieSync`, `WalletLifecycle`) — they read
`privy-token` via `document.cookie` to avoid bouncing a logged-in user during
the post-reload window where the connector's in-memory signer is being restored.

The SSR route guard (`dashboard.tsx` `beforeLoad` → `hasPrivySessionCookie`)
reads the cookie **server-side** and is already HttpOnly-safe.

**To turn HttpOnly ON for production** (recommended for security), the client-side
guards must be reworked to use `usePrivy().authenticated` instead of the cookie
(only valid where `PrivyProvider` is mounted — gate for e2e, which runs without
it). Tracked as a follow-up; until then keep HttpOnly OFF.

## Commercial

Privy's default per-monthly-active-user pricing is the wrong shape for ENS's
dormant-heavy scale. **Negotiate the enterprise per-transacting-wallet model in
writing before committing.**
