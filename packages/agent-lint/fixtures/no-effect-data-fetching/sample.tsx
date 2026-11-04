import { useEffect, useState } from 'react'

declare function useQuery(options: object): { data: unknown }
declare const url: string
declare const title: string

export const Violation1 = () => {
  const [data, setData] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { // expect: no-effect-data-fetching
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
  }, [])
  return <div>{loading ? 'loading' : JSON.stringify(data)}</div>
}

export const Violation2 = () => {
  const [data, setData] = useState<unknown>(null)
  useEffect(() => { // expect: no-effect-data-fetching
    const load = async () => {
      const res = await fetch(url)
      setData(await res.json())
    }
    void load()
  }, [])
  return <div>{JSON.stringify(data)}</div>
}

export const Passes1 = () => {
  useEffect(() => {
    document.title = title
  }, [])
  return <div />
}

export const Passes2 = () => {
  const { data } = useQuery({ queryKey: ['x'], queryFn: () => fetch(url) })
  return <div>{JSON.stringify(data)}</div>
}
