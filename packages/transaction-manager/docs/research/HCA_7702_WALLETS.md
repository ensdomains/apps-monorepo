# HCA Compatibility with EIP-7702 Wallets

**Date**: 2026-10-28
**Purpose**: Decide whether the apps can let wallets upgrade an EOA through EIP-7702, by checking whether an upgraded EOA can still own and drive a standalone HCA.

## Summary

An EOA upgraded with 7702 can own an HCA, provided three things hold. The first depends on the wallet, the other two on the delegate contract it installs:

1. **The wallet signs typed data with the EOA key.** `eth_signTypedData_v4` must return a plain 65-byte ECDSA signature.
2. **The delegate accepts ERC-1155 tokens.** Registration mints the name token to the owner. Once the EOA has code, that mint calls `onERC1155Received` on it.
3. **The delegate's `isValidSignature` accepts a raw ECDSA signature over the digest.** USDC permits are verified through ERC-1271 as soon as the owner has code.

| Wallet | Delegate | Signs with EOA key | ERC-1155 receiver | Raw-ECDSA ERC-1271 | Works | Evidence |
|---|---|---|---|---|---|---|
| Rainbow (7702) | Calibur `0x612373D7003d694220f7800EeaF8E3924c0951D3` | Yes | Yes | Yes | **Yes** | Mainnet-fork simulation + source |
| Uniswap extension (7702) | Calibur `0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00` | Yes | Yes | Yes | **Yes** | Mainnet `eth_call` with code override + source |
| MetaMask (7702) | `EIP7702StatelessDeleGator` `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b` | Yes | Yes | Yes | **Yes** | Source |
| Coinbase / Base app, legacy seed-phrase EOA (7702) | `EIP7702Proxy` → `CoinbaseSmartWallet` | Not confirmed | Yes | Yes (proxy's `ecrecover` fallback) | **Likely** | Source; wallet signing format unconfirmed |
| Coinbase Smart Wallet / Base Account (passkey) | None. A plain ERC-4337 contract account | No key exists | Yes | No | **No** | Source |
| Any other ERC-4337 account (SimpleAccount, LightAccount, Kernel, Nexus, Safe with its 4337 module, …) | None. A contract account at its own address | Signer key has a different address | Varies | No | **No** | Follows from the owner check |
| Safe or other multisig | None. A plain contract account | No key exists | n/a | No | **No** | apps-monorepo#1478 |

### The underlying rule

An account can own an HCA only if its address is also the address of a secp256k1 key, so that `ecrecover(signature) == owner`. Only EOAs satisfy this, with or without a 7702 delegation, because 7702 keeps the address.

Contract accounts that are not 7702 fail whatever their signing scheme:
- **Passkey-owned accounts and multisigs** have no secp256k1 key at all.
- **ERC-4337 accounts with an ECDSA owner** do have a key, but its signature recovers to the signer's address, not the account's. The wallet connects to the app as the account, so the HCA would be bound to an address no key recovers to. Making them work would need ERC-1271 on the owner, which the HCA doesn't do.

So being a 4337 account isn't the problem. The 7702 delegates above all implement `validateUserOp` and still pass, because the account address is the EOA's. Allowing 7702 doesn't change anything for non-7702 contract accounts, since they never were EOAs.

A 7702 wallet can still fail if it signs with a key registered on its delegate, such as a passkey or session key, instead of the EOA key. That is a property of the wallet and delegate, which is why unknown delegates need checking (see [Implications for enabling 7702 in the apps](#implications-for-enabling-7702-in-the-apps)).

## Why the owner key is all that matters for signatures

The HCA contracts never call ERC-1271 on the owner. Every owner check is an `ecrecover` against the owner address (paths are in `contracts-v2`):

| Check | Code |
|---|---|
| Session authorization (multi-chain enable) | `HCASmartSessionLib.validateMultiChainAuthorization` → `HCASignatureLib.recover` |
| Owner-signed intent through the HCA's ERC-1271 | `HCAOwnerAndSessionValidator.isValidSignatureWithSender`, 65-byte branch |
| Owner-signed UserOperation | `HCAOwnerAndSessionValidator.validateUserOp` → `HCASignatureLib.isValidUserOpSignature` |
| `executeByOwner`, `revokeSessions`, upgrades | `StandaloneSingleOwnerHCA.onlyOwner`, i.e. `msg.sender == owner` |
| Reverse-registrar adapters | `HCAAuthorizer._requireHCAForAccount` compares addresses only |

`HCASignatureLib.recover` accepts only a 65-byte, low-`s` signature. Wrapped formats such as ERC-6492, ERC-7739, or Coinbase's `SignatureWrapper` are rejected.

A 7702 account keeps its secp256k1 key and its address, so `ecrecover` behaves as it did before the upgrade. Calls the EOA makes, directly or through its delegate's batch `execute`, still arrive with the EOA as `msg.sender`.

## The client enforces the signature shape first

A wrapped signature never reaches the chain:

1. **Wallet wrapper.** `apps/manager/src/lib/smart-account/rhinestone.ts` builds the owner account with `walletClientToAccount` from `@rhinestone/sdk`. Its `signTypedData` passes straight through to `walletClient.signTypedData`, so the wallet's raw `eth_signTypedData_v4` result is what gets used.
2. **Session signing.** `experimental_signEnableSession` signs the `SmartSessionEmissary` / `MultiChainSession` typed data with `skipErc6492: true`. The SDK then puts the 20-byte zero validator address in front of the signature.
3. **Length check.** The SDK patch (`patches/@rhinestone%2Fsdk@1.8.0.patch`) requires that result to be exactly 85 bytes. Otherwise it throws `Standalone HCA owner authorization has an unexpected shape` (destination route) or `HCA funding session owner signature has an unexpected shape` (funding route).
4. **Funding permits.** `registration.hca.actors.ts` (`signFundingPermitActor`, `signDaiFundingPermitActor`) signs with `signTypedData` and runs the result through `parseSignature`.

A wallet that returns a wrapped signature therefore fails client-side with a recognisable error.

## Where the owner having code matters

Once the EOA has a delegation, its code is the 23-byte designator `0xef0100 || delegate`, so every `code.length > 0` check treats it as a contract.

### ERC-1155 mint at registration

`PermissionedRegistry` mints to the owner, and `ERC1155Singleton._updateWithAcceptanceCheck` then calls `onERC1155Received` on it. The session policy requires `registrant == owner` (`HCAOwnerAndSessionValidator._checkRegistrationExecutions`), and the HCA itself rejects NFTs, so a delegate that can't receive ERC-1155 tokens blocks registration. This also affects direct registrations without an HCA.

`contracts-v2/contracts/script/migrations/rpc.ts` already works around this for test keys whose delegates lack receiver hooks.

### Funding permits

- **USDC (FiatToken v2.2):** its `SignatureChecker` goes straight to ERC-1271 whenever the signer has code. The delegate's `isValidSignature` must accept the raw ECDSA permit signature. The simulation trace confirmed this path: `USDC.permit` → `SignatureChecker.isValidSignatureNow` → `staticcall` to the owner's `isValidSignature`.
- **Tokens using OpenZeppelin `ERC20Permit`:** `ecrecover` only, so unaffected.
- **Mainnet DAI (legacy permit):** `ecrecover` only, so unaffected.

## Per-wallet findings

### Rainbow

- **Delegate:** Rainbow's deployment of Uniswap's Calibur, `0x612373D7003d694220f7800EeaF8E3924c0951D3` (`RAINBOW_CALIBUR_CANONICAL_ADDRESS` in `@rainbow-me/delegation@0.3.2`). It is mainnet only; there is no code on Sepolia.
- **When it delegates:** behind a feature flag, lazily, at the first operation that needs it (`src/features/delegation/willDelegate.ts` in `rainbow-me/rainbow`).
- **Signing ignores the delegation:**
  - Mobile: `src/model/wallet.ts` `signTypedDataMessage` uses `eth-sig-util` `signTypedData` with `wallet.privateKey`. Ledger accounts go through `LedgerSigner.signTypedDataMessage`, which also returns plain ECDSA.
  - Extension: `src/core/keychain/index.ts` `signTypedData` uses viem `signTypedData({ privateKey })`.
- **Calibur (`Uniswap/calibur` `src/Calibur.sol`):**
  - Inherits Solady `Receiver`, so ERC-1155 callbacks are accepted.
  - `isValidSignature` checks a 64- or 65-byte signature against the root key (the EOA), as raw ECDSA over the digest or as an ERC-7739 nested personal sign.

### Uniswap extension

- **Delegate:** Uniswap's own Calibur deployment, `0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00`, deployed on mainnet and Sepolia with the same codehash on both. Its codehash differs from Rainbow's deployment, but the code size is the same (24504 bytes).
- **When it delegates:** the extension's `wallet_getCapabilities` (`packages/wallet/src/features/batchedTransactions/utils.ts` in `Uniswap/interface`) reports `ready` only when the user has consented to smart wallets and the account has no delegation yet. The delegate address comes from the Trading API's `latestDelegationAddress`. A wallet already delegated to Uniswap reports `supported`.
- **Signing ignores the delegation:** `NativeSigner._signTypedData` signs the EIP-712 hash with the account key (`Keyring.signHashForAddress`).
- **Contract checks:** `eth_call` on mainnet against a fresh address whose code was overridden with this deployment's runtime code:
  - `isValidSignature(digest, 65-byte owner signature)` returns `0x1626ba7e`; another key's signature returns `0xffffffff`.
  - `onERC1155Received` returns `0xf23a6e61` and `onERC1155BatchReceived` returns `0xbc197c81`.
  - Rainbow's deployment, as a control, also returns `0x1626ba7e`.
- **rdns:** `org.uniswap.app`. The Uniswap mobile app connects over WalletConnect and wasn't checked.

### MetaMask

- **Delegate:** `EIP7702StatelessDeleGator` (`MetaMask/delegation-framework`, `src/EIP7702/`), mainnet `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b`. Its documented signer is the EOA itself.
- **`_isValidSignature`:** returns the magic value when `ECDSA.recover(hash, sig) == address(this)`.
- **Receivers:** `EIP7702DeleGatorCore` implements `onERC721Received`, `onERC1155Received` and `onERC1155BatchReceived`. Their `onlyProxy` check passes under 7702.
- **Gas caveat:** in smart-account mode MetaMask wraps owner transactions in its delegation redemption, and a forwarded gas estimate can run out two `delegatecall`s deep. `REVOKE_SESSIONS_GAS_LIMIT` in `packages/smart-account/src/providers/rhinestone/revoke-sessions.ts` exists because of this. Expect the same on other direct owner calls that rely on estimation.

### Coinbase / Base app

- **Two account kinds:**
  - **Base Account / Coinbase Smart Wallet:** passkey-owned ERC-4337 contract accounts, the default for new Base app accounts. They have no EOA key. `eth_signTypedData_v4` returns an ABI-encoded `SignatureWrapper` carrying WebAuthn data, wrapped in ERC-6492 while the account isn't deployed. **Not supported.**
  - **Legacy seed-phrase EOAs:** Coinbase delegates them transparently to `EIP7702Proxy` (`base/eip-7702-proxy`), an ERC-1967 proxy whose implementation is `CoinbaseSmartWallet`.
- **`EIP7702Proxy.isValidSignature`:** tries the implementation first; a 65-byte signature fails there because it doesn't decode as a `SignatureWrapper`. It then falls back to `ECDSA.tryRecover(hash, sig) == address(this)`.
- **Receivers:** handled by Solady `Receiver` through `CoinbaseSmartWallet`, and through `DefaultReceiver` before the account is initialised.
- **Unconfirmed:** what the Coinbase extension or Base app returns from `eth_signTypedData_v4` for an upgraded legacy EOA. The proxy's `ecrecover` fallback exists to keep plain EOA signatures valid, which suggests the wallet keeps producing them. Confirm on a live wallet before relying on it.
- **How Coinbase users connect:** the manager's wagmi config (`apps/manager/src/lib/wagmi.ts`) has no Coinbase Wallet SDK or Base Account connector. Coinbase users arrive through the injected extension (EIP-6963, `com.coinbase.wallet`) or through the Base app over WalletConnect.

## Mainnet-fork simulation (Rainbow)

Run on a local `anvil --fork-url` of mainnet at block 26290564, against the mainnet HCA deployment from `contracts-v2/contracts/deployments/mainnet`:

| Contract | Address |
|---|---|
| `StandaloneHCAFactory` | `0x742bf21897a78e2c98cc5f5c5473a370a081e561` |
| `StandaloneHCAImplementation` (`ens-standalone-hca.1.1.0`) | `0x116f462fa078ec0009e9b25dcd60309e70aac4f4` |
| `HCAOwnerAndSessionValidator` | `0xa818428ed2f3f949bdc71b8a15bdd7b5d27ce938` |
| `ETHRegistrar` | `0xd6d8369e55c94ae8afa714e6cf7ab5be54d5cc81` |
| `ETHRegistry` | `0xf60aba43e1f7f3dab1186ff03b561401c9df85e2` |
| `INTENT_EXECUTOR` | `0x00000000005aD9ce1f5035FD62CA96CEf16AdAAF` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |

| # | Check | Result |
|---|---|---|
| 0 | Fresh EOA delegated to Rainbow's Calibur with a type-4 transaction | Code became `0xef0100612373d7…`; HCA deployed through the factory, and `authorizedOwnerOf` returns the delegated EOA |
| 1 | `HCA.isValidSignature(digest, zero-prefix ‖ 65-byte owner signature)` called from `INTENT_EXECUTOR` | `0x1626ba7e`; a signature from another key returns `0xffffffff` |
| 2 | USDC `permit` signed as EIP-712 typed data with the raw key | USDC made a `staticcall` to the owner's `isValidSignature`, Calibur returned `0x1626ba7e`, and `Approval` was emitted |
| 3 | Owner sent a transaction to itself calling Calibur `execute(BatchedCall)`, which called `HCA.executeByOwner([permit, transferFrom, commit])` | Accepted as the owner; 25 USDC moved into the HCA; commitment recorded |
| 4 | Same batching, `executeByOwner([approve, register(owner = delegated EOA)])` | `onERC1155Received` on the delegated EOA returned `0xf23a6e61`; `ownerOf` is the delegated EOA, `balanceOf` = 1 |

The full Rhinestone session-enable envelope wasn't built. Its owner check runs the same `HCASignatureLib.recover` as check 1, which doesn't look at the owner's code. The Rainbow app itself wasn't driven; `cast wallet sign` stood in for it, matching how its source signs.

### Reproduction

```sh
anvil --fork-url <mainnet-rpc> --port 8645 &
export ETH_RPC_URL=http://127.0.0.1:8645
CAL=0x612373D7003d694220f7800EeaF8E3924c0951D3
F=0x742bf21897a78e2c98cc5f5c5473a370a081e561
I=0x116f462fa078ec0009e9b25dcd60309e70aac4f4
IE=0x00000000005aD9ce1f5035FD62CA96CEf16AdAAF
U=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
R=0xd6d8369e55c94ae8afa714e6cf7ab5be54d5cc81

# Fresh owner, delegated to the wallet's delegate (swap CAL to test another wallet)
cast wallet new --json > owner.json
PK=$(jq -r '.[0].private_key' owner.json); O=$(jq -r '.[0].address' owner.json)
cast rpc anvil_setBalance $O 0x8AC7230489E80000
cast send $O --auth $CAL --private-key $PK
cast code $O                                   # 0xef0100 || delegate

# HCA for the delegated owner
H=$(cast call $F "deploy(address,address,uint256)(address)" $O $I 0 --from $O)
cast send $F "deploy(address,address,uint256)" $O $I 0 --private-key $PK

# Check 1: owner signature through the HCA's ERC-1271
D=$(cast keccak test); SIG=$(cast wallet sign --no-hash $D --private-key $PK)
cast call $H "isValidSignature(bytes32,bytes)(bytes4)" $D 0x0000000000000000000000000000000000000000${SIG:2} --from $IE

# Check 2: sign an EIP-2612 Permit (owner → HCA) with `cast wallet sign --data --from-file permit.json`,
# then trace `permit` and look for the staticcall to the owner's isValidSignature
cast call $U "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)" $O $H <value> <deadline> <v> <r> <s> --from $H --trace

# Checks 3 and 4: fund the owner with USDC (FiatToken balances live at mapping slot 9)
cast rpc anvil_setStorageAt $U $(cast index address $O 9) $(cast to-uint256 1000000000)
# then send HCA.executeByOwner batches through the delegate's batch entry point
# (Calibur: execute(((address,uint256,bytes)[],bool)) sent to the owner itself):
#   batch 1: [permit, transferFrom(owner → HCA), commit]
#   wait out MIN_COMMITMENT_AGE (evm_increaseTime + evm_mine)
#   batch 2: [USDC.approve(registrar, price), register(label, owner, ...)]
# and `cast run <tx>` to confirm onERC1155Received returns 0xf23a6e61
```

## Implications for enabling 7702 in the apps

The apps currently never trigger an upgrade: only EIP-5792 `atomic.status === 'supported'` counts, and `ready` is treated as unsupported (`getAtomicBatchSupport`, `useAtomicBatchSupport`, `AtomicBatchUnsupportedError`). Accepting `ready` lets the wallet pick and install its delegate, so the HCA works only if that delegate meets the three conditions above.

1. **Verified delegates:** Calibur (both Rainbow's and Uniswap's deployments) and MetaMask's `EIP7702StatelessDeleGator` meet them. Coinbase's `EIP7702Proxy` meets them on-chain.
2. **Unknown delegates:** a wallet can install any delegate. To gate on known-good delegates, read the account's code and compare the address after `0xef0100` with an allowlist.
3. **Contract accounts that are not 7702:** non-empty code that doesn't start with `0xef0100` means a contract wallet that can't own an HCA: any ERC-4337 account, a Safe, or another multisig. This generalises the Safe-only detection from apps-monorepo#1478. An undeployed (counterfactual) 4337 account has no code yet, so the code check misses it. If its wallet returns a wrapped signature (ERC-6492 or similar), the SDK's "unexpected shape" error catches it at signing, and that error could open the same dialog instead of a generic failure. If the wallet instead returns a bare 65-byte signature from the signer key, the shape check passes and validation later fails with `InvalidSigner`, because the signature recovers to the signer, not the account.
4. **Gas estimation:** wallets that wrap owner transactions in their delegate, as MetaMask does, may need fixed gas limits on direct owner calls (see `REVOKE_SESSIONS_GAS_LIMIT`).
5. **Coinbase legacy EOAs:** confirm on a live wallet that `eth_signTypedData_v4` returns 65 bytes after the account is upgraded.
6. **Testnet coverage:** Rainbow's Calibur has no Sepolia deployment, so testnet runs won't exercise it. Use a mainnet fork, as above.
