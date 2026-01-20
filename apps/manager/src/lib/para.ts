import type ParaWeb from '@getpara/react-sdk-lite'
import { getClient, type LogoutEvent, ParaEvent } from '@getpara/react-sdk-lite'
import { createClientOnlyFn, createIsomorphicFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { useEffect } from 'react'

export const getParaClient = (): ParaWeb | undefined => {
  return getClient() as ParaWeb | undefined
}

const PARA_CONNECTION_COOKIE_NAME = 'ens.wallet.address'
const COOKIE_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30 // 30 days

export const getParaConnectionCookie = createIsomorphicFn()
  .server(() => {
    const cookie = getCookie(PARA_CONNECTION_COOKIE_NAME)
    return cookie ?? null
  })
  .client(() => {
    return (
      document.cookie
        .split('; ')
        .find((row) => row.startsWith(`${PARA_CONNECTION_COOKIE_NAME}=`))
        ?.substring(PARA_CONNECTION_COOKIE_NAME.length + 1) ?? null
    )
  })

export const setParaConnectionCookie = createClientOnlyFn(
  async (address: string | null) => {
    if (address) {
      await cookieStore.set({
        name: PARA_CONNECTION_COOKIE_NAME,
        value: address,
        path: '/',
        expires: Date.now() + COOKIE_EXPIRATION_TIME,
      })
    } else {
      await cookieStore.delete({
        name: PARA_CONNECTION_COOKIE_NAME,
        path: '/',
      })
    }
  },
)

export const isConnectedToPara = (): boolean => {
  return getParaConnectionCookie() !== null
}

/**
 * useParaLogoutEffect
 *
 * Effect that listens for the Para logout event and calls the onDisconnect function.
 *
 * For onConnect @see useConnectionEffect from wagmi. However onDisconnect on the useConnectionEffect is delayed when using para, thus the useParaLogoutEffect is needed.
 */
export const useParaLogoutEffect = (
  onDisconnect: (event: LogoutEvent) => void,
) => {
  useEffect(() => {
    window.addEventListener(ParaEvent.LOGOUT_EVENT, onDisconnect)
    return () => {
      window.removeEventListener(ParaEvent.LOGOUT_EVENT, onDisconnect)
    }
  }, [onDisconnect])
}
