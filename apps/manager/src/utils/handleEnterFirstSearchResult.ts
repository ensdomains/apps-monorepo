type HandleEnterFirstSearchResultParams = {
  readonly event: {
    readonly key: string
    readonly keyCode: number
    readonly nativeEvent: {
      readonly isComposing: boolean
    }
    preventDefault: () => void
  }
  readonly isDebouncing: boolean
  readonly resultsContainer: HTMLElement | null
}

export const handleEnterFirstSearchResult = ({
  event,
  isDebouncing,
  resultsContainer,
}: HandleEnterFirstSearchResultParams): boolean => {
  if (event.key !== 'Enter') {
    return false
  }

  // Keep IME composition guard to avoid Enter submitting unfinished composition text.
  if (event.nativeEvent.isComposing || event.keyCode === 229) {
    return false
  }

  event.preventDefault()

  if (isDebouncing) {
    return false
  }

  const firstResult =
    resultsContainer?.querySelector<HTMLAnchorElement>('a[href]') ?? null

  firstResult?.click()

  return firstResult !== null
}
