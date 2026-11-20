import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useEffectEvent, useRef } from 'react'

export const useDashboardPageNavigation = () => {
  const navigate = useNavigate({ from: '/dashboard' })
  return (page: number, replace = false) =>
    navigate({
      search: (search) => ({ ...search, page: page > 1 ? page : undefined }),
      replace,
      resetScroll: false,
    })
}

export const useDashboardPage = () =>
  useSearch({ strict: false, select: (search) => search.page ?? 1 })

export const useResetDashboardPage = (listKey: string, page: number) => {
  const setPage = useDashboardPageNavigation()
  const previousListKey = useRef(listKey)
  const resetPage = useEffectEvent(() => {
    if (page > 1) void setPage(1, true)
  })

  useEffect(() => {
    if (previousListKey.current === listKey) return
    previousListKey.current = listKey
    resetPage()
  }, [listKey])
}
