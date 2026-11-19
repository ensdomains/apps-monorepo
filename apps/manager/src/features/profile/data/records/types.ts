import type { PROFILE_SECTIONS, STATIC_TEXT_RECORD_KEYS } from './textMetadata'

export type ProfileSection = (typeof PROFILE_SECTIONS)[number]
export type StaticRecordKey = (typeof STATIC_TEXT_RECORD_KEYS)[number]

// Base record type that all records extend
type BaseRecord = {
  name: string
  icon?: React.FC<{ className?: string }> | string
  placeholder?: string
}

// Enhanced text record with validation and UI configuration
type TextRecordBase = BaseRecord & {
  key: string
  section: ProfileSection
  displayPrefix?: string
  normalize?: (value: string) => string
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
