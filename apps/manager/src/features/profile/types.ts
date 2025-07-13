import type { ReactNode } from 'react'

// Types
export type TextRecord = {
  name: string
  key: string
  icon?: ReactNode
  placeholder?: string
}

export type AddressRecord = {
  name: string
  notation?: string
  coinType: number
  icon?: ReactNode
}

export type ProfileRecordsResult = {
  texts: Record<string, string>
  addresses: Record<number, string>
}

type KeyValue = {
  key: string
  value?: string
}

export type ProfileRecords = {
  bio: {
    avatar?: string
    header?: string
    description?: string
    url?: string
  }
  contacts: KeyValue[]
  social: KeyValue[]
  addresses: {
    coinType: number
    value?: string
  }[]
  links: {
    name: string
    url: string
  }[]
}
