/** The Explorer page for a name, or null on a network with no Explorer. */
export const getExplorerNameUrl = (
  origin: string | null,
  name: string,
): string | null => (origin ? `${origin}/${encodeURIComponent(name)}` : null)
