import { Trans } from '@lingui/react/macro'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProfileRecords } from '../../types'
import { AgentRecordCard } from './AgentRecordCard'

interface ViewAgentSectionProps {
  records: ProfileRecords
}

export const ViewAgentSection = ({ records }: ViewAgentSectionProps) => {
  if (records.agentRegistrations.length === 0) {
    return null
  }

  return (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">
          <Trans>Agents</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {records.agentRegistrations.map((record) => (
            <AgentRecordCard key={record.key} record={record} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
