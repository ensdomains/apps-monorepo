import { assign, setup } from 'xstate'
import { CONTRACT_ADDRESSES } from '../services/nameChainContractService'

const STORAGE_KEYS = {
  COMMITMENT: 'ens_commitment',
  SECRET: 'ens_secret',
  NAME: 'ens_name',
  COMMIT_TIMESTAMP: 'ens_commit_timestamp',
  DURATION: 'ens_duration',
  COMMIT_TX_HASH: 'ens_commit_tx_hash',
  REGISTER_TX_HASH: 'ens_register_tx_hash',
  OWNER_ADDRESS: 'ens_owner_address',
}

// Note: Pricing is now handled in UI components using getTokenPrices service

export enum RegistrationStep {
  PRICING = 'pricing',
  MAKE_COMMITMENT = 'makeCommitment',
  COMMITMENT_ERROR = 'commitmentError',
  WAITING_FOR_COMMIT_TIME = 'waitingForCommitTime',
  REGISTER = 'registerInProgress',
  REGISTRATION_ERROR = 'registrationError',
  REGISTER_SUCCESS = 'registerSuccess',
  AUTORENEWAL = 'autorenewal',
}

interface RegistrationContext {
  name: string
  duration: number
  isAvailable: boolean | null

  selectedToken: string
  ownerAddress: string
  commitment: string
  secret: string
  commitTimestamp: number
  remainingTime: number
  commitTxHash: string
  registerTxHash: string
  step: RegistrationStep
  currencyType: 'ETH' | 'USD'
  selectedPaymentMethod?: 'crypto' | 'credit-card'
  selectedCrypto?: string
  error: string
  // Token info for registration
  tokenPrice: bigint | null
  selectedTokenForRegistration: string | null
}

type RegistrationEvent =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DURATION'; duration: number }
  | { type: 'SET_OWNER_ADDRESS'; address: string }
  | { type: 'SET_CURRENCY'; currencyType: 'ETH' | 'USD' }
  | { type: 'SELECT_PAYMENT'; method: 'crypto' | 'credit-card' }
  | { type: 'SELECT_CRYPTO'; cryptoId: string }
  | { type: 'SELECT_TOKEN'; tokenAddress: string }
  | { type: 'CONFIRM_PAYMENT' }
  | {
      type: 'COMMIT_RESULT'
      commitment: string
      secret: string
      timestamp: number
      txHash: string
    }
  | { type: 'TIMER_TICK'; remainingTime: number }
  | { type: 'TIMER_COMPLETE' }
  | { type: 'REGISTER_RESULT'; txHash: string }
  | { type: 'RETRY_COMMIT' }
  | { type: 'SKIP_NOTIFICATIONS' }
  | { type: 'SETUP_AUTORENEWAL' }
  | { type: 'COMPLETE_FLOW' }
  | { type: 'RESET' }
  | { type: 'ERROR'; message: string }
  | { type: 'SET_TOKEN_INFO'; tokenPrice: bigint; selectedToken: string }

const isBrowser = typeof window !== 'undefined'

const loadSavedData = (): Partial<RegistrationContext> => {
  const defaultData: Partial<RegistrationContext> = {
    name: '',
    duration: 1,
    commitment: '',
    secret: '',
    commitTimestamp: 0,
    remainingTime: 0,
    commitTxHash: '',
    registerTxHash: '',
    ownerAddress: '',
    step: RegistrationStep.PRICING,
    currencyType: 'ETH',
    error: '',
    isAvailable: null,
    tokenPrice: null,
    selectedTokenForRegistration: null,
  }

  if (!isBrowser) return defaultData

  try {
    const saved = {
      name: localStorage.getItem(STORAGE_KEYS.NAME) || '',
      duration: parseInt(localStorage.getItem(STORAGE_KEYS.DURATION) || '1'),
      commitment: localStorage.getItem(STORAGE_KEYS.COMMITMENT) || '',
      secret: localStorage.getItem(STORAGE_KEYS.SECRET) || '',
      commitTimestamp: parseInt(
        localStorage.getItem(STORAGE_KEYS.COMMIT_TIMESTAMP) || '0',
      ),
      commitTxHash: localStorage.getItem(STORAGE_KEYS.COMMIT_TX_HASH) || '',
      registerTxHash: localStorage.getItem(STORAGE_KEYS.REGISTER_TX_HASH) || '',
      ownerAddress: localStorage.getItem(STORAGE_KEYS.OWNER_ADDRESS) || '',
    }

    return { ...defaultData, ...saved }
  } catch (error) {
    console.error('Error loading saved registration data:', error)
    return defaultData
  }
}

const saveToStorage = (key: string, value: string) => {
  if (isBrowser) {
    localStorage.setItem(key, value)
  }
}

const clearStorage = () => {
  if (isBrowser) {
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key)
    })
  }
}

const savedData = loadSavedData()
const initialContext: RegistrationContext = {
  name: savedData.name || '',
  duration: savedData.duration || 1,
  isAvailable: savedData.isAvailable || null,

  selectedToken: CONTRACT_ADDRESSES.L2.MockUSDC, // Default to USDC
  ownerAddress: savedData.ownerAddress || '',
  commitment: savedData.commitment || '',
  secret: savedData.secret || '',
  commitTimestamp: savedData.commitTimestamp || 0,
  remainingTime: savedData.remainingTime || 0,
  commitTxHash: savedData.commitTxHash || '',
  registerTxHash: savedData.registerTxHash || '',
  step: RegistrationStep.PRICING,
  currencyType: savedData.currencyType || 'ETH',
  selectedPaymentMethod: savedData.selectedPaymentMethod,
  selectedCrypto: savedData.selectedCrypto,
  error: '',
  tokenPrice: null,
  selectedTokenForRegistration: null,
}


export const registrationMachine = setup({
  types: {
    context: {} as RegistrationContext,
    events: {} as RegistrationEvent,
  },
  actors: {
    // Note: Pricing logic removed - now handled in UI components using getTokenPrices service
  },
  actions: {
    setName: assign({
      name: ({ event }) => (event.type === 'SET_NAME' ? event.name : ''),
    }),

    setDuration: assign({
      duration: ({ event }) =>
        event.type === 'SET_DURATION' ? event.duration : 1,
    }),

    setOwnerAddress: assign({
      ownerAddress: ({ event }) =>
        event.type === 'SET_OWNER_ADDRESS' ? event.address : '',
    }),

    setCurrency: assign({
      currencyType: ({ event }) =>
        event.type === 'SET_CURRENCY' ? event.currencyType : 'ETH',
    }),

    selectPayment: assign({
      selectedPaymentMethod: ({ event }) =>
        event.type === 'SELECT_PAYMENT' ? event.method : undefined,
    }),

    selectCrypto: assign({
      selectedCrypto: ({ event }) =>
        event.type === 'SELECT_CRYPTO' ? event.cryptoId : undefined,
    }),

    selectToken: assign({
      selectedToken: ({ event }) =>
        event.type === 'SELECT_TOKEN' ? event.tokenAddress : '',
    }),

    setTokenInfo: assign({
      tokenPrice: ({ event }) =>
        event.type === 'SET_TOKEN_INFO' ? event.tokenPrice : null,
      selectedTokenForRegistration: ({ event }) =>
        event.type === 'SET_TOKEN_INFO' ? event.selectedToken : null,
    }),

    // Note: Pricing assignment actions removed - pricing handled in UI

    setCommitResult: assign({
      commitment: ({ event }) =>
        event.type === 'COMMIT_RESULT' ? event.commitment : '',
      secret: ({ event }) => {
        const secret = event.type === 'COMMIT_RESULT' ? event.secret : ''
        console.log('🔑 Setting secret in context:', secret)
        return secret
      },
      commitTimestamp: ({ event }) =>
        event.type === 'COMMIT_RESULT' ? event.timestamp : 0,
      commitTxHash: ({ event }) =>
        event.type === 'COMMIT_RESULT' ? event.txHash : '',
      step: () => RegistrationStep.WAITING_FOR_COMMIT_TIME,
    }),

    updateTimer: assign({
      remainingTime: ({ event }) =>
        event.type === 'TIMER_TICK' ? event.remainingTime : 0,
    }),

    setRegisterResult: assign({
      registerTxHash: ({ event }) =>
        event.type === 'REGISTER_RESULT' ? event.txHash : '',
      step: () => RegistrationStep.REGISTER_SUCCESS,
    }),

    setError: assign({
      error: ({ event }) => (event.type === 'ERROR' ? event.message : ''),
    }),

    clearError: assign({
      error: () => '',
    }),

    saveCommitData: ({ context }) => {
      console.log('💾 Saving commit data to localStorage:', {
        commitment: context.commitment,
        secret: context.secret,
        timestamp: context.commitTimestamp,
        txHash: context.commitTxHash,
      })
      saveToStorage(STORAGE_KEYS.COMMITMENT, context.commitment)
      saveToStorage(STORAGE_KEYS.SECRET, context.secret)
      saveToStorage(
        STORAGE_KEYS.COMMIT_TIMESTAMP,
        context.commitTimestamp.toString(),
      )
      saveToStorage(STORAGE_KEYS.COMMIT_TX_HASH, context.commitTxHash)
    },

    saveRegistrationData: ({ context }) => {
      saveToStorage(STORAGE_KEYS.REGISTER_TX_HASH, context.registerTxHash)
    },

    savePersistentData: ({ context }) => {
      saveToStorage(STORAGE_KEYS.NAME, context.name)
      saveToStorage(STORAGE_KEYS.DURATION, context.duration.toString())
      saveToStorage(STORAGE_KEYS.OWNER_ADDRESS, context.ownerAddress)
      // Note: Pricing storage removed - pricing handled in UI components
    },

    clearAllData: () => {
      // Don't clear commitment data if we're in the middle of registration
      // Only clear if we're resetting from the beginning
      clearStorage()
    },
  },
}).createMachine({
  context: initialContext,
  initial: 'pricing',

  on: {
    SET_NAME: {
      actions: ['setName', 'savePersistentData'],
    },
    SET_DURATION: {
      actions: ['setDuration', 'savePersistentData'],
    },
    SET_OWNER_ADDRESS: {
      actions: ['setOwnerAddress', 'savePersistentData'],
    },
    SET_CURRENCY: {
      actions: ['setCurrency'],
    },
    SELECT_PAYMENT: {
      actions: ['selectPayment'],
    },
    SELECT_CRYPTO: {
      actions: ['selectCrypto'],
    },
    SELECT_TOKEN: {
      actions: ['selectToken'],
    },
    SET_TOKEN_INFO: {
      actions: ['setTokenInfo'],
    },
    ERROR: {
      actions: ['setError'],
    },
    COMPLETE_FLOW: {
      actions: ['clearAllData'], // Clear localStorage when user completes the flow
    },
    RESET: {
      target: '.pricing',
      actions: ['clearAllData'],
    },
  },

  states: {
    pricing: {
      entry: ['clearError'],
      always: [
        {
          target: 'registerSuccess',
          guard: ({ context }) => {
            const shouldTransition = !!context.registerTxHash && !!context.name
            if (shouldTransition) {
              console.log('🔄 Auto-transitioning to registerSuccess')
            }
            return shouldTransition
          },
        },
        {
          target: 'registerInProgress',
          guard: ({ context }) => {
            if (
              context.commitment &&
              context.secret &&
              context.name &&
              context.commitTimestamp &&
              context.name.length > 0
            ) {
              const now = Date.now()
              const commitTime = context.commitTimestamp
              const elapsedTime = now - commitTime

              return (
                elapsedTime < 24 * 60 * 60 * 1000 && elapsedTime >= 60 * 1000
              )
            }
            return false
          },
        },
        {
          target: 'waitingForCommitTime',
          guard: ({ context }) => {
            if (
              context.commitment &&
              context.secret &&
              context.name &&
              context.commitTimestamp &&
              context.name.length > 0
            ) {
              const now = Date.now()
              const commitTime = context.commitTimestamp
              const elapsedTime = now - commitTime

              return (
                elapsedTime < 24 * 60 * 60 * 1000 && elapsedTime < 60 * 1000
              )
            }
            return false
          },
        },
      ],
      // Note: Pricing invokes removed - pricing handled in UI components
      on: {
        CONFIRM_PAYMENT: {
          target: 'makeCommitment',
          actions: [
            assign({
              step: () => RegistrationStep.MAKE_COMMITMENT,
            }),
          ],
        },
      },
    },

    makeCommitment: {
      entry: [
        assign({
          step: () => RegistrationStep.MAKE_COMMITMENT,
        }),
      ],
      on: {
        COMMIT_RESULT: {
          target: 'waitingForCommitTime',
          actions: ['setCommitResult', 'saveCommitData'],
        },
        ERROR: {
          target: 'commitmentError',
          actions: ['setError'],
        },
      },
    },

    commitmentError: {
      entry: [
        assign({
          step: () => RegistrationStep.COMMITMENT_ERROR,
        }),
      ],
      on: {
        RETRY_COMMIT: {
          target: 'makeCommitment',
          actions: ['clearError'],
        },
        RESET: {
          target: 'pricing',
          actions: ['clearAllData', 'clearError'],
        },
      },
    },

    waitingForCommitTime: {
      entry: [
        assign({
          step: () => RegistrationStep.WAITING_FOR_COMMIT_TIME,
        }),
      ],
      on: {
        TIMER_TICK: {
          actions: ['updateTimer'],
        },
        TIMER_COMPLETE: {
          target: 'registerInProgress',
          actions: [
            assign({
              step: () => RegistrationStep.REGISTER,
            }),
          ],
        },
      },
    },

    registerInProgress: {
      entry: [
        assign({
          step: () => RegistrationStep.REGISTER,
        }),
      ],
      on: {
        REGISTER_RESULT: {
          target: 'registerSuccess',
          actions: ['setRegisterResult', 'saveRegistrationData'],
        },
        ERROR: {
          target: 'registrationError',
          actions: ['setError'],
        },
      },
    },

    registrationError: {
      entry: [
        assign({
          step: () => RegistrationStep.REGISTRATION_ERROR,
        }),
      ],
      on: {
        RETRY_COMMIT: {
          target: 'makeCommitment',
          actions: ['clearError'],
        },
        RESET: {
          target: 'pricing',
          actions: ['clearAllData', 'clearError'],
        },
      },
    },

    registerSuccess: {
      entry: [
        assign({
          step: () => RegistrationStep.REGISTER_SUCCESS,
        }),
      ],
      on: {
        SETUP_AUTORENEWAL: {
          target: 'autorenewal',
        },
        COMPLETE_FLOW: {
          actions: ['clearAllData'],
        },
      },
    },

    autorenewal: {
      entry: [
        assign({
          step: () => RegistrationStep.AUTORENEWAL,
        }),
      ],
      on: {
        COMPLETE_FLOW: {
          actions: ['clearAllData'],
        },
      },
    },
  },
})
