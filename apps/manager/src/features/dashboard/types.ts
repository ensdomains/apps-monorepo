export type DashboardNameRow = {
  id: string
  name: string
  truncatedName?: string
  registrationDate?: Date | null
  expiryDate?: Date | null
  autoRenewalDate?: Date | null
  isPrimary?: boolean
  avatarUrl?: string | null
  relation: {
    owner?: boolean
    registrant?: boolean
    wrappedOwner?: boolean
    resolvedAddress?: boolean
  }
}

export type DashboardHeader = {
  primaryName: string
  address: string
  registeredDate: Date
  expiryDate: Date
  avatarUrl: string | null
}
