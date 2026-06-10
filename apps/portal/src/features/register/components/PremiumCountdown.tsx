import { useEffect, useState } from 'react'

type PremiumCountdownProps = {
  readonly end: Temporal.Instant
}

const pad = (value: number) => String(value).padStart(2, '0')

export const PremiumCountdown = ({ end }: PremiumCountdownProps) => {
  const [nowMs, setNowMs] = useState(
    () => Temporal.Now.instant().epochMilliseconds,
  )

  useEffect(() => {
    const id = setInterval(
      () => setNowMs(Temporal.Now.instant().epochMilliseconds),
      1000,
    )
    return () => clearInterval(id)
  }, [])

  const totalSeconds = Math.max(
    0,
    Math.floor((end.epochMilliseconds - nowMs) / 1000),
  )
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  return (
    <span className="tabular-nums whitespace-nowrap font-medium">
      {days} {days === 1 ? 'day' : 'days'} : {pad(hours)} : {pad(minutes)} :{' '}
      {pad(seconds)}
    </span>
  )
}
