import { assign, fromPromise, setup } from 'xstate'
import { getRealNamePrice } from '../services/realEnsContractService'

// Persistence keys
const STORAGE_KEYS = {
  COMMITMENT: 'ens_commitment',
  SECRET: 'ens_secret',
  NAME: 'ens_name',
  COMMIT_TIMESTAMP: 'ens_commit_timestamp',
  PRICING: 'ens_pricing',
  DURATION: 'ens_duration',
  COMMIT_TX_HASH: 'ens_commit_tx_hash',
  REGISTER_TX_HASH: 'ens_register_tx_hash',
  OWNER_ADDRESS: 'ens_owner_address',
}
export const BASE_PRICE_PER_YEAR = '25000000000000000'

export enum RegistrationStep {
  PRICING = 'pricing',
  MAKE_COMMITMENT = 'makeCommitment',
  COMMITMENT_ERROR = 'commitmentError', // New error state for commit failures
  WAITING_FOR_COMMIT_TIME = 'waitingForCommitTime',
  REGISTER = 'registerInProgress',
  REGISTER_SUCCESS = 'registerSuccess',
  AUTORENEWAL = 'autorenewal',
}

interface RegistrationContext {
  // Domain info
  name: string
  duration: number
  isAvailable: boolean | null

  // Pricing
  pricing?: {
    totalPrice: string
    base: string
    premium: string
  }

  // Registration data
  ownerAddress: string
  commitment: string
  secret: string
  commitTimestamp: number
  remainingTime: number

  // Transaction hashes
  commitTxHash: string
  registerTxHash: string

  // UI state
  step: RegistrationStep
  currencyType: 'ETH' | 'USD'
  selectedPaymentMethod?: 'crypto' | 'credit-card'
  selectedCrypto?: string

  // Error handling
  error: string
}

type RegistrationEvent =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DURATION'; duration: number }
  | { type: 'SET_OWNER_ADDRESS'; address: string }
  | { type: 'SET_CURRENCY'; currencyType: 'ETH' | 'USD' }
  | { type: 'SELECT_PAYMENT'; method: 'crypto' | 'credit-card' }
  | { type: 'SELECT_CRYPTO'; cryptoId: string }
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
  | { type: 'RETRY_COMMIT' } // New event to retry commitment
  | { type: 'SKIP_NOTIFICATIONS' }
  | { type: 'SETUP_AUTORENEWAL' }
  | { type: 'COMPLETE_FLOW' } // New event to clear localStorage when flow is complete
  | { type: 'RESET' }
  | { type: 'ERROR'; message: string }

const isBrowser = typeof window !== 'undefined'

// Load saved state from localStorage
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
      pricing: localStorage.getItem(STORAGE_KEYS.PRICING)
        ? JSON.parse(localStorage.getItem(STORAGE_KEYS.PRICING)!)
        : undefined,
    }

    return { ...defaultData, ...saved }
  } catch (error) {
    console.error('Error loading saved registration data:', error)
    return defaultData
  }
}

// Save to localStorage
const saveToStorage = (key: string, value: string) => {
  if (isBrowser) {
    localStorage.setItem(key, value)
  }
}

// Clear storage
const clearStorage = () => {
  if (isBrowser) {
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key)
    })
  }
}

// Determine initial step based on saved data - matching working version
function _determineInitialStep(
  saved: Partial<RegistrationContext>,
): RegistrationStep {
  if (saved.registerTxHash) {
    return RegistrationStep.REGISTER_SUCCESS
  }

  if (saved.commitment && saved.secret && saved.name && saved.commitTimestamp) {
    const now = Date.now()
    const commitTime = saved.commitTimestamp
    const elapsedTime = now - commitTime

    // Check if within 24 hours (maxCommitmentAge)
    if (elapsedTime < 24 * 60 * 60 * 1000) {
      // Check if past 60 seconds (minCommitmentAge)
      if (elapsedTime >= 60 * 1000) {
        return RegistrationStep.REGISTER
      } else {
        return RegistrationStep.WAITING_FOR_COMMIT_TIME
      }
    }
  }

  return RegistrationStep.PRICING
}

// Map RegistrationStep to state machine state names
function _getInitialStateName(step: RegistrationStep): string {
  switch (step) {
    case RegistrationStep.PRICING:
      return 'pricing'
    case RegistrationStep.MAKE_COMMITMENT:
      return 'makeCommitment'
    case RegistrationStep.WAITING_FOR_COMMIT_TIME:
      return 'waitingForCommitTime'
    case RegistrationStep.REGISTER:
      return 'registerInProgress'
    case RegistrationStep.REGISTER_SUCCESS:
      return 'registerSuccess'
    case RegistrationStep.AUTORENEWAL:
      return 'autorenewal'
    default:
      return 'pricing'
  }
}

const savedData = loadSavedData()
const initialContext: RegistrationContext = {
  name: savedData.name || '',
  duration: savedData.duration || 1,
  isAvailable: savedData.isAvailable || null,
  pricing: savedData.pricing,
  ownerAddress: savedData.ownerAddress || '',
  commitment: savedData.commitment || '',
  secret: savedData.secret || '',
  commitTimestamp: savedData.commitTimestamp || 0,
  remainingTime: savedData.remainingTime || 0,
  commitTxHash: savedData.commitTxHash || '',
  registerTxHash: savedData.registerTxHash || '',
  step: RegistrationStep.PRICING, // Always start in pricing state
  currencyType: savedData.currencyType || 'ETH',
  selectedPaymentMethod: savedData.selectedPaymentMethod,
  selectedCrypto: savedData.selectedCrypto,
  error: '',
}

export const registrationMachine = setup({
  types: {
    context: {} as RegistrationContext,
    events: {} as RegistrationEvent,
  },
  actors: {
    loadPricing: fromPromise(
      async ({ input }: { input: { name: string; duration: number } }) => {
        const result = await getRealNamePrice(input.name, input.duration)
        if (result.isOk()) {
          return result.value
        }
        throw new Error('Failed to load pricing')
      },
    ),
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

    setPricing: assign({
      pricing: ({ event }) => (event as any).pricing,
    }),

    setCommitResult: assign({
      commitment: ({ event }) =>
        event.type === 'COMMIT_RESULT' ? event.commitment : '',
      secret: ({ event }) =>
        event.type === 'COMMIT_RESULT' ? event.secret : '',
      commitTimestamp: ({ event }) =>
        event.type === 'COMMIT_RESULT' ? event.timestamp : 0,
      commitTxHash: ({ event }) =>
        event.type === 'COMMIT_RESULT' ? event.txHash : '',
      step: () => RegistrationStep.WAITING_FOR_COMMIT_TIME, // Restore timer step
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

    // Persistence actions
    saveCommitData: ({ context }) => {
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
      if (context.pricing) {
        saveToStorage(STORAGE_KEYS.PRICING, JSON.stringify(context.pricing))
      }
    },

    clearAllData: () => {
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
        // Auto-transition based on saved state - only after machine is initialized
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

              // Check if within 24 hours (maxCommitmentAge) and past 60 seconds (minCommitmentAge)
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

              // Check if within 24 hours but not yet past 60 seconds
              return (
                elapsedTime < 24 * 60 * 60 * 1000 && elapsedTime < 60 * 1000
              )
            }
            return false
          },
        },
      ],
      invoke: {
        src: 'loadPricing',
        input: ({ context }) => ({
          name: context.name,
          duration: context.duration,
        }),
        onDone: {
          actions: [
            assign({
              pricing: ({ event }) => event.output,
            }),
            'savePersistentData',
          ],
        },
        onError: {
          actions: ['setError'],
        },
      },
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
          actions: ['clearAllData'], // Clear localStorage when user completes the flow
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
          actions: ['clearAllData'], // Clear localStorage when user completes the flow
        },
      },
    },
  },
})
