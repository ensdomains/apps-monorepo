export const registryOwnerOfSnippet = [
  {
    name: 'ownerOf',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: 'owner', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const
