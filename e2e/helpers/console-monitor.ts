const TRANSACTION_MANAGER_PREFIX = '[TRANSACTION MANAGER]'
const REGISTRATION_IN_PROGRESS_PREFIX = '[REGISTRATION IN PROGRESS]'

export type TransactionState =
  | 'idle'
  | 'settingUpRegistration'
  | 'committing'
  | 'approving'
  | 'registering'
  | 'success'
  | 'error'

/** Page-like object that can listen to console events. */
export interface PageWithConsole {
  on(event: 'console', handler: (msg: { text(): string }) => void): void
}

export interface ConsoleMonitorOptions {
  /** Called each time a new transaction state is detected (for logging progress). */
  onStateChange?: (
    state: TransactionState,
    allStates: TransactionState[],
  ) => void
  /** Whether to log all console messages matching transaction manager prefixes. Default: true */
  logConsoleMessages?: boolean
}

/**
 * Captures console messages from the page and extracts transaction manager state updates.
 * Use with any page that supports `.on('console')`.
 */
/** One `Transaction <id> state: <state>` line, as emitted by the app. */
export interface TransactionStateLine {
  readonly txId: string
  /** Raw transaction-machine state (`pending`, `submitting`, `success`, …). */
  readonly state: string
}

/**
 * `📊 [TRANSACTION MANAGER] Transaction <id> state: <state>`
 *
 * Mirrors the observability contract documented in
 * `packages/transaction-manager/src/providers/transactionManager.ts`.
 */
const TX_STATE_LINE = /Transaction (\S+) state:\s*(\S+)/

/**
 * `📊 [TRANSACTION MANAGER] Funding permit signing: wallet=0x… value=…`
 *
 * Emitted once per EIP-2612 funding-permit signature. Counting these is how the
 * resume specs assert a resumed run costs exactly ONE re-prompt.
 */
const PERMIT_LINE = /Funding permit signing:/

export function createConsoleMonitor(
  page: PageWithConsole,
  options: ConsoleMonitorOptions = {},
): {
  getStates: () => TransactionState[]
  getLastState: () => TransactionState | null
  waitForState: (state: TransactionState, timeoutMs?: number) => Promise<void>
  waitForRegistrationComplete: (timeoutMs?: number) => Promise<void>
  /** Every `(txId, state)` pair seen, in order. */
  getTransactionLines: () => TransactionStateLine[]
  /** States seen for one transaction id, in order. */
  getStatesFor: (txId: string) => string[]
  /** Number of funding-permit signatures requested so far. */
  getPermitSignCount: () => number
  /** Resolves once `txId` reaches `state`. */
  waitForTransactionState: (
    txId: string,
    state: string,
    timeoutMs?: number,
  ) => Promise<void>
  /** Drop everything recorded so far — call right before a reload. */
  reset: () => void
} {
  const states: TransactionState[] = []
  const transactionLines: TransactionStateLine[] = []
  let permitSignCount = 0
  const { onStateChange, logConsoleMessages = true } = options

  const normalizeState = (raw: string): TransactionState | null => {
    const s = raw.toLowerCase()
    if (s.includes('success')) return 'success'
    if (s.includes('error')) return 'error'
    if (s.includes('registering') || s.includes('waitingforregistration'))
      return 'registering'
    if (s.includes('approving') || s.includes('waitingforapproval'))
      return 'approving'
    if (
      s.includes('committing') ||
      s.includes('waitingforcommitment') ||
      s.includes('commitmentcooldown') ||
      s.includes('validatingcommitment') ||
      s.includes('preparingcommitment') ||
      s.includes('settingupregistration') ||
      s.includes('deployingresolver') ||
      s.includes('waitingforresolverdeployment')
    )
      return 'committing'
    if (s.includes('idle')) return 'idle'
    return null
  }

  page.on('console', (msg) => {
    const text = msg.text()
    const isRelevant =
      text.includes(TRANSACTION_MANAGER_PREFIX) ||
      text.includes(REGISTRATION_IN_PROGRESS_PREFIX)
    if (!isRelevant) return

    // Log the console message if enabled
    if (logConsoleMessages) {
      console.log(`[Browser Console] ${text}`)
    }

    if (PERMIT_LINE.test(text)) {
      permitSignCount += 1
    }

    // Per-transaction detail, kept alongside the coarse states below: the
    // resume specs need to know WHICH transaction moved, not just that
    // something did (e.g. "no second commit" is a claim about `tx-reg-commit`).
    const txMatch = text.match(TX_STATE_LINE)
    if (txMatch?.[1] && txMatch[2]) {
      transactionLines.push({ txId: txMatch[1], state: txMatch[2] })
    }

    // Extract and track state
    const state = normalizeState(text)
    if (state) {
      states.push(state)
      onStateChange?.(state, [...states])
    }
  })

  return {
    getStates: () => [...states],
    getLastState: () => (states.length > 0 ? states[states.length - 1]! : null),

    getTransactionLines: () => [...transactionLines],

    getStatesFor: (txId: string) =>
      transactionLines.filter((line) => line.txId === txId).map((l) => l.state),

    getPermitSignCount: () => permitSignCount,

    reset: () => {
      states.length = 0
      transactionLines.length = 0
      permitSignCount = 0
    },

    waitForTransactionState: (
      txId: string,
      state: string,
      timeoutMs = 120_000,
    ) => {
      const seen = () =>
        transactionLines.some(
          (line) => line.txId === txId && line.state === state,
        )

      return new Promise((resolve, reject) => {
        if (seen()) {
          resolve()
          return
        }
        const deadline = Date.now() + timeoutMs
        const interval = setInterval(() => {
          if (seen()) {
            clearInterval(interval)
            resolve()
            return
          }
          if (Date.now() > deadline) {
            clearInterval(interval)
            reject(
              new Error(
                `Timeout waiting for ${txId} to reach "${state}". Seen: ${
                  transactionLines
                    .map((l) => `${l.txId}=${l.state}`)
                    .join(', ') || 'none'
                }`,
              ),
            )
          }
        }, 250)
      })
    },

    waitForState: (state: TransactionState, timeoutMs = 60_000) => {
      return new Promise((resolve, reject) => {
        if (states.includes(state)) {
          resolve()
          return
        }
        const deadline = Date.now() + timeoutMs
        const interval = setInterval(() => {
          if (states.includes(state)) {
            clearInterval(interval)
            resolve()
            return
          }
          if (Date.now() > deadline) {
            clearInterval(interval)
            reject(
              new Error(
                `Timeout waiting for transaction state "${state}". Seen: ${states.join(', ') || 'none'}`,
              ),
            )
          }
        }, 500)
      })
    },

    waitForRegistrationComplete: (timeoutMs = 120_000) => {
      return new Promise((resolve, reject) => {
        if (states.includes('success')) {
          resolve()
          return
        }
        const deadline = Date.now() + timeoutMs
        const interval = setInterval(() => {
          if (states.includes('success')) {
            clearInterval(interval)
            resolve()
            return
          }
          if (states.includes('error')) {
            clearInterval(interval)
            reject(new Error('Registration ended in error state'))
            return
          }
          if (Date.now() > deadline) {
            clearInterval(interval)
            reject(
              new Error(
                `Timeout waiting for registration complete. Last state: ${states[states.length - 1] ?? 'none'}`,
              ),
            )
          }
        }, 500)
      })
    },
  }
}
