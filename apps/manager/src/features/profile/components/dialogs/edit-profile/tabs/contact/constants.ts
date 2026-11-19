import { PROFILE_TEXT_RECORDS } from '@ens-apps/record-catalog/text'

export const primaryContactRecordKey = PROFILE_TEXT_RECORDS.primaryContact.key
export const primaryContactsRecordKey = PROFILE_TEXT_RECORDS.primaryContacts.key
export const maxPrimaryContactMethods = 3

const {
  discord,
  email,
  farcaster,
  github,
  instagram,
  linkedin,
  mail,
  mastodon,
  phone,
  reddit,
  telegram,
  tiktok,
  twitch,
  twitter,
} = PROFILE_TEXT_RECORDS

const CONTACT_METHOD_RECORDS = [
  twitter,
  telegram,
  farcaster,
  discord,
  instagram,
  linkedin,
  github,
  mastodon,
  reddit,
  tiktok,
  twitch,
  email,
  phone,
  mail,
] as const

type ContactMethodRecord = (typeof CONTACT_METHOD_RECORDS)[number]
export type ContactMethodKey = ContactMethodRecord['key']

const CONTACT_METHOD_LABELS: Readonly<
  Partial<Record<ContactMethodKey, string>>
> = {
  [twitter.key]: 'Twitter',
  [email.key]: 'E-mail',
  [phone.key]: 'Phone',
  [mail.key]: 'Address',
}

const CONTACT_METHOD_INPUT_TYPES = { email: 'email', phone: 'tel' } as const

export interface ContactMethod {
  readonly key: ContactMethodKey
  readonly label: string
  readonly placeholder: string
  readonly section: ContactMethodRecord['role']
  readonly type?: (typeof CONTACT_METHOD_INPUT_TYPES)[keyof typeof CONTACT_METHOD_INPUT_TYPES]
}

export const contactMethods: readonly ContactMethod[] =
  CONTACT_METHOD_RECORDS.map(({ key, name, role, format }) => {
    const label = CONTACT_METHOD_LABELS[key] ?? name
    return {
      key,
      label,
      placeholder: format === 'email' ? 'myemail@me.com' : label,
      section: role,
      ...((format === 'email' || format === 'phone') && {
        type: CONTACT_METHOD_INPUT_TYPES[format],
      }),
    }
  })

export const defaultEnabledContactMethodKeys: ReadonlySet<ContactMethodKey> =
  new Set([twitter.key, telegram.key])

const rowMethodKeys = [
  email.key,
  twitter.key,
  telegram.key,
  farcaster.key,
  discord.key,
  instagram.key,
  linkedin.key,
  mail.key,
  phone.key,
  github.key,
  mastodon.key,
  reddit.key,
  tiktok.key,
  twitch.key,
] as const satisfies readonly ContactMethodKey[]

const contactMethodByKey = new Map(
  contactMethods.map((method) => [method.key, method]),
)

export const contactMethodKeys: ReadonlySet<ContactMethodKey> = new Set(
  contactMethods.map(({ key }) => key),
)

export const socialContactMethodKeys: ReadonlySet<ContactMethodKey> = new Set(
  contactMethods
    .filter(({ section }) => section === 'social')
    .map(({ key }) => key),
)

export const rowMethods = rowMethodKeys.map((key) => {
  const method = contactMethodByKey.get(key)
  if (!method) {
    throw new Error(`Unknown contact method key: ${key}`)
  }
  return method
})
