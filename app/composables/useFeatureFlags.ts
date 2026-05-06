import { ref, readonly } from 'vue'

export interface FeatureFlags {
  /** Show the dashboard navbar with user profile switcher */
  userProfileSwitcher: boolean
}

const defaults: FeatureFlags = {
  userProfileSwitcher: false
}

const STORAGE_KEY = 'xts-feature-flags'

const flags = ref<FeatureFlags>({ ...defaults })

export const useFeatureFlags = () => {
  const load = () => {
    // Reset to defaults first
    flags.value = { ...defaults }
    if (typeof localStorage === 'undefined') return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Only apply known keys from defaults
        for (const key of Object.keys(defaults) as (keyof FeatureFlags)[]) {
          if (key in parsed) {
            flags.value[key] = parsed[key]
          }
        }
      }
    } catch {
      // ignore corrupted data
    }
  }

  const setFlag = <K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]) => {
    flags.value[key] = value
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(flags.value))
    }
  }

  const isEnabled = (key: keyof FeatureFlags): boolean => flags.value[key]

  return {
    flags: readonly(flags),
    load,
    setFlag,
    isEnabled
  }
}
