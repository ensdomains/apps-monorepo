import type { RecordDefinition } from '../../types'

export const contactRecords: RecordDefinition[] = [
  {
    key: 'email',
    name: 'Email Address',
    description: 'Your email address',
  },
  {
    key: 'location',
    name: 'Location',
    description: 'Your location',
  },
  {
    key: 'phone',
    name: 'Phone Number',
    description: 'Your phone number',
  },
  {
    key: 'mail',
    name: 'Mailing Address',
    description: 'Your mailing address',
  },
] as const satisfies [RecordDefinition, ...RecordDefinition[]]
