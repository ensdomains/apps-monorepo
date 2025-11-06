/**
 * L2 Reverse Registrar ABI Snippets
 */

/**
 * Read: Get the name for an address
 */
export const l2ReverseRegistrarNameForAddrSnippet = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'addr',
        type: 'address',
      },
    ],
    name: 'nameForAddr',
    outputs: [
      {
        internalType: 'string',
        name: 'name',
        type: 'string',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

/**
 * Write: Set name for caller's address
 */
export const l2ReverseRegistrarSetNameSnippet = [
  {
    inputs: [
      {
        internalType: 'string',
        name: 'name',
        type: 'string',
      },
    ],
    name: 'setName',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

/**
 * Write: Set name for a specific address
 */
export const l2ReverseRegistrarSetNameForAddrSnippet = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'addr',
        type: 'address',
      },
      {
        internalType: 'string',
        name: 'name',
        type: 'string',
      },
    ],
    name: 'setNameForAddr',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const
