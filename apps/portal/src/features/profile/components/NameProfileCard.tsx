import {
  coinNameToTypeMap,
  evmCoinNameToTypeMap,
  evmCoinTypeToNameMap,
} from '@ensdomains/address-encoder'
import { useQuery } from '@tanstack/react-query'
import { getRecordsQueryOptions } from '../hooks/useRecords'
import { NameAvatar } from './NameAvatar'
import { SocialRecord } from './SocialRecord'

export const NameProfileCard = ({ name }: { name: string }) => {
  const [labels, parent] = ((p) => [p.slice(0, -1), p.at(-1)])(name.split('.'))

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

        // Non-EVM
        coinNameToTypeMap.btc,
        coinNameToTypeMap.sol,
        coinNameToTypeMap.strk,
      ],
    }),
  )

  const texts = Object.fromEntries(
    (records?.texts || []).map(({ key, value }) => [key, value]),
  )

  const coins = Object.fromEntries(
    (records?.coins || []).map(({ symbol, value, coinType }) => [
      symbol,
      { value, coinType },
    ]),
  )

  if (error) return <div>Failed to fetch records: {error.cause?.message}</div>

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="flex flex-col sm:flex-row p-6 items-center gap-6 rounded-lg border border-gray-300">
      <NameAvatar name={name} />
      <div className="flex flex-col gap-0.5 sm:items-start">
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
        <div className="flex flex-row gap-x-2 gap-y-1"></div>
      </div>
    </div>
  )
}
