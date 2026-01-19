# Smart Account Architecture Refactor

## TL;DR

**Unified external API: `zerodev | rhinestone`**

Internally, `zerodev` handles both wallet types:
- External wallets → ZeroDev Kernel with sessions
- Para-embedded wallets → Simple account (no sessions, Para signature adjustment)

```
Before: pimlico | kernel | rhinestone  (3 options, confusing)
After:  zerodev | rhinestone           (2 options, clear)
```

---

## Problem Statement

Current architecture had 3 smart account types that were confusingly named:

| Old Name | What it actually is | Sessions | Decision |
|----------|---------------------|----------|----------|
| `pimlico` | ZeroDev Kernel for Para wallets | No | **KEEP internally** |
| `kernel` | ZeroDev Kernel for external wallets | Yes | **RENAME** → `zerodev` |
| `rhinestone` | Chain abstraction | N/A | Keep as-is |

Both `pimlico` and `kernel` use ZeroDev Kernel accounts with Pimlico bundler - the only difference is sessions support.

---

## Final Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Bundler Layer                         │
│                      (Pimlico)                           │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
        ▼                                   ▼
┌───────────────────┐             ┌───────────────────┐
│     ZeroDev       │             │    Rhinestone     │
│  (unified type)   │             │ (chain abstraction)│
├───────────────────┤             └───────────────────┘
│ External wallets: │
│   KernelAccount   │
│   (with sessions) │
├───────────────────┤
│ Para-embedded:    │
│   SmartAccount    │
│   (no sessions)   │
└───────────────────┘
```

### Type Changes

```typescript
// External API (simplified)
type SmartAccountProvider = 'zerodev' | 'rhinestone'

// Signer type (unified)
interface ZeroDevSigner {
  type: 'zerodev'
  account: KernelAccountClient | SmartAccountClient  // Supports both
  config: SmartAccountConfig & {
    isSessionClient?: boolean
  }
}
```

---

## Implementation Summary

### Deleted
- [x] `packages/transaction-manager/src/actors/plimlico-transport.actor.ts`

### Renamed
- [x] `KernelSigner` → `ZeroDevSigner` in `signer.types.ts`
- [x] `kernel-transport.actor.ts` → `zerodev-transport.actor.ts`
- [x] `pimlico` and `kernel` transaction types → unified `zerodev`

### Updated
- [x] `types.ts` - Removed `PimlicoAccountState` and `KernelAccountState`, added `ZeroDevAccountState`
- [x] `SmartAccountContext.tsx` - Handles both wallet types internally, exposes unified `zerodev` externally
- [x] `signer.types.ts` - `ZeroDevSigner` accepts both `KernelAccountClient` and `SmartAccountClient`
- [x] `transaction.types.ts` - Added `ZeroDevTransactionRequest`, removed `pimlico`/`kernel` types
- [x] `transaction.machine.ts` - Routes `zerodev` to unified transport actor
- [x] `resolver.actors.ts`, `primaryName.actors.ts`, `registration.actors.ts` - Use `zerodev` type

### Kept (Internal)
- [x] `pimlico.ts` - Still used internally for Para-embedded wallets (uses `zerodev` signer type)

### Added
- [x] `kernel.test.ts` - Unit tests for ZeroDev account initialization
- [x] `vitest.config.ts` - Separate vitest config for isolated test execution

---

## Key Files

### External API (apps/manager)
```
apps/manager/src/lib/smart-account/
├── zerodev/
│   ├── kernel.ts           # External wallets (KernelAccountClient, sessions)
│   ├── kernel.test.ts      # Unit tests
│   └── sessions/           # Session management
├── pimlico.ts              # Para-embedded wallets (SmartAccountClient, no sessions)
├── rhinestone.ts           # Chain abstraction
├── types.ts                # ZeroDevAccountState (unified)
└── SmartAccountContext.tsx # Routes to correct initializer based on wallet type
```

### Transaction Manager
```
packages/transaction-manager/src/
├── types/
│   ├── signer.types.ts     # ZeroDevSigner (unified)
│   └── transaction.types.ts # ZeroDevTransactionRequest
├── actors/
│   ├── zerodev-transport.actor.ts  # Handles both client types
│   └── rhinestone-transport.actor.ts
└── machines/
    └── transaction.machine.ts      # Routes 'zerodev' type
```

---

## How It Works

### SmartAccountContext Logic

```typescript
// In SmartAccountContext.tsx
if (walletSource === 'external-wallet') {
  // External wallet → ZeroDev Kernel with smart sessions
  const result = await initializeZeroDevAccount({ walletClient, accountType })
  setEcdsaValidator(result.ecdsaValidator)  // For session creation
  setIsParaEmbedded(false)
} else if (walletSource === 'para-embedded') {
  // Para-embedded → Simple account without sessions
  const result = await initializePimlicoAccount({ walletSource, paraClient, accountType })
  setEcdsaValidator(null)  // No sessions for Para
  setIsParaEmbedded(true)
}

// Both create unified signer:
const signer: Signer = {
  type: 'zerodev',  // Always 'zerodev' externally
  account: client,   // KernelAccountClient or SmartAccountClient
  config: { ... }
}
```

### Transaction Routing

```typescript
// transaction.machine.ts
zerodev: {
  invoke: {
    src: 'zerodevTransportActor',
    // Handles both KernelAccountClient and SmartAccountClient
  }
}
```

---

## Benefits

1. **Simpler external API**: Only 2 choices (`zerodev` | `rhinestone`)
2. **Para wallet support preserved**: Para-embedded wallets continue to work
3. **Sessions where available**: External wallets get smart sessions UX
4. **Unified transaction handling**: Single transport actor for all ZeroDev accounts
5. **Type-safe**: `ZeroDevSigner.account` accepts both client types
