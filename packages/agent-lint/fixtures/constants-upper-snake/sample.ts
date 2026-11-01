export const timeoutMs = 30_000 // expect: constants-upper-snake
export const MAX_RETRIES = 3
export const registry = '0x796fff2e907449be8d5921bcc215b1b76d89d080' // expect: constants-upper-snake
export const label = 'not a constant by this rule'
export const make = () => {
  const local = 3
  return local
}
