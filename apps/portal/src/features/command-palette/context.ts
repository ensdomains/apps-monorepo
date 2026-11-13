import { createContext, useContext } from 'react'
import type { PaletteEntity } from './core/types'

export type PaletteOpenOptions = {
  readonly query?: string
  readonly entity?: PaletteEntity
}

export type PageCommand = {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly keywords?: readonly string[]
  readonly scope?: 'normal' | 'developer'
  readonly disabledReason?: string
  readonly onSelect: () => void | Promise<void>
}

export type PaletteActions = {
  readonly isAvailable: boolean
  readonly openPalette: (options?: PaletteOpenOptions) => void
  readonly closePalette: () => void
  readonly registerPageCommands: (
    owner: string,
    commands: readonly PageCommand[],
  ) => () => void
}

export const PaletteActionsContext = createContext<PaletteActions>({
  isAvailable: false,
  openPalette: () => {},
  closePalette: () => {},
  registerPageCommands: () => () => {},
})

export const useCommandPalette = () => useContext(PaletteActionsContext)
