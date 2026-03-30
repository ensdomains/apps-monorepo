import { Temporal } from '@js-temporal/polyfill'
import '@testing-library/jest-dom/vitest'

// Ensure Temporal exists globally for shared packages (e.g. transaction-manager).
;(globalThis as unknown as { Temporal: typeof Temporal }).Temporal = Temporal
