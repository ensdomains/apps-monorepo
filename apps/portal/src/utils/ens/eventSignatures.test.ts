import { describe, expect, it } from 'vitest'
import {
  getEventFieldType,
  getEventFieldTypes,
  getEventSignature,
} from './eventSignatures'

describe('getEventSignature', () => {
  it('should return correct signatures for all event types', () => {
    const signatures = {
      // Domain Events
      Transfer: getEventSignature('Transfer'),
      NewOwner: getEventSignature('NewOwner'),
      NewResolver: getEventSignature('NewResolver'),
      NewTTL: getEventSignature('NewTTL'),
      NameWrapped: getEventSignature('NameWrapped'),
      NameUnwrapped: getEventSignature('NameUnwrapped'),
      FusesSet: getEventSignature('FusesSet'),
      ExpiryExtended: getEventSignature('ExpiryExtended'),

      // Registration Events
      NameRegistered: getEventSignature('NameRegistered'),
      NameRenewed: getEventSignature('NameRenewed'),
      NameTransferred: getEventSignature('NameTransferred'),

      // Resolver Events
      AddrChanged: getEventSignature('AddrChanged'),
      MulticoinAddrChanged: getEventSignature('MulticoinAddrChanged'),
      TextChanged: getEventSignature('TextChanged'),
      ContenthashChanged: getEventSignature('ContenthashChanged'),
      NameChanged: getEventSignature('NameChanged'),
      AbiChanged: getEventSignature('AbiChanged'),
      PubkeyChanged: getEventSignature('PubkeyChanged'),
      InterfaceChanged: getEventSignature('InterfaceChanged'),
      VersionChanged: getEventSignature('VersionChanged'),
      AuthorisationChanged: getEventSignature('AuthorisationChanged'),
    }

    expect(signatures).toMatchInlineSnapshot(`
      {
        "AbiChanged": "ABIChanged (bytes32 indexed node, uint256 indexed contentType)",
        "AddrChanged": "AddrChanged (bytes32 indexed node, address a)",
        "AuthorisationChanged": "AuthorisationChanged (bytes32 indexed node, address indexed owner, address indexed target, bool isAuthorised)",
        "ContenthashChanged": "ContenthashChanged (bytes32 indexed node, bytes hash)",
        "ExpiryExtended": "ExpiryExtended (bytes32 indexed node, uint64 expiry)",
        "FusesSet": "FusesSet (bytes32 indexed node, uint32 fuses)",
        "InterfaceChanged": "InterfaceChanged (bytes32 indexed node, bytes4 indexed interfaceID, address implementer)",
        "MulticoinAddrChanged": "AddressChanged (bytes32 indexed node, uint256 coinType, bytes newAddress)",
        "NameChanged": "NameChanged (bytes32 indexed node, string name)",
        "NameRegistered": "NameRegistered (string name, bytes32 indexed label, address indexed owner, uint256 cost, uint256 expires)",
        "NameRenewed": "NameRenewed (string name, bytes32 indexed label, uint256 cost, uint256 expires)",
        "NameTransferred": "NameTransferred (string name, bytes32 indexed label, address indexed newOwner)",
        "NameUnwrapped": "NameUnwrapped (bytes32 indexed node, address owner)",
        "NameWrapped": "NameWrapped (bytes32 indexed node, bytes name, address owner, uint32 fuses, uint64 expiry)",
        "NewOwner": "NewOwner (bytes32 indexed node, bytes32 indexed label, address owner)",
        "NewResolver": "NewResolver (bytes32 indexed node, address resolver)",
        "NewTTL": "NewTTL (bytes32 indexed node, uint64 ttl)",
        "PubkeyChanged": "PubkeyChanged (bytes32 indexed node, bytes32 x, bytes32 y)",
        "TextChanged": "TextChanged (bytes32 indexed node, string indexed indexedKey, string key, string value)",
        "Transfer": "Transfer (bytes32 indexed node, address owner)",
        "VersionChanged": "VersionChanged (bytes32 indexed node, uint64 newVersion)",
      }
    `)
  })

  it('should return input for unknown event types', () => {
    expect(getEventSignature('UnknownEvent')).toBe('UnknownEvent')
    expect(getEventSignature('')).toBe('')
  })
})

describe('getEventFieldType', () => {
  it('should return correct field types', () => {
    expect(getEventFieldType('Transfer', 'owner')).toBe('address')
    expect(getEventFieldType('NameWrapped', 'fuses')).toBe('uint32')
    expect(getEventFieldType('TextChanged', 'value')).toBe('string')
  })

  it('should return unknown for non-existent fields or events', () => {
    expect(getEventFieldType('Transfer', 'nonexistent')).toBe('unknown')
    expect(getEventFieldType('UnknownEvent', 'anyField')).toBe('unknown')
  })
})

describe('getEventFieldTypes', () => {
  it('should return all field types for known events', () => {
    const allFieldTypes = {
      Transfer: getEventFieldTypes('Transfer'),
      NewOwner: getEventFieldTypes('NewOwner'),
      NewResolver: getEventFieldTypes('NewResolver'),
      NewTTL: getEventFieldTypes('NewTTL'),
      NameWrapped: getEventFieldTypes('NameWrapped'),
      NameUnwrapped: getEventFieldTypes('NameUnwrapped'),
      FusesSet: getEventFieldTypes('FusesSet'),
      ExpiryExtended: getEventFieldTypes('ExpiryExtended'),
      NameRegistered: getEventFieldTypes('NameRegistered'),
      NameRenewed: getEventFieldTypes('NameRenewed'),
      NameTransferred: getEventFieldTypes('NameTransferred'),
      AddrChanged: getEventFieldTypes('AddrChanged'),
      MulticoinAddrChanged: getEventFieldTypes('MulticoinAddrChanged'),
      TextChanged: getEventFieldTypes('TextChanged'),
      ContenthashChanged: getEventFieldTypes('ContenthashChanged'),
      NameChanged: getEventFieldTypes('NameChanged'),
      AbiChanged: getEventFieldTypes('AbiChanged'),
      PubkeyChanged: getEventFieldTypes('PubkeyChanged'),
      InterfaceChanged: getEventFieldTypes('InterfaceChanged'),
      VersionChanged: getEventFieldTypes('VersionChanged'),
      AuthorisationChanged: getEventFieldTypes('AuthorisationChanged'),
    }

    expect(allFieldTypes).toMatchInlineSnapshot(`
      {
        "AbiChanged": {
          "contentType": "uint256",
        },
        "AddrChanged": {
          "addr": "address",
        },
        "AuthorisationChanged": {
          "isAuthorized": "bool",
          "owner": "address",
          "target": "address",
        },
        "ContenthashChanged": {
          "hash": "bytes",
        },
        "ExpiryExtended": {
          "expiryDate": "uint64",
        },
        "FusesSet": {
          "fuses": "uint32",
        },
        "InterfaceChanged": {
          "implementer": "address",
          "interfaceID": "bytes4",
        },
        "MulticoinAddrChanged": {
          "coinType": "uint256",
          "multiaddr": "bytes",
        },
        "NameChanged": {
          "name": "string",
        },
        "NameRegistered": {
          "expiryDate": "uint256",
          "registrant": "address",
        },
        "NameRenewed": {
          "expiryDate": "uint256",
        },
        "NameTransferred": {
          "newOwner": "address",
        },
        "NameUnwrapped": {
          "owner": "address",
        },
        "NameWrapped": {
          "expiryDate": "uint64",
          "fuses": "uint32",
          "name": "string",
          "owner": "address",
        },
        "NewOwner": {
          "owner": "address",
        },
        "NewResolver": {
          "resolver": "address",
        },
        "NewTTL": {
          "ttl": "uint64",
        },
        "PubkeyChanged": {
          "x": "bytes32",
          "y": "bytes32",
        },
        "TextChanged": {
          "key": "string",
          "value": "string",
        },
        "Transfer": {
          "owner": "address",
        },
        "VersionChanged": {
          "version": "uint64",
        },
      }
    `)
  })

  it('should return undefined for unknown event types', () => {
    expect(getEventFieldTypes('UnknownEvent')).toBeUndefined()
    expect(getEventFieldTypes('')).toBeUndefined()
  })
})
