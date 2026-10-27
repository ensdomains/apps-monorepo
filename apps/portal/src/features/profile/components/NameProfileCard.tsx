import {
  evmCoinNameToTypeMap,
  nonEvmCoinNameToTypeMap,
} from '@ensdomains/address-encoder'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { parseLabelsAndParent } from '@/utils/ens/parseLabelsAndParent'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import {
  filterEvmChains,
  filterNonEvmChains,
  recordCoinsToObject,
  recordTextsToObject,
} from '@/utils/records/transformRecordsForDisplay'
import { isEncodedLabelhash } from '@/utils/token/isNormalized'
import { getProfileQueryOptions } from '../hooks/useProfile'
import { CoinRecord, type CoinTypeWithIcon } from './CoinRecord'
import { NameAvatar } from './NameAvatar'
import { SocialRecord } from './SocialRecord'

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
    data: profile,
    isLoading,
    error,
  } = useQuery({
    enabled: !hasUnknownLabel,
    ...getProfileQueryOptions({ name }),
  })
  const records = profile?.records

  const texts = recordTextsToObject(records?.texts)

  const coins = recordCoinsToObject(records?.coins)

  const evmChains = filterEvmChains(coins, evmCoinTypes)

  const nonEvmChains = filterNonEvmChains(coins, nonEvmCoinTypes)

  if (hasUnknownLabel)
    return (
      <div className="text-muted-foreground">
        Records can't be shown for a label that is only known by its hash.
      </div>
    )

  if (error)
    return <div>Failed to fetch records: {extractErrorMessage(error)}</div>

  if (isLoading) return <LoadingSpinner title="Loading..." />

  return (
    <div
      className={
        stacked ? 'flex flex-col gap-4' : 'flex flex-col sm:flex-row gap-6'
      }
    >
      <NameAvatar name={name} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          {!stacked && (
            <h2 className="text-h2 w-max">
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
            {texts.name && <span className="font-medium">{texts.name}</span>}{' '}
            {texts.name && texts.description ? '–' : null}{' '}
            {texts.description && (
              <span className="text-muted-foreground">{texts.description}</span>
            )}
          </span>
          <div className="flex flex-row flex-wrap gap-x-2 gap-y-1">
            <SocialRecord
              record={{ key: 'com.twitter', value: texts['com.twitter'] }}
            />
            <SocialRecord
              record={{ key: 'org.telegram', value: texts['org.telegram'] }}
            />
            <SocialRecord
              record={{ key: 'com.discord', value: texts['com.discord'] }}
            />
            <SocialRecord
              record={{ key: 'com.github', value: texts['com.github'] }}
            />
            <SocialRecord
              record={{ key: 'com.instagram', value: texts['com.instagram'] }}
            />
            <SocialRecord
              record={{ key: 'com.linkedin', value: texts['com.linkedin'] }}
            />
            <SocialRecord
              record={{ key: 'xyz.farcaster', value: texts['xyz.farcaster'] }}
            />
            <SocialRecord
              record={{ key: 'com.reddit', value: texts['com.reddit'] }}
            />
            <SocialRecord
              record={{ key: 'com.youtube', value: texts['com.youtube'] }}
            />
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
