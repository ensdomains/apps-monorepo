import { vi } from 'vitest'

vi.stubEnv('VITE_PIMLICO_API_KEY', 'test-pimlico-key')
vi.stubEnv('VITE_RHINESTONE_API_KEY', 'test-rhinestone-key')
// Tests target the smart-account flow; pin the EOA-only flag to false so it
// doesn't bypass the Rhinestone/ZeroDev paths under test.
vi.stubEnv('VITE_FF_USE_EOA', 'false')

// Mock transaction-manager to avoid import issues
vi.mock('@ens-apps/transaction-manager', () => ({
  Signer: {},
}))

vi.mock('@getpara/viem-v2-integration', () => ({
  createParaAccount: vi.fn().mockReturnValue({
    address: '0xParaAddress123456789012345678901234567890' as const,
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
  }),
}))

// Mock all external dependencies
vi.mock('@getpara/react-sdk-lite', () => ({
  useClient: vi.fn().mockReturnValue(null),
  useWallet: vi.fn().mockReturnValue({ data: null, isPending: false }),
}))

vi.mock('wagmi', () => ({
  useWalletClient: vi.fn().mockReturnValue({ data: null }),
}))

vi.mock('viem/actions', () => ({
  getBalance: vi.fn().mockResolvedValue(0n),
  readContract: vi.fn().mockResolvedValue(0n),
}))

vi.mock('@/lib/wagmi', () => ({
  customSepolia: { id: 11155111, name: 'Sepolia' },
  publicClient: { chain: { id: 11155111 } },
  SEPOLIA_RPC_URL: 'https://sepolia.example.com',
}))

vi.mock('@/features/register/services/nameChainContractService', () => ({
  SUPPORTED_TOKENS: {},
}))

vi.mock('@/utils/backend-client', () => ({
  backendClient: {
    wallet: {
      fund: {
        $post: vi.fn().mockResolvedValue({ ok: true, json: () => ({}) }),
      },
    },
  },
}))

vi.mock('./pimlico', () => ({
  initializePimlicoAccount: vi.fn().mockResolvedValue({
    client: { account: { address: '0xSmartAccount' } },
    address: '0xSmartAccount123456789012345678901234567890',
    config: {
      chain: { id: 11155111 },
      accountType: 'hca',
      pimlicoApiKey: 'key',
    },
    eoaAddress: '0xEOA1234567890123456789012345678901234567',
  }),
}))

vi.mock('./zerodev/kernel', () => ({
  initializeZeroDevAccount: vi.fn().mockResolvedValue({
    client: { account: { address: '0xSmartAccount' } },
    address: '0xSmartAccount123456789012345678901234567890',
    config: {
      chain: { id: 11155111 },
      accountType: 'hca',
      kernelVersion: '3.1',
      pimlicoApiKey: 'key',
    },
    ecdsaValidator: { type: 'ECDSAValidator' },
  }),
}))

vi.mock('./rhinestone', () => ({
  initializeRhinestoneAccount: vi.fn().mockResolvedValue({
    client: {
      getAddress: vi
        .fn()
        .mockReturnValue('0xSmartAccount123456789012345678901234567890'),
      sendTransaction: vi.fn(),
      waitForExecution: vi.fn(),
    },
    address: '0xSmartAccount123456789012345678901234567890',
    ownerAddress: '0xOwner12345678901234567890123456789012345678',
    config: {
      chain: { id: 11155111 },
      accountType: 'hca',
      rhinestoneApiKey: 'test-rhinestone-key',
    },
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}))
