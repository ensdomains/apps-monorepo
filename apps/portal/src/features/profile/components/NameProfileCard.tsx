import {
  type CoinType,
  coinNameToTypeMap,
  type EvmCoinType,
  evmCoinNameToTypeMap,
  nonEvmCoinNameToTypeMap,
} from '@ensdomains/address-encoder'
import { useQuery } from '@tanstack/react-query'
import { getRecordsQueryOptions } from '../hooks/useRecords'
import { CoinRecord, type CoinTypeWithIcon } from './CoinRecord'
import { NameAvatar } from './NameAvatar'
import { SocialRecord } from './SocialRecord'

const evmCoinTypes = Object.values(evmCoinNameToTypeMap)

const nonEvmCoinTypes = Object.values(nonEvmCoinNameToTypeMap)

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
        coinNameToTypeMap.doge,
        coinNameToTypeMap.sol,
        coinNameToTypeMap.strk,
      ],
    }),
  )

  const texts = Object.fromEntries(
    (records?.texts || []).map(({ key, value }) => [key, value]),
  )

  const coins = Object.fromEntries(
    (records?.coins || []).map(({ value, coinType }) => [coinType, value]),
  )

  const evmChains = Object.fromEntries(
    Object.entries(coins)
      .filter(
        ([coinType]) =>
          evmCoinTypes.includes(Number(coinType) as EvmCoinType) ||
          coinType === '60',
      )
      .map(([coinType, value]) => [Number(coinType), value]),
  )

  const nonEvmChains = Object.fromEntries(
    Object.entries(coins)
      .filter(
        ([coinType]) =>
          nonEvmCoinTypes.includes(
            Number(coinType) as Exclude<CoinType, EvmCoinType>,
          ) && coinType !== '60',
      )
      .map(([coinType, value]) => [Number(coinType), value]),
  )

  if (error) return <div>Failed to fetch records: {error.cause?.message}</div>

  if (isLoading) return <div>Loading...</div>

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
        <div className="flex flex-row gap-x-2 gap-y-1">
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
        </div>
      </div>
    </div>
  )
}
