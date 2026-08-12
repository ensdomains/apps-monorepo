import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'
import { getPageTitle } from '@/worker/pageTitle'

/**
 * Keeps `document.title` in step with the route.
 *
 * The worker injects the title per request, so it is only correct on a full
 * load; client-side navigations never touched it.
 */
export function useDocumentTitle() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const searchStr = useLocation({ select: (location) => location.searchStr })

  useEffect(() => {
    document.title = getPageTitle(pathname, new URLSearchParams(searchStr))
  }, [pathname, searchStr])
}
