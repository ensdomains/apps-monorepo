import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { wagmiConfig } from '@/lib/wagmi'
import { createFileRoute } from '@tanstack/react-router'
import {
  container,
  avatar,
  nameStyle,
  recordsList,
  recordItem,
  buttonStyle,
} from './index.css'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useMachine, useSelector } from '@xstate/react'
import { createBrowserInspector } from '@statelyai/inspect'
import type { ActorRefFrom } from 'xstate'

import { renewMachine } from '@/features/renew/machines/renew'
import type { transactionMachine } from '@/machines/transaction'
import { queryClient } from '@/utils/queryClient'
import { useQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/profile/$name/')({
  loader: ({ params }) => {
    return queryClient.ensureQueryData(getProfileQueryOptions(params.name))
  },
  component: RouteComponent,
})

const inspector = createBrowserInspector()

const RenewTransaction = ({
  transactionMgr,
}: {
  transactionMgr: ActorRefFrom<typeof transactionMachine>
}) => {
  // const state = transactionMgr.getSnapshot().value
  const [state] = useSelector(transactionMgr, (state) => [state.value])

  return <div>Transaction Status: {state}</div>
}

const RenewName = ({ name }: { name: string }) => {
  const account = useAccount()

  const [state, send] = useMachine(renewMachine, {
    inspect: inspector.inspect,
  })

  if (!account.address) return null

  return (
    <div>
      <button
        type="button"
        className={buttonStyle}
        onClick={() => {
          send({
            type: 'renew',
            name,
            duration: 31536,
          })
        }}
      >
        Renew Name
      </button>

      {state.value === 'Failure' && (
        <button
          type="button"
          className={buttonStyle}
          onClick={() => send({ type: 'reset' })}
        >
          Reset
        </button>
      )}

      <div>Renew Status: {state.value}</div>

      {!!state.children.transactionMgr && (
        <RenewTransaction transactionMgr={state.children.transactionMgr} />
      )}

      <pre>{JSON.stringify(state, null, 2)}</pre>
    </div>
  )
}

function RouteComponent() {
  const { name } = Route.useParams()
  const { data, isLoading, isError } = useQuery(getProfileQueryOptions(name))

  if (isLoading) return <div>Loading profile...</div>
  if (isError || !data) return <div>Profile not found</div>

  const { records } = data
  const texts = records.texts || []
  const avatarRecord = texts.find((t) => t.key === 'avatar')?.value
  const avatarUrl =
    typeof avatarRecord === 'string'
      ? avatarRecord.startsWith('ipfs://')
        ? avatarRecord.replace('ipfs://', 'https://ipfs.io/ipfs/')
        : avatarRecord
      : undefined

  return (
    <div>
      <ConnectButton />

      <div className={container}>
        {avatarUrl && (
          <img src={avatarUrl} alt={`${name} avatar`} className={avatar} />
        )}
        <div className={nameStyle}>{name}</div>
        <ul className={recordsList}>
          {texts
            .filter((t) => t.key !== 'avatar')
            .map((t) => (
              <li key={t.key} className={recordItem}>
                <span>{t.key}</span>
                <span>{String(t.value)}</span>
              </li>
            ))}
        </ul>
      </div>

      <RenewName name={name} />
    </div>
  )
}
