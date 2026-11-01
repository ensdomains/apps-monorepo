declare const createPublicClient: (config: object) => unknown
declare const createWalletClient: (config: object) => unknown
export const client = createPublicClient({})
export const make = () => createPublicClient({}) // expect: no-client-in-function
export function wallet() {
  return createWalletClient({}) // expect: no-client-in-function
}
