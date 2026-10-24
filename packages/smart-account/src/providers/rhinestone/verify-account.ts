import { type Address, getAddress, type PublicClient, parseAbi } from 'viem'
import { AccountVerificationError } from '../../errors'
import { getDestinationContracts, ONCHAIN_ACCOUNT_ID } from './manifest'

const standaloneHcaAbi = parseAbi([
  'function owner() view returns (address)',
  'function accountId() view returns (string)',
])
const standaloneHcaFactoryAbi = parseAbi([
  'function authorizedOwnerOf(address hca) view returns (address)',
])
const verifiableFactoryAbi = parseAbi([
  'function verifyContract(address proxy) view returns (address implementation)',
])

/**
 * Verify an already-deployed HCA matches what we expect before adopting it.
 * Returns the verified current implementation. Throws `AccountVerificationError`
 * (never silently adopts a mismatched account).
 */
export interface VerifyStandaloneHcaParams {
  readonly publicClient: PublicClient
  readonly hca: Address
  readonly expectedOwner: Address
  readonly chainId: number
}

export async function verifyStandaloneHca(
  params: VerifyStandaloneHcaParams,
): Promise<Address> {
  const { publicClient, hca, expectedOwner, chainId } = params
  const c = getDestinationContracts(chainId)

  const [actualOwner, accountId, authorizedOwner, implementation] =
    await Promise.all([
      publicClient.readContract({
        address: hca,
        abi: standaloneHcaAbi,
        functionName: 'owner',
      }),
      publicClient.readContract({
        address: hca,
        abi: standaloneHcaAbi,
        functionName: 'accountId',
      }),
      publicClient.readContract({
        address: c.standaloneHcaFactory,
        abi: standaloneHcaFactoryAbi,
        functionName: 'authorizedOwnerOf',
        args: [hca],
      }),
      publicClient.readContract({
        address: c.verifiableFactory,
        abi: verifiableFactoryAbi,
        functionName: 'verifyContract',
        args: [hca],
      }),
    ])

  if (getAddress(actualOwner) !== getAddress(expectedOwner)) {
    throw new AccountVerificationError({
      message: 'Existing HCA owner does not match the connected wallet',
      field: 'owner',
      expected: getAddress(expectedOwner),
      actual: getAddress(actualOwner),
    })
  }

  if (getAddress(authorizedOwner) !== getAddress(expectedOwner)) {
    throw new AccountVerificationError({
      message:
        'Existing HCA factory authorization does not match the connected wallet',
      field: 'authorizedOwner',
      expected: getAddress(expectedOwner),
      actual: getAddress(authorizedOwner),
    })
  }

  if (accountId !== ONCHAIN_ACCOUNT_ID) {
    throw new AccountVerificationError({
      message: 'Existing HCA accountId does not match the standalone HCA',
      field: 'accountId',
      expected: ONCHAIN_ACCOUNT_ID,
      actual: accountId,
    })
  }

  // At launch the implementation must equal the configured initial
  // implementation. (Post-upgrade, this expands to any DAO-approved
  // implementation — tracked separately once upgrades exist.)
  if (
    getAddress(implementation) !== getAddress(c.standaloneHcaImplementation)
  ) {
    throw new AccountVerificationError({
      message: 'Existing HCA implementation is not the expected implementation',
      field: 'implementation',
      expected: getAddress(c.standaloneHcaImplementation),
      actual: getAddress(implementation),
    })
  }

  return implementation
}
