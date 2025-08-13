import type { Prettify } from 'viem'
import type {
  Section,
  SpecialSection,
  StaticRecordKey,
  TextRecordDef,
} from './data/records/types'

// Record value types
export type TextRecordValue = {
  key: string
  value: string
}

export type AddressRecordValue = {
  coinType: number
  value: string
}

export type LinkItem = {
  name: string
  url: string
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
