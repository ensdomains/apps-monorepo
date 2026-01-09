# Web3 and Blockchain Patterns

Guidelines for interacting with smart contracts, working with ENS, and using wagmi/viem in the Portal app.

> **See also**: [README.md](./README.md) for core principles | [STATE-AND-DATA.md](./STATE-AND-DATA.md) for error handling with neverthrow.

## Table of Contents

- [Contract Interaction Patterns](#contract-interaction-patterns)
- [Safe Client Access](#safe-client-access)
- [Working with ENS](#working-with-ens)
- [BigInt Handling](#bigint-handling)
- [Address Type Safety](#address-type-safety)

## Web3 & Blockchain Patterns

### Contract Interaction Patterns

The codebase follows specific patterns for creating contract interaction helpers. There are two main patterns depending on where the helper lives:

#### Pattern 1: Simple Request Builders (App/Package Level)

For app-specific or package-level contract interactions, create pure functions that return typed request objects:

```typescript
// packages/l2-primary/src/utils/setReverseName.ts

// 1. Define the return type (union if multiple variants)
export type SetReverseNameRequest =
  | {
      address: Address
      abi: typeof l2ReverseRegistrarSetNameForAddrSnippet
      functionName: 'setNameForAddr'
      args: readonly [address: Address, name: string]
    }
  | {
      address: Address
      abi: typeof l2ReverseRegistrarSetNameSnippet
      functionName: 'setName'
      args: readonly [name: string]
    }

// 2. Create the builder function with JSDoc
/**
 * Creates contract call parameters for setting reverse resolution
 * @param params.name - The ENS name to set
 * @param params.reverseRegistrarChainId - The chain ID for the reverse registrar
 * @param params.chain - Optional chain object to determine network
 * @param params.targetAddress - Optional address to set the name for
 * @returns Contract parameters to pass to writeContract
 * @throws Error if no registrar is found for the coin type
 */
export function createSetReverseNameRequest({
  name,
  reverseRegistrarChainId,
  chain,
  targetAddress,
}: {
  name: string
  reverseRegistrarChainId: ReverseRegistrarChainId
  chain?: Chain
  targetAddress?: Address
}): SetReverseNameRequest {
  const network = resolveNetworkFromChain(chain)
  const registrarAddress = getRegistrarAddress(reverseRegistrarChainId, network)
  
  if (!registrarAddress) {
    throw new Error(
      `No registrar found for coin type ${reverseRegistrarChainId} on ${network}`
    )
  }
  
  if (targetAddress) {
    return {
      address: registrarAddress,
      abi: l2ReverseRegistrarSetNameForAddrSnippet,
      functionName: 'setNameForAddr',
      args: [targetAddress, name] as const,
    }
  }
  
  return {
    address: registrarAddress,
    abi: l2ReverseRegistrarSetNameSnippet,
    functionName: 'setName',
    args: [name] as const,
  }
}
```

**Key characteristics:**
- Pure function that returns typed request object
- Returns `{ address, abi, functionName, args }`
- Throws errors for invalid states
- JSDoc explains purpose and caller responsibilities
- Uses `as const` for args to preserve tuple types

#### Pattern 2: ENSjs Package Pattern

For the `@ensdomains/ensjs` package, follow this two-part pattern for writes and single function for reads:

**Read Operations:**

```typescript
// packages/ensjs/src/functions/public/getNameRegistry.ts

// 1. Export type aliases
export type GetNameRegistryAddressParameters = {
  /** The parent registry address */
  registryAddress: Address
  /** The label to look up */
  label: string
}

export type GetNameRegistryAddressReturnType = Address

export type GetNameRegistryAddressErrorType = ReadContractErrorType

// 2. Create the async function
/**
 * Gets the subregistry address from a parent registry.
 *
 * @param client - {@link Client}
 * @param parameters - {@link GetNameRegistryAddressParameters}
 * @returns Address of the subregistry. {@link GetNameRegistryAddressReturnType}
 *
 * @example
 * import { createPublicClient, http } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { getNameRegistryAddress } from '@ensdomains/ensjs/public'
 *
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: http(),
 * })
 * const address = await getNameRegistryAddress(client, {
 *   registryAddress: '0x...',
 *   label: 'flo',
 * })
 */
export async function getNameRegistryAddress(
  client: Client,
  { registryAddress, label }: GetNameRegistryAddressParameters
): Promise<GetNameRegistryAddressReturnType> {
  ASSERT_NO_TYPE_ERROR(client)
  
  const readContractAction = getAction(client, readContract, 'readContract')
  
  return readContractAction({
    address: registryAddress,
    abi: registryGetSubregistrySnippet,
    functionName: 'getSubregistry',
    args: [label],
  })
}
```

**Write Operations (Two-Part Pattern):**

```typescript
// packages/ensjs/src/functions/wallet/deploySubregistry.ts

// ================================
// Part 1: Write Parameters
// ================================

// 1. Export parameter types
export type DeploySubregistryWriteParametersParameters = {
  factoryAddress: Address
  implAddress: Address
  adminAddress?: Address
  roleBitmap?: bigint
  salt?: bigint
}

export type DeploySubregistryWriteParametersReturnType = ReturnType<
  typeof deploySubregistryWriteParameters
>

export type DeploySubregistryWriteParametersErrorType = 
  EncodeFunctionDataErrorType

// 2. Create the write parameters function
export const deploySubregistryWriteParameters = <
  chain extends Chain,
  account extends Account,
>(
  client: Client<Transport, chain, account>,
  {
    factoryAddress,
    implAddress,
    adminAddress,
    roleBitmap = DEFAULT_ROLE_BITMAP,
    salt = DEFAULT_SALT,
  }: DeploySubregistryWriteParametersParameters
) => {
  ASSERT_NO_TYPE_ERROR(client)
  
  const finalAdminAddress = adminAddress ?? client.account.address
  
  const callData = encodeFunctionData({
    abi: subregistryInitializeSnippet,
    functionName: 'initialize',
    args: [finalAdminAddress, roleBitmap],
  })
  
  return {
    address: factoryAddress,
    abi: verifiableFactoryDeployProxySnippet,
    functionName: 'deployProxy',
    args: [implAddress, salt, callData],
    chain: client.chain,
    account: client.account,
  } as const satisfies WriteContractParameters<
    typeof verifiableFactoryDeployProxySnippet
  >
}

// ================================
// Part 2: Action Function
// ================================

// 3. Export action types
export type DeploySubregistryParameters<
  chain extends Chain,
  account extends Account,
  chainOverride extends Chain | undefined,
> = Prettify<
  DeploySubregistryWriteParametersParameters &
    WriteTransactionParameters<chain, account, chainOverride>
>

export type DeploySubregistryReturnType = Hash

export type DeploySubregistryErrorType =
  | DeploySubregistryWriteParametersErrorType
  | ClientWithOverridesErrorType
  | WriteContractErrorType

// 4. Create the action function
/**
 * Deploys a subregistry contract via a verifiable proxy factory.
 * @param client - {@link Client}
 * @param options - {@link DeploySubregistryParameters}
 * @returns Transaction hash. {@link DeploySubregistryReturnType}
 *
 * @example
 * import { createWalletClient, custom } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { deploySubregistry } from '@ensdomains/ensjs/wallet'
 *
 * const wallet = createWalletClient({
 *   chain: mainnet,
 *   transport: custom(window.ethereum),
 * })
 * const hash = await deploySubregistry(wallet, {
 *   factoryAddress: '0x...',
 *   implAddress: '0x...',
 * })
 */
export async function deploySubregistry<
  chain extends Chain,
  account extends Account,
  chainOverride extends Chain | undefined,
>(
  client: Client<Transport, chain, account>,
  {
    factoryAddress,
    implAddress,
    adminAddress,
    roleBitmap,
    salt,
    ...txArgs
  }: DeploySubregistryParameters<chain, account, chainOverride>
): Promise<DeploySubregistryReturnType> {
  ASSERT_NO_TYPE_ERROR(client)
  
  const writeParameters = deploySubregistryWriteParameters(
    clientWithOverrides(client, txArgs),
    {
      factoryAddress,
      implAddress,
      adminAddress,
      roleBitmap,
      salt,
    }
  )
  
  const writeContractAction = getAction(client, writeContract, 'writeContract')
  return writeContractAction({
    ...writeParameters,
    ...txArgs,
  } as WriteContractParameters)
}
```

**Key characteristics for ENSjs:**
- Three type exports per function: `Parameters`, `ReturnType`, `ErrorType`
- Use `ASSERT_NO_TYPE_ERROR(client)` macro
- Use `getAction(client, action, 'actionName')` pattern
- Write operations split into:
  - `xWriteParameters` - Returns contract params
  - `x` - Executes the transaction
- Comprehensive JSDoc with examples
- Use `satisfies` for type validation

### Using Contract Helpers in Components

#### With wagmi's useWriteContract

```typescript
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { deploySubregistryWriteParameters } from '@ensdomains/ensjs/wallet'

export const DeployButton = () => {
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync, data: txHash, isPending } = useWriteContract()
  
  const { data: receipt, isLoading: isConfirming } = 
    useWaitForTransactionReceipt({ hash: txHash })
  
  const handleDeploy = async () => {
    if (!walletClient) return
    
    // Get contract parameters
    const params = deploySubregistryWriteParameters(walletClient, {
      factoryAddress: FACTORY_ADDRESS,
      implAddress: IMPL_ADDRESS,
    })
    
    // Execute transaction
    await writeContractAsync({
      address: params.address,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
    })
  }
  
  return (
    <button onClick={handleDeploy} disabled={isPending || isConfirming}>
      {isPending ? 'Confirm in wallet...' : isConfirming ? 'Confirming...' : 'Deploy'}
    </button>
  )
}
```

#### With Simple Request Builders

```typescript
import { useWriteContract } from 'wagmi'
import { createSetReverseNameRequest } from '@ens-apps/l2-primary/utils'

export const SetPrimaryNameButton = ({ name }: { name: string }) => {
  const { chain } = useConnection()
  const { writeContractAsync } = useWriteContract()
  
  const handleSetPrimaryName = async () => {
    try {
      // Create request
      const request = createSetReverseNameRequest({
        name,
        reverseRegistrarChainId: 60, // ETH
        chain,
      })
      
      // Execute
      const hash = await writeContractAsync(request)
      console.log('Transaction hash:', hash)
    } catch (error) {
      console.error('Failed to set primary name:', error)
    }
  }
  
  return <button onClick={handleSetPrimaryName}>Set Primary Name</button>
}
```

#### Combining Multiple Requests

```typescript
export const SetPrimaryNameFlow = ({ name, address }: Props) => {
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync } = useWriteContract()
  const [reverseHash, setReverseHash] = useState<Hash>()
  const [forwardHash, setForwardHash] = useState<Hash>()
  
  // Step 1: Set reverse resolution
  const setReverse = async () => {
    const request = createSetReverseNameRequest({
      name,
      reverseRegistrarChainId: 60,
    })
    
    const hash = await writeContractAsync(request)
    setReverseHash(hash)
  }
  
  // Step 2: Set forward resolution
  const setForward = async () => {
    const request = createSetForwardResolutionRequest({
      name,
      reverseRegistrarChainId: 60,
      resolverAddress,
      targetAddress: address,
    })
    
    const hash = await writeContractAsync(request)
    setForwardHash(hash)
  }
  
  return (
    <div>
      <button onClick={setReverse}>1. Set Reverse</button>
      <button onClick={setForward} disabled={!reverseHash}>
        2. Set Forward
      </button>
    </div>
  )
}
```

### Contract Helper Pattern Summary

**When to use Simple Request Builders (Pattern 1):**
- ✅ App-specific contract interactions
- ✅ Package-level utilities (like `@ens-apps/l2-primary`)
- ✅ Simpler contracts with straightforward parameters
- ✅ When you need to compose multiple calls
- ✅ When the helper is consumed directly by components

**Example:** `createSetReverseNameRequest`, `createSetForwardResolutionRequest`

**When to use ENSjs Two-Part Pattern (Pattern 2):**
- ✅ Core ENS protocol interactions
- ✅ Functions in `@ensdomains/ensjs` package
- ✅ Operations that benefit from both "get params" and "execute" variants
- ✅ Complex parameter handling with overrides
- ✅ Functions consumed by external developers

**Example:** `deploySubregistryWriteParameters` + `deploySubregistry`

**Key Differences:**

| Aspect | Simple Builders | ENSjs Pattern |
|--------|----------------|---------------|
| **Structure** | Single function | Two functions (writeParameters + action) |
| **Returns** | Contract params object | writeParameters: params, action: Hash |
| **Client** | Not required | Required (uses `getAction`) |
| **Type safety** | `as const` for args | `satisfies WriteContractParameters` |
| **JSDoc** | Basic documentation | Comprehensive with examples |
| **Error handling** | Throws directly | Typed error unions |
| **Use case** | Direct component usage | Library API + component usage |

### Working with wagmi

```typescript
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { type Address } from 'viem'

export const TransactionButton = () => {
  // Get account info
  const { address, isConnected, chain } = useAccount()
  
  // Get clients
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  
  // Check connection
  if (!isConnected || !address) {
    return <ConnectWallet />
  }
  
  const handleTransaction = async () => {
    if (!walletClient) return
    
    const result = await prepareTransaction({
      address,
      publicClient,
      walletClient,
    })
    
    // Handle result
  }
  
  return <button onClick={handleTransaction}>Send Transaction</button>
}
```

### Safe Client Access

Use the `safeGetClient` helper for error handling:

```typescript
import { safeGetClient } from '@/lib/wagmi/helpers'
import { ResultFn } from '@ens-apps/utils/neverthrow'

export const getNameOwner = ResultFn(async function* (name: string) {
  // Safely get client with error handling
  const client = yield* safeGetClient()
  
  const owner = yield* ResultAsync.fromPromise(
    getOwner(client, { name }),
    (error) => new GetOwnerError({ cause: error })
  )
  
  return ok(owner)
})
```

### Working with ENS

Always normalize ENS names and import types from ENSjs for proper error handling:

```typescript
import { normalize } from 'viem/ens'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import {
  getRecords as ensjs_getRecords,
  type GetRecordsErrorType,
  type GetRecordsParameters,
} from '@ensdomains/ensjs/public'
import { safeGetClient } from '@/lib/wagmi/helpers'

// Always normalize ENS names before using them
const normalizedName = normalize('vitalik.eth')

// Define error class with ENSjs error type
class RecordsError extends TaggedError('RecordsError')<{
  cause: GetRecordsErrorType
}> {}

/**
 * Fetches ENS records for a given name.
 * Uses ENSjs types for parameters and errors.
 */
export const getRecords = ResultFn(async function* (
  params: GetRecordsParameters,
) {
  const client = yield* safeGetClient()
  
  // Use fromPromise with proper ENSjs error typing
  const records = yield* fromPromise(
    ensjs_getRecords(client, params),
    (e) => new RecordsError({ cause: e as GetRecordsErrorType }),
  )
  
  return ok(records)
})
```

**Key patterns:**

1. **Import types from ENSjs** - Use `GetRecordsParameters` and `GetRecordsErrorType`
2. **Type error causes** - `TaggedError<{ cause: GetRecordsErrorType }>`
3. **Use `fromPromise`** - Direct import from `neverthrow`, not `ResultAsync.fromPromise`
4. **Alias ENSjs functions** - `getRecords as ensjs_getRecords` to avoid naming conflicts
5. **Always normalize** - Use `normalize()` from `viem/ens` for user input

**Complex example with multiple clients:**

```typescript
import {
  getNameRegistries as ensjsGetNameRegistries,
  type GetNameRegistriesErrorType,
} from '@ensdomains/ensjs/public/v2'

export class NameRegistriesError extends TaggedError('NameRegistriesError')<{
  cause: GetNameRegistriesErrorType | GetEnsOwnerError
}> {}

/**
 * Discovers which registry (L1 or L2) a name exists on.
 * Shows working with multiple clients and conditional logic.
 */
export const getNameRegistries = ResultFn(async function* ({
  network,
  name,
}: GetNameRegistriesParameters) {
  const l1Client = yield* safeGetClient()
  const l2Client = yield* safeGetNamechainSepoliaClient()
  
  if (!network) return ok(null)
  
  if (network === 'sepolia') {
    const registries = yield* fromPromise(
      ensjsGetNameRegistries(l1Client, { name }),
      (e) => new NameRegistriesError({ cause: e as GetNameRegistriesErrorType }),
    )
    return ok({
      registries,
      network: 'sepolia',
      protocolVersion: 'ENSv1',
    } as const)
  }
  
  // ... handle other networks
  return ok(null)
})
```

### BigInt Handling

```typescript
// Use BigInt for all blockchain numeric values
const YEAR_IN_SECONDS = 31536000n
const price = 100000000000000000n // Wei

// Format for display
import { formatEther, formatUnits, parseEther } from 'viem'

const displayPrice = formatEther(price) // "0.1 ETH"
const parsedAmount = parseEther('0.1') // 100000000000000000n

// Always use bigint arithmetic
const totalCost = price * duration / YEAR_IN_SECONDS
const withBuffer = (price * 105n) / 100n // Add 5% buffer
```

### Address Type Safety

```typescript
import { type Address, isAddress } from 'viem'

// Always use Address type
interface ProfileParams {
  address: Address
}

// Validate addresses
function validateAddress(value: string): value is Address {
  return isAddress(value)
}

// Type guard in use
function getProfile(address: string) {
  if (!validateAddress(address)) {
    return err(new InvalidAddressError({ address }))
  }
  
  // TypeScript knows address is Address here
  return fetchProfile(address)
}
```


---

> **Next**: See [TESTING-AND-TOOLING.md](./TESTING-AND-TOOLING.md) for testing strategy and tooling setup.
