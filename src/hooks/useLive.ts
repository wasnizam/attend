import { type DependencyList, useEffect, useState } from 'react'

type Subscribe<T> = (onData: (data: T) => void, onError: (e: Error) => void) => () => void

export interface Live<T> {
  data: T | undefined
  loading: boolean
  error: Error | null
}

/** Binds a Firestore real-time listener to component state. Pass null to stay idle. */
export function useLive<T>(subscribe: Subscribe<T> | null, deps: DependencyList): Live<T> {
  const [state, setState] = useState<Live<T>>({ data: undefined, loading: true, error: null })
  const idle = subscribe === null

  useEffect(() => {
    if (!subscribe) {
      setState({ data: undefined, loading: false, error: null })
      return
    }
    setState({ data: undefined, loading: true, error: null })
    return subscribe(
      (data) => setState({ data, loading: false, error: null }),
      (error) => setState({ data: undefined, loading: false, error }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idle, ...deps])

  return state
}
