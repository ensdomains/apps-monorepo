import { Buffer } from 'buffer'

// @cowprotocol/permit-utils delegates EIP-2612 calldata assembly to 1inch's
// permit utility, which expects Node's Buffer global in the browser. CoW Swap
// installs the same bootstrap before loading its application.
const browserWindow = window as typeof window & {
  Buffer?: typeof Buffer
  global?: typeof globalThis
}

browserWindow.global ??= globalThis
browserWindow.Buffer ??= Buffer
