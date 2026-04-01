import { useEffect, useState } from 'react'

const STORAGE_KEY = 'migration-modal-dismissed'

export const useOpenModalOnFirstVisit = (
  isConnected: boolean,
  hasV1Names: boolean,
) => {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (
      isConnected &&
      hasV1Names &&
      localStorage.getItem(STORAGE_KEY) !== 'true'
    ) {
      setOpen(true)
    }
  }, [isConnected, hasV1Names])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setOpen(false)
  }

  return { open, dismiss }
}
