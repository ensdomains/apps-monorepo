import { PROFILE_TEXT_RECORDS } from '@ens-apps/record-catalog/text'
import {
  coinNameToTypeMap,
  evmCoinNameToTypeMap,
  nonEvmCoinNameToTypeMap,
} from '@ensdomains/address-encoder'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { parseLabelsAndParent } from '@/utils/ens/parseLabelsAndParent'
import {
  filterEvmChains,
  filterNonEvmChains,
  recordCoinsToObject,
  recordTextsToObject,
} from '@/utils/records/transformRecordsForDisplay'
import { isEncodedLabelhash } from '@/utils/token/isNormalized'
import { getRecordsQueryOptions } from '../hooks/useRecords'
import { CoinRecord, type CoinTypeWithIcon } from './CoinRecord'
import { NameAvatar } from './NameAvatar'
import { SocialRecord } from './SocialRecord'

const {
  name: nickname,
  description,
  twitter,
  telegram,
  discord,
  github,
  instagram,
  linkedin,
  farcaster,
  reddit,
  youtube,
} = PROFILE_TEXT_RECORDS

const COMPACT_SOCIAL_RECORDS = [
  {
    key: twitter.key,
    baseHref: twitter.presentation.href,
    artwork: 'X.png',
    alt: 'X',
  },
  {
    key: telegram.key,
    baseHref: telegram.presentation.href,
    artwork: 'telegram.png',
    alt: telegram.name,
  },
  {
    key: discord.key,
    baseHref: 'https://discord.com/users/',
    artwork: 'discord.png',
    alt: discord.name,
  },
  {
    key: github.key,
    baseHref: github.presentation.href,
    artwork: 'github.svg',
    alt: github.name,
  },
  {
    key: instagram.key,
    baseHref: instagram.presentation.href,
    artwork: 'instagram.png',
    alt: instagram.name,
  },
  {
    key: linkedin.key,
    baseHref: 'https://linkedin.com/in/',
    artwork: 'linkedin.svg',
    alt: linkedin.name,
  },
  {
    key: farcaster.key,
    baseHref: 'https://warpcast.com/',
    artwork: 'farcaster.svg',
    alt: farcaster.name,
  },
  {
    key: reddit.key,
    baseHref: reddit.presentation.href,
    artwork: 'reddit.svg',
    alt: reddit.name,
  },
  {
    key: youtube.key,
    // Keep the compact profile's existing slash after the @ path segment.
    baseHref: 'https://youtube.com/@/',
    artwork: 'youtube.png',
    alt: youtube.name,
  },
] as const

const COMPACT_TEXT_KEYS = [
  nickname.key,
  description.key,
  ...COMPACT_SOCIAL_RECORDS.map(({ key }) => key),
] as const

const evmCoinTypes = Object.values(evmCoinNameToTypeMap)

const nonEvmCoinTypes = Object.values(nonEvmCoinNameToTypeMap)

export const NameProfileCard = ({
  name,
  linked,
  stacked,
}: {
  name: string
  linked?: boolean
  stacked?: boolean
}) => {
  const { labels, parent } = parseLabelsAndParent(name)
  const hasUnknownLabel = name.split('.').some(isEncodedLabelhash)

  const {
    data: records,
    isLoading,
    error,
  } = useQuery({
    enabled: !hasUnknownLabel,
    ...getRecordsQueryOptions({
      name,
      texts: COMPACT_TEXT_KEYS,
      coins: [
        // EVM
        coinNameToTypeMap.eth,
        coinNameToTypeMap.arb1,
        coinNameToTypeMap.op,
        coinNameToTypeMap.base,
        coinNameToTypeMap.scr,
        coinNameToTypeMap.linea,

        // Non-EVM
        coinNameToTypeMap.btc,
        coinNameToTypeMap.doge,
        coinNameToTypeMap.sol,
        coinNameToTypeMap.strk,
      ],
    }),
  })

  const texts = recordTextsToObject(records?.texts)
  const nicknameText = texts[nickname.key]
  const descriptionText = texts[description.key]

  const coins = recordCoinsToObject(records?.coins)

  const evmChains = filterEvmChains(coins, evmCoinTypes)

  const nonEvmChains = filterNonEvmChains(coins, nonEvmCoinTypes)

  if (hasUnknownLabel)
    return (
      <div className="text-muted-foreground">
        Records can't be shown for a label that is only known by its hash.
      </div>
    )

  if (error) return <div>Failed to fetch records: {error.cause?.message}</div>

  if (isLoading) return <LoadingSpinner title="Loading..." />

  return (
    <div
      className={
        stacked ? 'flex flex-col gap-4' : 'flex flex-col sm:flex-row gap-6'
      }
    >
      <NameAvatar name={name} />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          {!stacked && (
            <h2 className="text-h2 max-w-full wrap-anywhere">
              {linked ? (
                <Link to="/$name" params={{ name }} className="hover:underline">
                  {labels.join('.')}.
                  <span className="text-base text-muted-foreground">
                    {parent}
                  </span>
                </Link>
              ) : (
                <>
                  {labels.join('.')}.
                  <span className="text-base text-muted-foreground">
                    {parent}
                  </span>
                </>
              )}
            </h2>
          )}
          <span>
            {nicknameText && (
              <span className="font-medium">{nicknameText}</span>
            )}{' '}
            {nicknameText && descriptionText ? '–' : null}{' '}
            {descriptionText && (
              <span className="text-muted-foreground">{descriptionText}</span>
            )}
          </span>
          <div className="flex flex-row flex-wrap gap-x-2 gap-y-1">
            {COMPACT_SOCIAL_RECORDS.map((record) => (
              <SocialRecord
                key={record.key}
                record={record}
                value={texts[record.key]}
              />
            ))}
          </div>
        </div>
        <div className="flex max-w-35.5 flex-row flex-wrap gap-1">
          {[...Object.entries(evmChains), ...Object.entries(nonEvmChains)].map(
            ([k, v]) => (
              <CoinRecord
                key={k}
                name={name}
                coinType={k as CoinTypeWithIcon}
                value={v}
              />
            ),
          )}
        </div>
      </div>
    </div>
  )
}
