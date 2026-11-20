export const hasBlockingPaletteDialog = () =>
  document.querySelector(
    '[role="dialog"][data-state="open"]:not([data-command-palette]):not([data-palette-inline-search])',
  ) !== null
