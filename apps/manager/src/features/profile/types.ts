import type { Address, Prettify } from 'viem'
import type {
  Section,
  SpecialSection,
  StaticRecordKey,
  TextRecordDef,
} from './data/records/types'

// Record value types
export type TextRecordValue = {
  readonly key: string
  readonly value: string
}

export type AddressRecordValue = {
  readonly coinType: number
  readonly value: string
}

export type LinkItem = {
  readonly name: string
  readonly url: string
}

export type ProfileRecords = Prettify<
  {
    [key in Section | SpecialSection]: TextRecordValue[]
  } & {
    base: {
      [key in StaticRecordKey]?: string
    }
    addresses: AddressRecordValue[]
    links: LinkItem[]
    unknown: TextRecordValue[] // For any custom records
    resolverAddress?: Address
  }
>

// Helper types
export type RecordValue = TextRecordValue | AddressRecordValue

// Form field configuration for dynamic rendering
export type FormFieldConfig = {
  record: TextRecordDef
  value: RecordValue
  onChange: (value: RecordValue) => void
  onRemove: () => void
  error?: string
}
