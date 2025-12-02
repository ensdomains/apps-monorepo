export type DashboardNameRow = {
  id: string
  name: string
  truncatedName?: string
  registrationDate?: Date | null
  expiryDate?: Date | null
  autoRenewalDate?: Date | null
  isPrimary?: boolean
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

export const MOCK_DASHBOARD_HEADER: DashboardHeader = {
  primaryName: 'yoginth.eth',
  address: '0x03Ba...17EF',
  registeredDate: new Date('2020-02-04'),
  expiryDate: new Date('2029-08-28'),
  avatarUrl: 'https://yoginth.com/pfp.png',
}

// Mock data roughly matching the example state in the Figma dashboard
export const MOCK_DASHBOARD_NAMES: DashboardNameRow[] = [
  {
    id: 'yoginth.eth',
    name: 'yoginth.eth',
    truncatedName: 'yoginth.eth',
    registrationDate: new Date('2021-12-01'),
    expiryDate: new Date('2031-12-01'),
    autoRenewalDate: new Date('2031-12-01'),
    isPrimary: true,
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
    registrationDate: new Date('2023-05-17'),
    expiryDate: new Date('2033-05-17'),
    autoRenewalDate: new Date('2033-05-17'),
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
    registrationDate: new Date('2022-11-02'),
    expiryDate: new Date('2032-11-02'),
    autoRenewalDate: new Date('2032-11-02'),
    relation: {
      owner: true,
      wrappedOwner: true,
    },
  },
  {
    id: 'mywallet.eth',
    name: 'mywallet.eth',
    truncatedName: 'mywallet.eth',
    registrationDate: new Date('2021-12-05'),
    expiryDate: new Date('2031-12-05'),
    autoRenewalDate: new Date('2031-12-05'),
    relation: {
      owner: true,
      registrant: true,
    },
  },
  {
    id: 'favourite.eth',
    name: 'favourite.eth',
    truncatedName: 'favourite.eth',
    registrationDate: new Date('2020-01-15'),
    expiryDate: new Date('2030-01-15'),
    autoRenewalDate: new Date('2030-01-15'),
    relation: {
      owner: true,
      resolvedAddress: true,
    },
  },
]

export const MOCK_FAVORITE_NAMES: DashboardNameRow[] = [
  {
    id: 'seraphinalee.eth',
    name: 'seraphinalee.eth',
    truncatedName: 'seraphinalee.eth',
    registrationDate: null,
    expiryDate: null,
    autoRenewalDate: null,
    relation: {},
  },
  {
    id: 'zenithnova.eth',
    name: 'zenithnova.eth',
    truncatedName: 'zenithnova.eth',
    registrationDate: null,
    expiryDate: null,
    autoRenewalDate: null,
    relation: {},
  },
  {
    id: 'luminaquest.eth',
    name: 'luminaquest.eth',
    truncatedName: 'luminaquest.eth',
    registrationDate: null,
    expiryDate: null,
    autoRenewalDate: null,
    relation: {},
  },
  {
    id: 'astralvoyager.eth',
    name: 'astralvoyager.eth',
    truncatedName: 'astralvoyager.eth',
    registrationDate: null,
    expiryDate: null,
    autoRenewalDate: null,
    relation: {},
  },
  {
    id: 'celestialharbor.eth',
    name: 'celestialharbor.eth',
    truncatedName: 'celestialharbor.eth',
    registrationDate: null,
    expiryDate: null,
    autoRenewalDate: null,
    relation: {},
  },
]
