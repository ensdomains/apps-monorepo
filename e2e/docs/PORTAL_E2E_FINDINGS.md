# Portal E2E Registration Test — Findings & Fixes

## Background

The goal was to run an E2E test for the portal app's ENS name registration flow using `@ensdomains/headless-web3-provider` as a programmatic wallet against a local Anvil fork of Sepolia. The registration flow involves four on-chain transactions: deploy resolver proxy → commit → approve USDC → register.

The test consistently failed with an opaque error: `"Response has no error or result for request with method eth_sendTransaction"`. This document covers the three distinct bugs discovered during investigation and their fixes.

---

## Bug 1: Error Swallowing in headless-web3-provider

### Finding

The `@ensdomains/headless-web3-provider@1.0.8` library has a bug in two middleware functions where errors are caught and logged but never propagated back to the JSON-RPC response.

In `createTransactionMiddleware` (`dist/index.js`):

```js
// BEFORE — error is swallowed
try {
  res.result = await walletClient.sendTransaction(viemTx);
} catch (e) {
  console.error("Error submitting transaction", e, viemTx);
  // res.error is never set → the JSON-RPC engine returns { result: undefined, error: undefined }
  // → the caller sees "Response has no error or result"
}
```

The same pattern exists in `createPassThroughMiddleware`:

```js
res.result = await transport.request(req).catch((e) => {
  console.error("Error!!!", e);
  // returns undefined → res.result = undefined, no res.error
});
```

### Impact

Every transaction or RPC error was silently swallowed. The caller received `{ result: undefined, error: undefined }`, which the `@metamask/json-rpc-engine` interprets as `"Response has no error or result"`. This made debugging impossible because the real error was hidden.

### Fix

Applied via `pnpm patch` — both catch paths now set `res.error`:

```js
res.error = {
  code: -32603,
  message: e?.message || "Transaction failed",
  data: { originalError: String(e) }
};
```

---

## Bug 2: `formatTransaction` Used on Request Params Instead of Response Data

### Finding

The `createTransactionMiddleware` in headless-web3-provider uses viem's `formatTransaction()` to convert the `eth_sendTransaction` JSON-RPC params into a format suitable for `walletClient.sendTransaction()`:

```js
const jsonRpcTx = req.params[0];             // JSON-RPC request params
const viemTx = formatTransaction(jsonRpcTx);  // ← WRONG
walletClient.sendTransaction(viemTx);
```

However, viem's `formatTransaction` is designed for formatting **RPC response** transactions (i.e., transactions already included in a block, with fields like `blockHash`, `blockNumber`, `transactionIndex`, etc.). When applied to **RPC request** parameters (which only have `to`, `data`, `value`, `gas`, etc.), it produces an object where all gas-related fields are `undefined` and the field mapping is incorrect.

Specifically, `formatTransaction`:

- Expects `input` for calldata (response format) but the request uses `data`
- Produces `undefined` for `gas`, `maxFeePerGas`, `maxPriorityFeePerGas` because it expects hex-encoded block-context fields
- Passes through fields like `blockHash` that have no meaning in a send context

When `walletClient.sendTransaction()` receives this malformed object, its internal `eth_estimateGas` call fails because the parameters are wrong.

### Impact

Every `eth_sendTransaction` from the dapp produced a gas estimation failure inside the headless provider's internal walletClient, even though the underlying contract calls were perfectly valid.

### Fix

Replaced `formatTransaction(jsonRpcTx)` with a direct mapping from JSON-RPC `eth_sendTransaction` params to the format viem's `walletClient.sendTransaction()` expects:

```js
const viemTx = {
  to: jsonRpcTx.to,
  data: jsonRpcTx.data || jsonRpcTx.input,
  value: jsonRpcTx.value ? BigInt(jsonRpcTx.value) : undefined,
  gas: jsonRpcTx.gas ? BigInt(jsonRpcTx.gas) : undefined,
  gasPrice: jsonRpcTx.gasPrice ? BigInt(jsonRpcTx.gasPrice) : undefined,
  maxFeePerGas: jsonRpcTx.maxFeePerGas ? BigInt(jsonRpcTx.maxFeePerGas) : undefined,
  maxPriorityFeePerGas: jsonRpcTx.maxPriorityFeePerGas ? BigInt(jsonRpcTx.maxPriorityFeePerGas) : undefined,
  nonce: jsonRpcTx.nonce != null ? Number(jsonRpcTx.nonce) : undefined,
};
```

The `formatTransaction` import was removed entirely. Both Bug 1 and Bug 2 fixes are combined in a single pnpm patch at `patches/@ensdomains__headless-web3-provider.patch`.

---

## Bug 3: Headless Provider Transport Pointing to Public Sepolia Instead of Local Fork

### Finding

The test fixture configured the headless wallet with `chains: [sepolia]` (viem's built-in chain definition):

```ts
const wallet = await injectHeadlessWeb3Provider({
  page,
  privateKeys,
  chains: [sepolia],  // ← uses public Sepolia RPC URLs
})
```

The headless provider's `getChainTransport()` method creates an HTTP transport from `chain.rpcUrls.default.http[0]`. The built-in `sepolia` chain definition points to public Sepolia RPC endpoints (e.g., `https://rpc.sepolia.org`).

This means the provider's internal `walletClient` — which handles gas estimation and transaction submission — was sending requests to **public Sepolia**, not the local Anvil fork at `localhost:8545`.

The result: gas estimation failed because the test account `0xf39F…2266` (Anvil's default) has negligible ETH on real Sepolia, producing the cryptic error `"gas required exceeds allowance (2331)"` where 2331 was the maximum gas the account's real Sepolia balance could cover.

### Impact

All transactions failed at the gas estimation stage inside the headless provider, despite the portal app correctly targeting the local Anvil fork for its own RPC calls.

### Fix

Created a `localSepolia` chain override in `e2e/fixtures/portal.fixture.ts` that points at the Anvil fork:

```ts
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'
const localSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [ANVIL_RPC_URL] },
  },
} as const
```

Then passed `chains: [localSepolia]` to `injectHeadlessWeb3Provider`.

---

## Bug 4: Contract Code at Test Account Address on Sepolia

### Finding

After fixing Bugs 1–3, the first three transactions (deploy proxy, commit, approve) succeeded, but the final `register` call reverted with:

```
custom error 0x57f447ce: 000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266
```

Decoding `0x57f447ce` → `ERC1155InvalidReceiver(address)`.

Investigation revealed that the well-known Anvil default account `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` **has contract code deployed on real Sepolia**:

```
0xef01004c7218f68f95eec39d7d7939b819837156a11961
```

The `0xef01` prefix indicates an EOF (EVM Object Format) contract. Someone deployed a contract at this address on Sepolia (it's a well-known key, so anyone can deploy to it).

When the ENS registrar mints the name NFT (ERC1155) to this address, OpenZeppelin's `_safeMint` checks `extcodesize > 0` and finds code, so it calls `onERC1155Received`. The EOF contract doesn't implement this interface, causing the `ERC1155InvalidReceiver` revert.

On a standard Anvil instance (no fork), this address has no code and is a plain EOA. The problem only manifests when forking a public testnet where someone has deployed code to the Anvil default addresses.

### Impact

The final registration transaction always reverted when using the Anvil default mnemonic on a Sepolia fork.

### Fix

Added an `anvil_setCode` call to the fund script (`e2e/infra/scripts/fund-account.sh`) that clears any contract code at the test address before funding:

```bash
cast rpc anvil_setCode "$ADDRESS" "0x" --rpc-url "$RPC_URL" > /dev/null
```

This makes the address a plain EOA again on the fork, allowing ERC1155 `_safeMint` to succeed.

---

## Summary of Files Changed

- `patches/@ensdomains__headless-web3-provider.patch` — Fixes error propagation (Bug 1) + replaces `formatTransaction` with direct param mapping (Bug 2)
- `e2e/fixtures/playwright.portal.fixture.ts` — Uses `localSepolia` with Anvil RPC URL instead of public Sepolia (Bug 3)
- `e2e/infra/scripts/fund-account.sh` — Clears contract code at test account via `anvil_setCode` (Bug 4)

## Test Result

After all fixes, the portal registration E2E test passes in ~5.7s with all four transactions completing successfully:

```
✓ registration › registers a name via headless wallet and stablecoin payment (5.7s)
  tx-1: deploy resolver proxy → success
  tx-2: commit                → success
  tx-3: USDC approval         → success
  tx-4: register              → success
```
