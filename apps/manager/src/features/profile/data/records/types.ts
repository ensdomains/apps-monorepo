import type { StandardSchemaV1 } from '@tanstack/react-form'
import type { sections, specialSections, staticTextRecords } from './text'

// Section types
export type Section = keyof typeof sections
export type SpecialSection = (typeof specialSections)[number]
export type AnySection = Section | SpecialSection

export type SectionData = {
  label: string
  description?: string
  hidden?: boolean
}

export type StaticRecordKey = (typeof staticTextRecords)[number]

// Base record type that all records extend
type BaseRecord = {
  name: string
  description?: string
  icon?: React.FC<{ className?: string }> | string
  placeholder?: string
  required?: boolean
  /**
   * Priority for display in the UI.
   *
   * - `suggested` - Display in the suggested section.
   * - `others` - Display in the others section.
   *
   * @default 'others'
   */
  visibility?: 'suggested' | 'others'
  validate?: {
    onChange?: StandardSchemaV1
    onBlur?: StandardSchemaV1
    onSubmit?: StandardSchemaV1
    onMount?: StandardSchemaV1
  }
}

type BaseAddressRecord = BaseRecord & {
  coinType: number
}

// Enhanced text record with validation and UI configuration
type TextRecordBase = BaseRecord & {
  key: string
  section: Section | SpecialSection
  displayPrefix?: string
  // Always attempt to resolve even if not discovered on-chain yet
  alwaysProbe?: boolean
}

type TextRecordKind =
  | {
      kind: 'link'
      /**
       * The base URL to use for the link.
       * - If `href` is a string, it will be prefixed to the URI-escaped record value.
       * - If `href` is a function, it will be called with the text record value, and the function is responsible for escaping the value as needed.
       */
      href: string | ((value: string) => string)
    }
  | {
      /** Copy the value to the clipboard @default */
      kind?: 'copy'
    }
  | {
      kind: 'custom'
      render: (value: string) => React.ReactNode
    }

export type TextRecordDef = TextRecordBase & TextRecordKind

// Enhanced address record
export type AddressRecordDef = BaseAddressRecord & {
  notation?: string
}
