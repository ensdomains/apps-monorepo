# Rhinestone Team - Para Wallet Bundle Simulation Issue

## Problem
**"Bundle simulation failed"** error with Para wallet + wagmi-v2-connector, despite successful account creation and proper signatures.

## Key Finding
`walletClientToAccount()` from wagmi lacks `publicKey`, `source`, and `type` properties that Rhinestone SDK expects.

## Comparison

**❌ Original (wagmi-v2-connector):**
```javascript
wrappedAccount = {
  address: "0x3Fa4E105BcE2fA8DaB6d344AeF600FcA79ED94dF",
  _paraWalletId: "78eda64f-bf21-4ef0-8263-c7e344ae6481"
  // Missing: publicKey, source, type
}
```

**❌ After Manual Fix (still failing):**
```javascript
wrappedAccount = {
  address: "0x3fa4e105bce2fa8dab6d344aef600fca79ed94df",
  publicKey: "0x04fe119a1d7aa7d4b25e6eb587ed08d34d610f9fd8dddf40ca80e30d64425d45371cc545e6c79c804d4ac04f60b75403fc6ca73932ecad5de836c907249958a433",
  source: "custom",
  type: "local",
  _paraWalletId: "78eda64f-bf21-4ef0-8263-c7e344ae6481"
}
```

## Current Status
- ✅ **Fixed**: Added missing properties manually from `para.getWallets()`
- ✅ **Account Structure**: Now has all expected properties
- ✅ **Signatures**: Working correctly with v-byte adjustment
- ❌ **Bundle Simulation**: Still failing despite complete account structure

## Workaround Applied
```typescript
const wrappedAccount = wrapParaAccountForRhinestone({
  ...viemAccount,
  publicKey: wallet.publicKey as `0x${string}`,
  source: 'custom' as const,
  type: 'local' as const,
}, wallet.id);
```

## Questions
1. What causes bundle simulation failure with Para wallet + wagmi-v2-connector?
2. Are there known compatibility issues between Para and Rhinestone SDK?
3. What additional validation occurs during bundle simulation?

## Environment
- Rhinestone SDK: 1.0.2
- Para: web-sdk + wagmi-v2-connector
- Chain: Sepolia
- Gas sponsorship: Rhinestone Warp orchestrator (no ERC-4337 bundler)

---
**Status**: Bundle simulation failing with Para wallet + wagmi-v2-connector, even after adding missing account properties
