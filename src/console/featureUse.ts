import { useEffect, useState } from 'react'
import { type FeatureUse, featureUse } from '../data/billing'

let cached: Promise<FeatureUse> | null = null

/** Certificates and pay in use, fetched once per visit to the Console. Null while loading or if it fails. */
export function useFeatureUse(): FeatureUse | null {
  const [value, setValue] = useState<FeatureUse | null>(null)
  useEffect(() => {
    cached ??= featureUse().catch((e) => {
      cached = null
      throw e
    })
    cached.then(setValue, () => setValue(null))
  }, [])
  return value
}
