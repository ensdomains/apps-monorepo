import type { AiEvalCase } from './corpus'

// Independent labels for existing native actions newly reachable from AI.
// These are development cases and are never folded into older frozen corpora.
const common = {
  entryPoint: 'ai',
  split: 'development',
  family: 'manager_action',
  language: 'canonical',
  smoke: false,
} as const

export const NATIVE_REVIEW_CORPUS = [
  {
    ...common,
    id: 'native-review-notification-settings',
    query: 'Open my notification preferences',
    category: 'supported',
    expected: {
      status: 'ready',
      action: { intent: 'manager_action', kind: 'open_notification_settings' },
    },
  },
  {
    ...common,
    id: 'native-review-copy-ethereum',
    query: 'Copy the Ethereum address from marshwren.eth',
    category: 'supported',
    expected: {
      status: 'ready',
      action: {
        intent: 'manager_action',
        kind: 'copy_profile_address',
        name: 'marshwren.eth',
        addressCoinType: 60,
      },
    },
  },
  {
    ...common,
    id: 'native-review-copy-main-address',
    query: 'Copy the main receiving address for sandpiper.eth',
    category: 'supported',
    expected: {
      status: 'ready',
      action: {
        intent: 'manager_action',
        kind: 'copy_profile_address',
        name: 'sandpiper.eth',
        mainReceivingAddress: true,
      },
    },
  },
  {
    ...common,
    id: 'native-review-copy-missing-name',
    query: 'Copy the Solana profile address',
    category: 'clarification',
    expected: {
      status: 'needs_input',
      field: 'name',
      interpretedAction: {
        intent: 'manager_action',
        kind: 'copy_profile_address',
        addressCoinType: 501,
      },
    },
  },
  {
    ...common,
    id: 'native-review-copy-missing-network',
    query: 'Copy an address from plover.eth',
    category: 'clarification',
    expected: {
      status: 'needs_input',
      field: 'managerValue',
      interpretedAction: {
        intent: 'manager_action',
        kind: 'copy_profile_address',
        name: 'plover.eth',
      },
    },
  },
  {
    ...common,
    id: 'native-review-copy-forbidden-fallback',
    query:
      'Copy the Bitcoin address from marshwren.eth, but use my wallet address if it is missing',
    category: 'unsupported',
    expected: { status: 'unsupported' },
  },
] as const satisfies readonly AiEvalCase[]
