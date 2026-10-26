import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { TestInfo } from '@playwright/test'

const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
const read = (path: string): any => { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return undefined } }
const pause = () => new Promise(resolve => setTimeout(resolve, 3000))

/** Limit browser pressure across independent forks without changing test behavior. */
export async function acquireMatrixResourceSlot(info: TestInfo): Promise<() => void> {
  if (process.env.MATRIX_LOCAL_RPC_ONLY !== '1') return () => {}
  const pool = process.env.MATRIX_RESOURCE_POOL ?? join(tmpdir(), 'ens-migration-matrix-resource-pool')
  mkdirSync(pool, { recursive: true })
  const lock = join(pool, 'admission.lock'), lease = join(pool, `${process.pid}.json`), token = randomUUID()
  const ticket = join(pool, `waiting-${process.pid}.json`)
  const began = Date.now()
  let announced = false
  for (;;) {
    let locked = false
    try {
      try { mkdirSync(lock); locked = true; writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid })) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        const owner = read(join(lock, 'owner.json'))
        // An interrupted admission cannot hold the queue forever. A new empty
        // lock gets time to write its owner before another process considers it stale.
        try { if ((owner?.pid && !alive(owner.pid)) || (!owner && Date.now() - statSync(lock).mtimeMs > 10000)) rmSync(lock, { recursive: true, force: true }) } catch {}
      }
      if (locked) {
        const capacity = read(join(pool, 'capacity.json'))?.maxConcurrentFixtures ?? 4
        if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid matrix fixture capacity')
        if (read(ticket)?.token !== token) writeFileSync(ticket, JSON.stringify({ pid: process.pid, token, queuedAt: began, priority: info.title.startsWith('indexed history ') ? 0 : 1, title: info.title }))
        const waiting = readdirSync(pool).filter(name => /^waiting-\d+\.json$/.test(name)).flatMap(name => {
          const path = join(pool, name), value = read(path)
          if (value?.pid && alive(value.pid)) return [value]
          rmSync(path, { force: true }); return []
        }).sort((a, b) => a.priority - b.priority || a.queuedAt - b.queuedAt || a.pid - b.pid)
        const active = readdirSync(pool).filter(name => /^\d+\.json$/.test(name)).filter(name => {
          const path = join(pool, name), value = read(path)
          if (value?.pid && alive(value.pid)) return true
          rmSync(path, { force: true }); return false
        })
        // Finish short, read-only history checks promptly so an idle chain can
        // be archived. Otherwise admit fixtures in waiting order, not by chance.
        if (active.length < capacity && waiting[0]?.token === token) {
          const value = { pid: process.pid, token, title: info.title, output: process.env.REPLACEMENT_RESULTS, acquiredAt: new Date().toISOString(), waitedMs: Date.now() - began }
          const temporary = `${lease}.tmp`; writeFileSync(temporary, JSON.stringify(value)); renameSync(temporary, lease)
          rmSync(ticket, { force: true })
          console.log(`[matrix-capacity] admitted ${info.title}; waited ${value.waitedMs}ms`)
          return () => { if (read(lease)?.token === token) rmSync(lease, { force: true }) }
        }
      }
    } finally { if (locked) rmSync(lock, { recursive: true, force: true }) }
    if (!announced) { console.log(`[matrix-capacity] queued before fixture setup: ${info.title}`); announced = true }
    await pause()
  }
}
