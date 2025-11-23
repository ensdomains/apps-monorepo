export const ETH_REGISTRY_ABI = [
  {
    inputs: [
      {
        internalType: 'string',
        name: 'label',
        type: 'string',
      },
    ],
    name: 'getNameData',
    outputs: [
      {
        internalType: 'uint256',
        name: 'tokenId',
        type: 'uint256',
      },
      {
        components: [
          {
            internalType: 'uint64',
            name: 'expiry',
            type: 'uint64',
          },
          {
            internalType: 'uint32',
            name: 'tokenVersionId',
            type: 'uint32',
          },
          {
            internalType: 'address',
            name: 'subregistry',
            type: 'address',
          },
          {
            internalType: 'uint32',
            name: 'eacVersionId',
            type: 'uint32',
          },
          {
            internalType: 'address',
            name: 'resolver',
            type: 'address',
          },
        ],
        internalType: 'struct IRegistryDatastore.Entry',
        name: 'entry',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'tokenId',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: 'resolver',
        type: 'address',
      },
    ],
    name: 'setResolver',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const
