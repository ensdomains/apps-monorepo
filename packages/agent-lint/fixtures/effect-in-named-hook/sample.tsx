import { useEffect } from 'react'
declare const load: () => Promise<void>
export const Long = () => {
  useEffect(() => { // expect: effect-in-named-hook
    const a = 1
    const b = 2
    const c = 3
    const d = 4
    const e = 5
    console.log(a, b, c, d, e)
  }, [])
  return null
}
export const Async = () => {
  useEffect(() => { // expect: effect-in-named-hook
    const run = async () => {
      await load()
    }
    void run()
  }, [])
  return null
}
export const FiveWithComments = () => {
  useEffect(() => {
    // Keep the title in step with the page.
    const a = 1

    const b = 2
    // The third value is derived.
    const c = a + b
    document.title = String(c)
  }, [])
  return null
}
export const useSync = () => {
  useEffect(() => {
    const a = 1
    const b = 2
    const c = 3
    const d = 4
    const e = 5
    console.log(a, b, c, d, e)
  }, [])
}
