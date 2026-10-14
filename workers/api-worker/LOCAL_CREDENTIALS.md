# Local VAPID and JWT generation

Run from `workers/api-worker` with Node.js (no npm packages or network required):

```sh
node scripts/generate-credentials.mjs
```

This creates independent mainnet and Sepolia candidate bundles in
`.local-secrets/mainnet.json` and `.local-secrets/sepolia.json`. The directory is
git-ignored and mode `0700`; files are mode `0600`. The generator refuses an
existing directory and never prints secret material. Keep these files in your
password manager/secure credential storage before moving between worktrees;
git will not back them up. No Cloudflare credentials are changed by this command.

Each bundle contains:

- `VAPID_PUBLIC_KEY`: base64url of the uncompressed P-256 public point, suitable
  for Wrangler `vars` and the browser's `applicationServerKey`.
- `VAPID_PRIVATE_KEY`: base64url of the 32-byte P-256 private scalar, stored as a
  Worker secret. Never put it in `vars`, a browser bundle, git, or PR comments.
- `JWT_SECRET`: a separate 64-byte cryptographically random value, base64url
  encoded, suitable for the existing HS256 authentication implementation.

Key generation uses only Node's `node:crypto` (`generateKeyPairSync` and
`randomBytes`) and local filesystem APIs. There is no third-party key generator
and no network client. The existing Web Push delivery library is unchanged.
Inspect this small script directly before running it on a trusted machine.

Test key encoding/matching, environment independence, file permissions, and
overwrite refusal with:

```sh
node --test --test-isolation=none scripts/generate-credentials.node-test.mjs
```

## Apply each environment's pair together

The generated mainnet public key is already configured in
`env.mainnet.vars.VAPID_PUBLIC_KEY`; provision its matching private key as the
mainnet `VAPID_PRIVATE_KEY` secret before testing push. Use the Sepolia pair in
the top-level public var and default Worker's private secret when rotating
Sepolia. The existing Sepolia public var is unchanged. `VAPID_SUBJECT` remains
the public contact URI (`mailto:noreply@notifications.ens.domains`), not the browser
website origin, and is explicitly configured on mainnet. Do not mix public and
private keys between bundles.

Provision the new JWT secret separately per Worker. The current configuration's
required-secret lists identify the other credentials you already have;
`ETH_PRIVATE_KEY` and `SEPOLIA_RPC_URL` remain Sepolia-only, and
`EMAIL_FROM_ADDRESS` is a var in both environments.

**Rotation requires a coordinated rollout:** existing browser push subscriptions
are tied to their original application server key. Disable/unsubscribe and
re-enable notifications in the browser to create subscriptions using the new
public key. Simply replacing the private key will not migrate old subscriptions.
Do not replace the deployed Sepolia public var before its matching private key
and resubscription plan are ready. Existing JWTs and pending email OTP digests
will become invalid when their JWT secret changes; users must sign in again and
request fresh email verification codes. No existing subscriptions or data are
deleted by these changes.

## Push registration provenance

New or updated push subscriptions store `origin` and `vapidKeyId` alongside
their existing encryption keys and expiry in `user_channels.data` (JSONB), so no
database migration is required. `origin` is the normalized browser `Origin`
header or `null` when absent/invalid. `vapidKeyId` is a 22-character base64url
encoding of the first 16 bytes of SHA-256 of the decoded **server public key at
registration**. The full public key stays in configuration; calculating its ID
uses the same algorithm. Hashing runs only during registration/update using
built-in Web Crypto. This is diagnostic metadata, not proof of the browser's
actual key association or a security credential. Existing rows without metadata
(or with the older full-key field) remain readable and use the compact format
when next registered/updated; no database migration or bulk rewrite is required.

This metadata helps diagnose environment/rotation mistakes. It is not an
authorization check, a delivery destination, or a custom VAPID JWT claim. VAPID's
`aud` identifies the push service origin, not the subscribing website. Clients
can forge `Origin`; a registration racing with rotation can also snapshot a key
different from the browser's subscription key. Sending/validating the browser's
`subscription.options.applicationServerKey` would require a later frontend/API
change; the Manager app is unchanged here.

References: [Node crypto](https://nodejs.org/api/crypto.html),
[VAPID specification](https://www.rfc-editor.org/rfc/rfc8292.html).
