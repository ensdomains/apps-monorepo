/** Missing or blocked authority is kept serial, just like an allowed write. */
export function allProbesDenied(permission: unknown): boolean {
  if (!permission || typeof permission !== 'object') return false
  const probes = permission as Record<string, { result?: string } | undefined>
  if (!['records', 'setResolver', 'transfer'].every(key => probes[key]?.result === 'DENIED')) return false
  return Object.values(probes).every(value => !value || typeof value !== 'object' || !('result' in value) || value.result === 'DENIED')
}

/** Only verified readers overlap; all readers finish before any writer starts. */
export async function eachActor<T>(actors: T[], canWrite: (actor: T) => boolean, run: (actor: T) => Promise<void>, concurrency = Number(process.env.MATRIX_UI_READ_CONCURRENCY ?? 2)) {
  if (![1, 2, 3].includes(concurrency)) throw new Error('MATRIX_UI_READ_CONCURRENCY must be 1, 2 or 3')
  const classified = actors.map(actor => ({ actor, writes: canWrite(actor) }))
  const readers = classified.filter(value => !value.writes)
  for (let i = 0; i < readers.length; i += concurrency) {
    const results = await Promise.allSettled(readers.slice(i, i + concurrency).map(({ actor }) => run(actor)))
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  }
  for (const { actor } of classified.filter(value => value.writes)) await run(actor)
}
