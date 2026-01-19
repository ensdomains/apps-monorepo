import { vi } from 'vitest'

vi.stubEnv('VITE_PIMLICO_API_KEY', 'test-pimlico-key')

// Mock transaction-manager to avoid import issues
vi.mock('@ens-apps/transaction-manager', () => ({
  Signer: {},
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

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}))
