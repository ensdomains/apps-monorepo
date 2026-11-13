import { useEffect, useId } from 'react'
import { type PageCommand, useCommandPalette } from './context'

export type { PageCommand } from './context'

export const usePageCommands = (commands: readonly PageCommand[]) => {
  const owner = useId()
  const { registerPageCommands } = useCommandPalette()
  useEffect(
    () => registerPageCommands(owner, commands),
    [owner, commands, registerPageCommands],
  )
}
