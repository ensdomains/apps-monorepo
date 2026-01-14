import {
  coinNameToTypeMap,
  evmCoinNameToTypeMap,
  nonEvmCoinNameToTypeMap,
} from '@ensdomains/address-encoder'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { parseLabelsAndParent } from '@/utils/ens/parseLabelsAndParent'
import {
  filterEvmChains,
  filterNonEvmChains,
  recordCoinsToObject,
  recordTextsToObject,
} from '@/utils/records/transformRecordsForDisplay'
import { getRecordsQueryOptions } from '../hooks/useRecords'
import { CoinRecord, type CoinTypeWithIcon } from './CoinRecord'
import { NameAvatar } from './NameAvatar'
import { SocialRecord } from './SocialRecord'

const evmCoinTypes = Object.values(evmCoinNameToTypeMap)

const nonEvmCoinTypes = Object.values(nonEvmCoinNameToTypeMap)

export const NameProfileCard = ({ name }: { name: string }) => {
  const { labels, parent } = parseLabelsAndParent(name)

  const {
    data: records,
    isLoading,
    error,
  } = useQuery(
    getRecordsQueryOptions({
      name,
      texts: ['name', 'description', 'com.twitter', 'org.telegram'],
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
  )

  const texts = recordTextsToObject(records?.texts)

  const coins = recordCoinsToObject(records?.coins)

  const evmChains = filterEvmChains(coins, evmCoinTypes)

  const nonEvmChains = filterNonEvmChains(coins, nonEvmCoinTypes)

  if (error) return <div>Failed to fetch records: {error.cause?.message}</div>

  if (isLoading) return <LoadingSpinner title="Loading..." />

  return (
    <div className="flex flex-col sm:flex-row p-6 items-center gap-6 rounded-lg border border-gray-300">
      <NameAvatar name={name} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5 ">
          <h2 className="text-[26px] font-medium w-max">
            {labels.join('.')}.
            <span className="text-base text-gray-500">{parent}</span>
          </h2>
          <span>
            {texts.name && <span className="font-medium">{texts.name}</span>}{' '}
            {texts.name && texts.description ? '–' : null}{' '}
            {texts.description && <span>{texts.description}</span>}
          </span>
          <div className="flex flex-row gap-x-2 gap-y-1">
            <SocialRecord
              record={{ key: 'com.twitter', value: texts['com.twitter'] }}
            />
            <SocialRecord
              record={{ key: 'org.telegram', value: texts['org.telegram'] }}
            />
          </div>
        </div>
        <Link
          search={{ view: 'list' }}
          to="/$name/records"
          params={{ name }}
          className="flex flex-row gap-x-2 gap-y-1"
        >
          <div className="flex flex-row">
            {Object.entries(evmChains).map(([k, v]) => (
              <CoinRecord
                key={k}
                coinType={k as CoinTypeWithIcon}
                value={v}
                className="first:-mr-1"
              />
            ))}
          </div>
          <div className="flex flex-row gap-2">
            {Object.entries(nonEvmChains).map(([k, v]) => (
              <CoinRecord key={k} coinType={k as CoinTypeWithIcon} value={v} />
            ))}
          </div>
        </Link>
      </div>
    </div>
  )
}
