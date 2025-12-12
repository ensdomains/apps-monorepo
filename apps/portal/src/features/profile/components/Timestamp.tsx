export type TimestampProps = {
  timestamp: number | bigint
}

export const Timestamp = ({ timestamp }: TimestampProps) => {
  return new Date(Number(timestamp) * 1000).toUTCString()
}
