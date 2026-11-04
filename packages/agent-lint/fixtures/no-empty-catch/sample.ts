declare const work: () => void
declare const p: Promise<number>
declare const isNumber: (v: unknown) => v is number

export const swallowBare = () => {
  try {
    work()
  } catch {} // expect: no-empty-catch
}

export const swallowNamed = () => {
  try {
    work()
  } catch (error) {} // expect: no-empty-catch
}

export const swallowShortNote = () => {
  try {
    work()
  } catch { // expect: no-empty-catch
    // noop
  }
}

export const explained = () => {
  try {
    work()
  } catch {
    // Storage the browser refuses to open holds nothing to forget.
  }
}

export const swallowStatement = () => {
  p.catch(() => {}) // expect: no-empty-catch
}
export const swallowAwaited = async () => {
  await p.catch(() => undefined) // expect: no-empty-catch
}
export const swallowVoided = () => {
  void p.catch((_error) => null) // expect: no-empty-catch
}
export const explainedPromise = () => {
  p.catch(() => {
    /* the beacon is best-effort; a lost ping changes nothing */
  })
}

export const handled = () => {
  try {
    work()
  } catch (error) {
    console.error(error)
  }
}
export const sentinelChecked = async () => {
  const value = await p.catch(() => undefined)
  return isNumber(value) ? value : 0
}
export const defaults = { accept: () => {}, decline: () => {} }
