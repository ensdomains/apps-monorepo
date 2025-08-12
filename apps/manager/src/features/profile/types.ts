import type { StandardSchemaV1 } from '@tanstack/react-form'
import React from 'react'
import type { Prettify } from 'viem'
import type { BaseRecordKey, RecordCategory } from './data/records'

// Base record type that all records extend
export type BaseRecord = {
  name: string
  description?: string
  icon?: React.FC<{ className?: string }> | string
  placeholder?: string
  required?: boolean
  validate?: {
    onChange?: StandardSchemaV1
    onBlur?: StandardSchemaV1
    onSubmit?: StandardSchemaV1
    onMount?: StandardSchemaV1
  }
}

export type BaseTextRecord = BaseRecord & {
  key: string
}

export type BaseAddressRecord = BaseRecord & {
  coinType: number
}

// Enhanced text record with validation and UI configuration
export type TextRecord = BaseTextRecord & {
  // type: 'text'
  displayPrefix?: string
  hrefBase?: string
}

// Enhanced address record
export type AddressRecord = BaseAddressRecord & {
  // type: 'address'
  coinType: number
  notation?: string
}

// Links record for custom links
export type LinksRecord = BaseRecord & {
  type: 'links'
  maxLinks?: number
}

// Union type for all record types
export type RecordDefinition = TextRecord

export type AddressDefinition = AddressRecord

// Record value types
export type TextRecordValue = {
  key: string
  value: string
}

export type KnownTextRecordValue = TextRecordValue & {
  category: RecordCategory
  data: RecordDefinition
}

export type AddressRecordValue = {
  coinType: number
  value: string
}

export type LinkItem = {
  name: string
  url: string
}

// Form data structure - all arrays for dynamic forms
export type ProfileBaseRecords = {
  [key in BaseRecordKey]?: string
}

export type ProfileRecords = Prettify<
  {
    [key in RecordCategory]: TextRecordValue[]
  } & {
    base: ProfileBaseRecords
    addresses: AddressRecordValue[]
    links: LinkItem[]
    unknown: TextRecordValue[] // For any custom records
  }
>

// Helper types
export type RecordValue = TextRecordValue | AddressRecordValue

// Form field configuration for dynamic rendering
export type FormFieldConfig = {
  record: RecordDefinition
  value: RecordValue
  onChange: (value: RecordValue) => void
  onRemove: () => void
  error?: string
}
