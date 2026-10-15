// Bound parsing and normalization of resolver-controlled primary-contact JSON.
export const MAX_PRIMARY_CONTACTS_RECORD_BYTES = 4 * 1024
export const MAX_PRIMARY_CONTACTS_RECORD_ITEMS = 64

export const isWithinPrimaryContactsRecordSize = (value: string): boolean =>
  // Check code units first to avoid allocating an unbounded UTF-8 buffer.
  value.length <= MAX_PRIMARY_CONTACTS_RECORD_BYTES &&
  new TextEncoder().encode(value).byteLength <=
    MAX_PRIMARY_CONTACTS_RECORD_BYTES
