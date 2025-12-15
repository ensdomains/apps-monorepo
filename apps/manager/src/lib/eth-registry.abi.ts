export const ETH_REGISTRY_ABI = [
  {
    inputs: [
      {
        internalType: 'contract IRegistryDatastore',
        name: 'datastore',
        type: 'address',
      },
      {
        internalType: 'contract IHCAFactoryBasic',
        name: 'hcaFactory',
        type: 'address',
      },
      {
        internalType: 'contract IRegistryMetadata',
        name: 'metadata',
        type: 'address',
      },
      { internalType: 'address', name: 'ownerAddress', type: 'address' },
      { internalType: 'uint256', name: 'ownerRoles', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'caller', type: 'address' },
    ],
    name: 'AccessDenied',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'uint64', name: 'oldExpiration', type: 'uint64' },
      { internalType: 'uint64', name: 'newExpiration', type: 'uint64' },
    ],
    name: 'CannotReduceExpiration',
    type: 'error',
  },
  {
    inputs: [{ internalType: 'uint64', name: 'expiry', type: 'uint64' }],
    name: 'CannotSetPastExpiration',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'resource', type: 'uint256' },
      { internalType: 'uint256', name: 'roleBitmap', type: 'uint256' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    name: 'EACCannotGrantRoles',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'resource', type: 'uint256' },
      { internalType: 'uint256', name: 'roleBitmap', type: 'uint256' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    name: 'EACCannotRevokeRoles',
    type: 'error',
  },
  { inputs: [], name: 'EACInvalidAccount', type: 'error' },
  {
    inputs: [{ internalType: 'uint256', name: 'roleBitmap', type: 'uint256' }],
    name: 'EACInvalidRoleBitmap',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'resource', type: 'uint256' },
      { internalType: 'uint256', name: 'role', type: 'uint256' },
    ],
    name: 'EACMaxAssignees',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'resource', type: 'uint256' },
      { internalType: 'uint256', name: 'role', type: 'uint256' },
    ],
    name: 'EACMinAssignees',
    type: 'error',
  },
  { inputs: [], name: 'EACRootResourceNotAllowed', type: 'error' },
  {
    inputs: [
      { internalType: 'uint256', name: 'resource', type: 'uint256' },
      { internalType: 'uint256', name: 'roleBitmap', type: 'uint256' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    name: 'EACUnauthorizedAccountRoles',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'address', name: 'sender', type: 'address' },
      { internalType: 'uint256', name: 'balance', type: 'uint256' },
      { internalType: 'uint256', name: 'needed', type: 'uint256' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'ERC1155InsufficientBalance',
    type: 'error',
  },
  {
    inputs: [{ internalType: 'address', name: 'approver', type: 'address' }],
    name: 'ERC1155InvalidApprover',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'idsLength', type: 'uint256' },
      { internalType: 'uint256', name: 'valuesLength', type: 'uint256' },
    ],
    name: 'ERC1155InvalidArrayLength',
    type: 'error',
  },
  {
    inputs: [{ internalType: 'address', name: 'operator', type: 'address' }],
    name: 'ERC1155InvalidOperator',
    type: 'error',
  },
  {
    inputs: [{ internalType: 'address', name: 'receiver', type: 'address' }],
    name: 'ERC1155InvalidReceiver',
    type: 'error',
  },
  {
    inputs: [{ internalType: 'address', name: 'sender', type: 'address' }],
    name: 'ERC1155InvalidSender',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'address', name: 'operator', type: 'address' },
      { internalType: 'address', name: 'owner', type: 'address' },
    ],
    name: 'ERC1155MissingApprovalForAll',
    type: 'error',
  },
  {
    inputs: [{ internalType: 'string', name: 'label', type: 'string' }],
    name: 'NameAlreadyRegistered',
    type: 'error',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'NameExpired',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'address', name: 'from', type: 'address' },
    ],
    name: 'TransferDisallowed',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'owner',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'approved',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'tokenId',
        type: 'uint256',
      },
    ],
    name: 'Approval',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'operator',
        type: 'address',
      },
      { indexed: false, internalType: 'bool', name: 'approved', type: 'bool' },
    ],
    name: 'ApprovalForAll',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'resource',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'oldRoleBitmap',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'newRoleBitmap',
        type: 'uint256',
      },
    ],
    name: 'EACRolesChanged',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'tokenId',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint64',
        name: 'newExpiry',
        type: 'uint64',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'changedBy',
        type: 'address',
      },
    ],
    name: 'ExpiryUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'tokenId',
        type: 'uint256',
      },
      { indexed: false, internalType: 'string', name: 'label', type: 'string' },
      {
        indexed: false,
        internalType: 'uint64',
        name: 'expiry',
        type: 'uint64',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'registeredBy',
        type: 'address',
      },
    ],
    name: 'NameRegistered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'tokenId',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'resolver',
        type: 'address',
      },
    ],
    name: 'ResolverUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'tokenId',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'contract IRegistry',
        name: 'subregistry',
        type: 'address',
      },
    ],
    name: 'SubregistryUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'tokenId',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'contract ITokenObserver',
        name: 'observer',
        type: 'address',
      },
    ],
    name: 'TokenObserverUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'oldTokenId',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'newTokenId',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'resource',
        type: 'uint256',
      },
    ],
    name: 'TokenRegenerated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'operator',
        type: 'address',
      },
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      {
        indexed: false,
        internalType: 'uint256[]',
        name: 'ids',
        type: 'uint256[]',
      },
      {
        indexed: false,
        internalType: 'uint256[]',
        name: 'values',
        type: 'uint256[]',
      },
    ],
    name: 'TransferBatch',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'operator',
        type: 'address',
      },
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'id', type: 'uint256' },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'value',
        type: 'uint256',
      },
    ],
    name: 'TransferSingle',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'string', name: 'value', type: 'string' },
      { indexed: true, internalType: 'uint256', name: 'id', type: 'uint256' },
    ],
    name: 'URI',
    type: 'event',
  },
  {
    inputs: [],
    name: 'DATASTORE',
    outputs: [
      {
        internalType: 'contract IRegistryDatastore',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'HCA_FACTORY',
    outputs: [
      { internalType: 'contract IHCAFactoryBasic', name: '', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'METADATA_PROVIDER',
    outputs: [
      { internalType: 'contract IRegistryMetadata', name: '', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'ROOT_RESOURCE',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'account', type: 'address' },
      { internalType: 'uint256', name: 'id', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address[]', name: 'accounts', type: 'address[]' },
      { internalType: 'uint256[]', name: 'ids', type: 'uint256[]' },
    ],
    name: 'balanceOfBatch',
    outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'anyId', type: 'uint256' },
      { internalType: 'uint256', name: 'roleBitmap', type: 'uint256' },
    ],
    name: 'getAssigneeCount',
    outputs: [
      { internalType: 'uint256', name: 'counts', type: 'uint256' },
      { internalType: 'uint256', name: 'mask', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'anyId', type: 'uint256' }],
    name: 'getEntry',
    outputs: [
      {
        components: [
          { internalType: 'uint64', name: 'expiry', type: 'uint64' },
          { internalType: 'uint32', name: 'tokenVersionId', type: 'uint32' },
          {
            internalType: 'contract IRegistry',
            name: 'subregistry',
            type: 'address',
          },
          { internalType: 'uint32', name: 'eacVersionId', type: 'uint32' },
          { internalType: 'address', name: 'resolver', type: 'address' },
        ],
        internalType: 'struct IRegistryDatastore.Entry',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'anyId', type: 'uint256' }],
    name: 'getExpiry',
    outputs: [{ internalType: 'uint64', name: '', type: 'uint64' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'label', type: 'string' }],
    name: 'getNameData',
    outputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      {
        components: [
          { internalType: 'uint64', name: 'expiry', type: 'uint64' },
          { internalType: 'uint32', name: 'tokenVersionId', type: 'uint32' },
          {
            internalType: 'contract IRegistry',
            name: 'subregistry',
            type: 'address',
          },
          { internalType: 'uint32', name: 'eacVersionId', type: 'uint32' },
          { internalType: 'address', name: 'resolver', type: 'address' },
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
    inputs: [{ internalType: 'string', name: 'label', type: 'string' }],
    name: 'getResolver',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'anyId', type: 'uint256' }],
    name: 'getResource',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'label', type: 'string' }],
    name: 'getSubregistry',
    outputs: [
      { internalType: 'contract IRegistry', name: '', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'anyId', type: 'uint256' }],
    name: 'getTokenId',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'anyId', type: 'uint256' }],
    name: 'getTokenObserver',
    outputs: [
      { internalType: 'contract ITokenObserver', name: '', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'anyId', type: 'uint256' },
      { internalType: 'uint256', name: 'roleBitmap', type: 'uint256' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    name: 'grantRoles',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'roleBitmap', type: 'uint256' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    name: 'grantRootRoles',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'anyId', type: 'uint256' },
      { internalType: 'uint256', name: 'roleBitmap', type: 'uint256' },
    ],
    name: 'hasAssignees',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'anyId', type: 'uint256' },
      { internalType: 'uint256', name: 'rolesBitmap', type: 'uint256' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    name: 'hasRoles',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'rolesBitmap', type: 'uint256' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    name: 'hasRootRoles',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'account', type: 'address' },
      { internalType: 'address', name: 'operator', type: 'address' },
    ],
    name: 'isApprovedForAll',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'latestOwnerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'label', type: 'string' },
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'contract IRegistry', name: 'registry', type: 'address' },
      { internalType: 'address', name: 'resolver', type: 'address' },
      { internalType: 'uint256', name: 'roleBitmap', type: 'uint256' },
      { internalType: 'uint64', name: 'expires', type: 'uint64' },
    ],
    name: 'register',
    outputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'anyId', type: 'uint256' },
      { internalType: 'uint64', name: 'newExpiry', type: 'uint64' },
    ],
    name: 'renew',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'anyId', type: 'uint256' },
      { internalType: 'uint256', name: 'roleBitmap', type: 'uint256' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    name: 'revokeRoles',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'roleBitmap', type: 'uint256' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    name: 'revokeRootRoles',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'anyId', type: 'uint256' }],
    name: 'roleCount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'anyId', type: 'uint256' },
      { internalType: 'address', name: 'account', type: 'address' },
    ],
    name: 'roles',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'from', type: 'address' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256[]', name: 'ids', type: 'uint256[]' },
      { internalType: 'uint256[]', name: 'values', type: 'uint256[]' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
    ],
    name: 'safeBatchTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'from', type: 'address' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'id', type: 'uint256' },
      { internalType: 'uint256', name: 'value', type: 'uint256' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
    ],
    name: 'safeTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'operator', type: 'address' },
      { internalType: 'bool', name: 'approved', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'anyId', type: 'uint256' },
      { internalType: 'address', name: 'resolver', type: 'address' },
    ],
    name: 'setResolver',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'anyId', type: 'uint256' },
      { internalType: 'contract IRegistry', name: 'registry', type: 'address' },
    ],
    name: 'setSubregistry',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'anyId', type: 'uint256' },
      {
        internalType: 'contract ITokenObserver',
        name: 'observer',
        type: 'address',
      },
    ],
    name: 'setTokenObserver',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes4', name: 'interfaceId', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'anyId', type: 'uint256' }],
    name: 'unregister',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'uri',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const
