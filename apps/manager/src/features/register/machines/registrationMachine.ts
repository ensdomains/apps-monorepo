import { assign, setup } from 'xstate'
import { CONTRACT_ADDRESSES } from '../services/nameChainContractService'

// Note: Persistence is now handled by XState's built-in persistence system
// No need for manual STORAGE_KEYS or localStorage management

// Persistence utilities
export const PERSISTENCE_KEY = 'ens_registration_machine_state'

export const getPersistedState = () => {
  if (typeof window === 'undefined') return undefined
  
  try {
    const persisted = localStorage.getItem(PERSISTENCE_KEY)
    if (persisted) {
      return JSON.parse(persisted)
    }
  } catch (error) {
    console.error('Error loading persisted state:', error)
  }
  return undefined
}

export const persistState = (state: any) => {
  if (typeof window === 'undefined') return
  
  try {
    const snapshot = state.getPersistedSnapshot()
    localStorage.setItem(PERSISTENCE_KEY, JSON.stringify(snapshot))
  } catch (error) {
    console.error('Error persisting state:', error)
  }
}

export const clearPersistedState = () => {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(PERSISTENCE_KEY)
  } catch (error) {
    console.error('Error clearing persisted state:', error)
  }
}

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
  // step: RegistrationStep  // Removed - redundant with XState state
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

    resetData: assign({
      name: ({ event }) => (event.type === 'SET_NAME' ? event.name : ''),
      duration: () => 1,
      commitment: () => '',
      secret: () => '',
      commitTimestamp: () => 0,
      remainingTime: () => 0,
      commitTxHash: () => '',
      registerTxHash: () => '',
      selectedPaymentMethod: () => undefined,
      selectedCrypto: () => undefined,
      error: () => '',
      isAvailable: () => null,
      tokenPrice: () => null,
      selectedTokenForRegistration: () => null,
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
      remainingTime: () => 60, // Initialize timer to 20 seconds
    }),

    updateTimer: assign({
      remainingTime: ({ event }) =>
        event.type === 'TIMER_TICK' ? event.remainingTime : 0,
    }),



    setRegisterResult: assign({
      registerTxHash: ({ event }) =>
        event.type === 'REGISTER_RESULT' ? event.txHash : '',
    }),

    setError: assign({
      error: ({ event }) => (event.type === 'ERROR' ? event.message : ''),
    }),

    clearError: assign({
      error: () => '',
    }),








  },
}).createMachine({
  context: {
    name: '',
    duration: 1,
    isAvailable: null,

    selectedToken: CONTRACT_ADDRESSES.L2.MockUSDC, // Default to USDC
    ownerAddress: '',
    commitment: '',
    secret: '',
    commitTimestamp: 0,
    remainingTime: 0,
    commitTxHash: '',
    registerTxHash: '',
    currencyType: 'ETH',
    selectedPaymentMethod: undefined,
    selectedCrypto: undefined,
    error: '',
    tokenPrice: null,
    selectedTokenForRegistration: null,
  },
  initial: 'pricing',

  on: {
    SET_NAME: [
      {
        // If there's previous state and a different domain name, do a full reset
        guard: ({ context, event }) => {
          return (
            event.type === 'SET_NAME' &&
            context.name !== '' &&
            event.name !== context.name
          )
        },
        actions: [
          ({ context, event }) => {
            console.log(
              '🔄 New domain search detected - clearing previous state',
            )
            console.log(
              `  Previous domain: "${context.name}" → New domain: "${event.name}"`,
            )
            // This action is no longer needed as persistence handles clearing
            // clearStorage()
          },
          'resetData',
        ],
      },
      {
        // Default case - just set the name
        actions: ['setName'],
      },
    ],
    SET_DURATION: {
      actions: ['setDuration'],
    },
    SET_OWNER_ADDRESS: {
      actions: ['setOwnerAddress'],
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
      // No actions needed - persistence handles state management
    },
    RESET: {
      target: '.pricing',
      // No actions needed - persistence handles state management
    },
  },

  states: {
    pricing: {
      tags: ['pricing', 'idle', 'form'],
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
        },
      },
    },

    makeCommitment: {
      tags: ['commitment', 'loading', 'pending', 'transaction'],
      on: {
        COMMIT_RESULT: {
          target: 'waitingForCommitTime',
          actions: ['setCommitResult'],
        },
        ERROR: {
          target: 'commitmentError',
          actions: ['setError'],
        },
      },
    },

    commitmentError: {
      tags: ['error', 'commitment-error', 'recoverable', 'form'],
      on: {
        RETRY_COMMIT: {
          target: 'makeCommitment',
          actions: ['clearError'],
        },
        RESET: {
          target: 'pricing',
          actions: ['clearError'],
        },
      },
    },

    waitingForCommitTime: {
      tags: ['waiting', 'timer', 'pending', 'countdown'],
      on: {
        TIMER_TICK: {
          actions: ['updateTimer'],
        },
        TIMER_COMPLETE: {
          target: 'registerInProgress',
        },
      },
    },

    registerInProgress: {
      tags: ['registration', 'loading', 'pending', 'transaction'],
      on: {
        REGISTER_RESULT: {
          target: 'registerSuccess',
          actions: ['setRegisterResult'],
        },
        ERROR: {
          target: 'registrationError',
          actions: ['setError'],
        },
      },
    },

    registrationError: {
      tags: ['error', 'registration-error', 'recoverable', 'form'],
      on: {
        RETRY_COMMIT: {
          target: 'makeCommitment',
          actions: ['clearError'],
        },
        RESET: {
          target: 'pricing',
          actions: ['clearError'],
        },
      },
    },

    registerSuccess: {
      tags: ['success', 'completed', 'idle', 'form'],
      on: {
        SETUP_AUTORENEWAL: {
          target: 'autorenewal',
        },
        COMPLETE_FLOW: {
          // No actions needed - persistence handles state management
        },
      },
    },

    autorenewal: {
      tags: ['autorenewal', 'setup', 'idle', 'form'],
      on: {
        COMPLETE_FLOW: {
          // No actions needed - persistence handles state management
        },
      },
    },
  },
  persistence: {
    // Configure persistence to save state to localStorage
    // This will persist the state of the machine across page reloads
    // and will be loaded when the machine is created.
    // The 'storage' option specifies the storage mechanism.
    // 'localStorage' is the default, but you can use 'sessionStorage' or a custom implementation.
    // 'storage' can also be an object with 'key' and 'serialize' properties.
    // For example, to use sessionStorage:
    // persistence: {
    //   storage: {
    //     key: 'registrationMachineState',
    //     serialize: (state) => JSON.stringify(state),
    //   },
    // },
    // If you want to persist to a custom storage, you'd implement it here.
    // For now, we'll rely on XState's default persistence.
  },
})
