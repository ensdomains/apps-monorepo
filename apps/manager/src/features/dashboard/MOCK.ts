export type DashboardNameRow = {
  id: string
  name: string
  truncatedName?: string
  registrationDate?: Date | null
  expiryDate?: Date | null
  relation: {
    owner?: boolean
    registrant?: boolean
    wrappedOwner?: boolean
    resolvedAddress?: boolean
  }
}

// Mock data roughly matching the example state in the Figma dashboard
export const MOCK_DASHBOARD_NAMES: DashboardNameRow[] = [
  {
    id: 'erni.eth',
    name: 'erni.eth',
    truncatedName: 'erni.eth',
    registrationDate: new Date('2023-02-01'),
    expiryDate: new Date('2025-02-01'),
    relation: {
      owner: true,
      registrant: true,
      wrappedOwner: true,
      resolvedAddress: true,
    },
  },
  {
    id: 'lizard.eth',
    name: 'lizard.eth',
    truncatedName: 'lizard.eth',
    registrationDate: new Date('2022-11-15'),
    expiryDate: new Date('2024-11-15'),
    relation: {
      owner: true,
      registrant: true,
      resolvedAddress: true,
    },
  },
  {
    id: 'supername.eth',
    name: 'supername.eth',
    truncatedName: 'supername.eth',
    registrationDate: new Date('2021-06-30'),
    expiryDate: new Date('2025-06-30'),
    relation: {
      owner: true,
      wrappedOwner: true,
    },
  },
  {
    id: 'mywallet.eth',
    name: 'mywallet.eth',
    truncatedName: 'mywallet.eth',
    registrationDate: new Date('2020-09-10'),
    expiryDate: new Date('2024-09-10'),
    relation: {
      owner: true,
      registrant: true,
    },
  },
  {
    id: 'favourite.eth',
    name: 'favourite.eth',
    truncatedName: 'favourite.eth',
    registrationDate: new Date('2023-08-20'),
    expiryDate: new Date('2026-08-20'),
    relation: {
      owner: true,
      resolvedAddress: true,
    },
  },
]
