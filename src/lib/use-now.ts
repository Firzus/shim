import { useEffect, useState } from 'react'

// A wall-clock value that re-renders the caller on a fixed interval. Used by
// live relative-time labels (countdowns, "captured Xs ago"). Each consumer
// owns its own ticker so the re-render stays local to the smallest subtree.
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
