import { toHex } from 'viem'
import { resolveRecords, resolverFor } from '../helpers/resolve-records.js'

const name = 'g21-migration-object-1792754607.eth'
console.log(
  JSON.stringify(
    {
      name,
      resolver: await resolverFor(name),
      records: await resolveRecords(name, {
        abis: [{ contentType: 1, data: toHex('{"test":"test"}') }],
        texts: [
          { key: 'description', value: 'G21 manual ABI compatibility test' },
        ],
      }),
    },
    null,
    2,
  ),
)
