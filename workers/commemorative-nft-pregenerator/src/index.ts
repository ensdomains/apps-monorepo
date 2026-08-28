#!/usr/bin/env node
import { parsePilotCliOptions, pilotHelp } from './cli.js'
import { runPilot } from './pilot.js'

const run = async (): Promise<void> => {
  const options = parsePilotCliOptions(process.argv.slice(2))
  if ('help' in options) {
    console.log(pilotHelp())
    return
  }

  const result = await runPilot(options)
  console.log(`Full snapshot:     ${result.snapshotAddressCount} addresses`)
  console.log(`Merkle root:       ${result.merkleRoot}`)
  console.log(`Pilot artifacts:   ${result.generatedItemCount} PNG/JSON pairs`)
  console.log(`Rendered locally:  ${result.localRenderedCount}`)
  console.log(`Reused locally:    ${result.localExistingCount}`)
  console.log(`R2 uploaded:       ${result.remoteUploadedCount} token objects`)
  console.log(`R2 reused:         ${result.remoteExistingCount} token objects`)
  console.log(`Completion marker: ${result.manifestKey}`)
}

try {
  await run()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
