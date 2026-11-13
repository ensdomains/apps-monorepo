export const title = 'ENS manager migration promises at commit 6977db2d7'

const finalLabels = {
  A1: 'Wallet prompts by tab',
  A2: 'Cancelled run',
  A3: 'Intent and recovery before prompt',
  A4: 'Hash replaces intent',
  A5: 'Unavailable receipt',
  A6: 'Reverted attempt',
  A7: 'Rejected wallet prompt',
  A8: 'Temporary approval cleanup',
  B1: 'Submit-time source checks',
  B2: 'Restored authority',
  B3: 'Live subregistry',
  B4: 'Locked-name record control',
  B5: 'Roles required by planned work',
  C1: 'Completion proof',
  C2: 'Crash-safe checkpoint',
  C3: 'Operation identity',
  C4: 'All required work',
  C5: 'Partial result and refreshed views',
  C6: 'Historical deployment evidence',
  D1: 'Retry work set',
  D2: 'Recovery snapshot cleanup',
  D3: 'Concurrent journal writes',
  D4: 'Cleanup-only recovery',
  D5: 'Uncertain reconciliation',
  E1: 'Atomic name tree',
  E2: 'Wallet record replay',
  E3: 'Non-null classification buckets',
  E4: 'Copy route',
  E5: 'Unknown-label consent',
  E6: 'Expiry clock',
  E7: 'Chained plan simulation',
  F1: 'Grace renewal',
  G1: 'Run termination',
  G2: 'Pending transaction resolution',
  G3: 'Retry eligibility',
  G4: 'Progress total',
  G5: 'Recoverability',
  CORE: 'Contract workflow',
}

export const state = (value) => [
  value.scenario,
  value.state.phase === 0
    ? 'Ready'
    : value.state.phase === 99
      ? finalLabels[value.scenario]
      : `Step ${value.state.phase}`,
]

export const step = (action) => {
  if (action === 'Done') return null
  if (action.startsWith('A1First')) return 'the first tab opens a wallet prompt'
  if (action.startsWith('A1Second')) return 'a second tab starts the same scope'
  if (action.startsWith('A2Cancel')) return 'you leave while the run continues'
  if (action.startsWith('A3')) return 'the atomic batch reaches the wallet'
  if (action.startsWith('A4')) return 'the wallet returns a transaction hash'
  if (action.startsWith('A5')) return 'the receipt read is unavailable'
  if (action.startsWith('Core'))
    return action
      .replace(/^Core/, '')
      .replaceAll(/([A-Z])/g, ' $1')
      .trim()
  return action.replaceAll(/([A-Z])/g, ' $1').trim()
}

export const group = (value) => {
  if (value.state.phase === 0) return 'ready'
  if (value.state.phase !== 99) return 'running'
  if (value.state.completionClaimed || value.state.lifecycle === 'success')
    return 'complete'
  if (value.state.lifecycle === 'blocked') return 'blocked'
  if (value.state.lifecycle === 'failure') return 'failure'
  return 'settled'
}

export const colors = {
  ready: 'blue',
  running: 'yellow',
  complete: 'teal',
  blocked: 'orange',
  failure: 'pink',
  settled: 'purple',
}
