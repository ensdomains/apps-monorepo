import {
  ClockIcon,
  HomeIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
} from 'lucide-react'
import type { RecordDefinition } from '../../types'

export const contactRecords: RecordDefinition[] = [
  {
    key: 'email',
    name: 'Email Address',
    description: 'Your email address',
    icon: MailIcon,
  },
  {
    key: 'location',
    name: 'Location',
    description: 'Your location',
    icon: MapPinIcon,
  },
  {
    key: 'phone',
    name: 'Phone Number',
    description: 'Your phone number',
    icon: PhoneIcon,
  },
  {
    key: 'mail',
    name: 'Mailing Address',
    description: 'Your mailing address',
    icon: HomeIcon,
  },
  {
    key: 'timezone',
    name: 'Timezone',
    description: 'Your timezone',
    icon: ClockIcon,
  },
] as const satisfies [RecordDefinition, ...RecordDefinition[]]
