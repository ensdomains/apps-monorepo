/**
 * Invokes a thunk and returns its result. Useful for simplifying render-loop
 * JSX: wrap complex inline expressions in `run(() => { ... })` for better
 * readability instead of IIFEs or scattered variables.
 */
export const run = <T>(method: () => T): T => method()
