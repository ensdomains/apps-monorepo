import { describe, expect, it } from 'vitest'
import {
  getEventFieldType,
  getEventFieldTypes,
  getEventSignature,
} from './eventSignatures'

describe('getEventSignature', () => {
  describe('Domain Events', () => {
    it('should return signature for Transfer event', () => {
      expect(getEventSignature('Transfer')).toBe(
        'Transfer (bytes32 indexed node, address owner)',
      )
    })

    it('should return signature for NewOwner event', () => {
      expect(getEventSignature('NewOwner')).toBe(
        'NewOwner (bytes32 indexed node, bytes32 indexed label, address owner)',
      )
    })

    it('should return signature for NewResolver event', () => {
      expect(getEventSignature('NewResolver')).toBe(
        'NewResolver (bytes32 indexed node, address resolver)',
      )
    })

    it('should return signature for NameWrapped event', () => {
      expect(getEventSignature('NameWrapped')).toBe(
        'NameWrapped (bytes32 indexed node, bytes name, address owner, uint32 fuses, uint64 expiry)',
      )
    })

    it('should return signature for FusesSet event', () => {
      expect(getEventSignature('FusesSet')).toBe(
        'FusesSet (bytes32 indexed node, uint32 fuses)',
      )
    })
  })

  describe('Registration Events', () => {
    it('should return signature for NameRegistered event', () => {
      expect(getEventSignature('NameRegistered')).toBe(
        'NameRegistered (string name, bytes32 indexed label, address indexed owner, uint256 cost, uint256 expires)',
      )
    })

    it('should return signature for NameRenewed event', () => {
      expect(getEventSignature('NameRenewed')).toBe(
        'NameRenewed (string name, bytes32 indexed label, uint256 cost, uint256 expires)',
      )
    })

    it('should return signature for NameTransferred event', () => {
      expect(getEventSignature('NameTransferred')).toBe(
        'NameTransferred (string name, bytes32 indexed label, address indexed newOwner)',
      )
    })
  })

  describe('Resolver Events', () => {
    it('should return signature for AddrChanged event', () => {
      expect(getEventSignature('AddrChanged')).toBe(
        'AddrChanged (bytes32 indexed node, address a)',
      )
    })

    it('should return signature for MulticoinAddrChanged event', () => {
      expect(getEventSignature('MulticoinAddrChanged')).toBe(
        'AddressChanged (bytes32 indexed node, uint256 coinType, bytes newAddress)',
      )
    })

    it('should return signature for TextChanged event', () => {
      expect(getEventSignature('TextChanged')).toBe(
        'TextChanged (bytes32 indexed node, string indexed indexedKey, string key, string value)',
      )
    })

    it('should return signature for ContenthashChanged event', () => {
      expect(getEventSignature('ContenthashChanged')).toBe(
        'ContenthashChanged (bytes32 indexed node, bytes hash)',
      )
    })
  })

  describe('unknown event types', () => {
    it('should return the input string for unknown event types', () => {
      expect(getEventSignature('UnknownEvent')).toBe('UnknownEvent')
      expect(getEventSignature('CustomEvent')).toBe('CustomEvent')
    })

    it('should handle empty string', () => {
      expect(getEventSignature('')).toBe('')
    })
  })
})

describe('getEventFieldType', () => {
  describe('Transfer event', () => {
    it('should return address type for owner field', () => {
      expect(getEventFieldType('Transfer', 'owner')).toBe('address')
    })

    it('should return unknown for non-existent field', () => {
      expect(getEventFieldType('Transfer', 'nonexistent')).toBe('unknown')
    })
  })

  describe('NameWrapped event', () => {
    it('should return correct types for all fields', () => {
      expect(getEventFieldType('NameWrapped', 'name')).toBe('string')
      expect(getEventFieldType('NameWrapped', 'owner')).toBe('address')
      expect(getEventFieldType('NameWrapped', 'fuses')).toBe('uint32')
      expect(getEventFieldType('NameWrapped', 'expiryDate')).toBe('uint64')
    })
  })

  describe('NameRegistered event', () => {
    it('should return correct types', () => {
      expect(getEventFieldType('NameRegistered', 'registrant')).toBe('address')
      expect(getEventFieldType('NameRegistered', 'expiryDate')).toBe('uint256')
    })
  })

  describe('MulticoinAddrChanged event', () => {
    it('should return correct types', () => {
      expect(getEventFieldType('MulticoinAddrChanged', 'coinType')).toBe(
        'uint256',
      )
      expect(getEventFieldType('MulticoinAddrChanged', 'multiaddr')).toBe(
        'bytes',
      )
    })
  })

  describe('TextChanged event', () => {
    it('should return correct types', () => {
      expect(getEventFieldType('TextChanged', 'key')).toBe('string')
      expect(getEventFieldType('TextChanged', 'value')).toBe('string')
    })
  })

  describe('unknown event types', () => {
    it('should return unknown for unknown event types', () => {
      expect(getEventFieldType('UnknownEvent', 'anyField')).toBe('unknown')
    })

    it('should return unknown for empty event type', () => {
      expect(getEventFieldType('', 'field')).toBe('unknown')
    })
  })
})

describe('getEventFieldTypes', () => {
  describe('valid event types', () => {
    it('should return all field types for Transfer event', () => {
      const types = getEventFieldTypes('Transfer')
      expect(types).toEqual({ owner: 'address' })
    })

    it('should return all field types for NameWrapped event', () => {
      const types = getEventFieldTypes('NameWrapped')
      expect(types).toEqual({
        name: 'string',
        owner: 'address',
        fuses: 'uint32',
        expiryDate: 'uint64',
      })
    })

    it('should return all field types for NameRegistered event', () => {
      const types = getEventFieldTypes('NameRegistered')
      expect(types).toEqual({
        registrant: 'address',
        expiryDate: 'uint256',
      })
    })

    it('should return all field types for TextChanged event', () => {
      const types = getEventFieldTypes('TextChanged')
      expect(types).toEqual({
        key: 'string',
        value: 'string',
      })
    })

    it('should return all field types for AuthorisationChanged event', () => {
      const types = getEventFieldTypes('AuthorisationChanged')
      expect(types).toEqual({
        owner: 'address',
        target: 'address',
        isAuthorized: 'bool',
      })
    })
  })

  describe('unknown event types', () => {
    it('should return undefined for unknown event types', () => {
      expect(getEventFieldTypes('UnknownEvent')).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      expect(getEventFieldTypes('')).toBeUndefined()
    })
  })

  describe('comprehensive event coverage', () => {
    it('should handle all Domain events', () => {
      expect(getEventFieldTypes('NewOwner')).toBeDefined()
      expect(getEventFieldTypes('NewResolver')).toBeDefined()
      expect(getEventFieldTypes('NewTTL')).toBeDefined()
      expect(getEventFieldTypes('NameUnwrapped')).toBeDefined()
      expect(getEventFieldTypes('FusesSet')).toBeDefined()
      expect(getEventFieldTypes('ExpiryExtended')).toBeDefined()
    })

    it('should handle all Registration events', () => {
      expect(getEventFieldTypes('NameRegistered')).toBeDefined()
      expect(getEventFieldTypes('NameRenewed')).toBeDefined()
      expect(getEventFieldTypes('NameTransferred')).toBeDefined()
    })

    it('should handle all Resolver events', () => {
      expect(getEventFieldTypes('AddrChanged')).toBeDefined()
      expect(getEventFieldTypes('MulticoinAddrChanged')).toBeDefined()
      expect(getEventFieldTypes('NameChanged')).toBeDefined()
      expect(getEventFieldTypes('AbiChanged')).toBeDefined()
      expect(getEventFieldTypes('PubkeyChanged')).toBeDefined()
      expect(getEventFieldTypes('ContenthashChanged')).toBeDefined()
      expect(getEventFieldTypes('InterfaceChanged')).toBeDefined()
      expect(getEventFieldTypes('VersionChanged')).toBeDefined()
    })
  })
})
