/**
 * A container accepts one expensive Chromium capture at a time. Busy requests
 * are rejected and retried durably by Cloudflare Workflows; nothing is queued
 * in this process.
 */
export class CaptureAdmission {
  #active = false

  acquire(): (() => void) | undefined {
    if (this.#active) return undefined
    this.#active = true

    let released = false
    return () => {
      if (released) return
      released = true
      this.#active = false
    }
  }
}
