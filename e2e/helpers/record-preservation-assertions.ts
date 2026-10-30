import { expect } from '@playwright/test'

type RecordRow = {
  name: string
  result: string
  v2Status: number | null
  before: { what: string; want: unknown; got: unknown }[]
  after: { what: string; want: unknown; got: unknown }[]
}

export function assertRecordPreservation(rows: RecordRow[]) {
  expect(
    rows.length,
    'Record-preservation inventory must contain targets',
  ).toBeGreaterThan(0)
  const failures = rows
    .filter(
      (row) =>
        row.result !== 'PASS' ||
        row.v2Status !== 2 ||
        row.before.length === 0 ||
        row.after.length !== row.before.length ||
        row.after.some((record) => record.got !== record.want),
    )
    .map((row) => ({
      name: row.name,
      status: row.result,
      v2Status: row.v2Status,
      expectedRecordCount: row.before.length,
      actualRecordCount: row.after.length,
      recordMismatches: row.after.filter(
        (record) => record.got !== record.want,
      ),
    }))
  expect(
    failures,
    'Each name must migrate and preserve every seeded record',
  ).toEqual([])
}
