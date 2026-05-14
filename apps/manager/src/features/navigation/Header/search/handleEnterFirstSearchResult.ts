type HandleEnterFirstSearchResultParams = {
  readonly event: React.KeyboardEvent<HTMLInputElement>
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

  if (!firstResult) {
    return false
  }

  firstResult.click()
  event.currentTarget.blur()

  return true
}
