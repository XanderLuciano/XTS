import { describe, it, expect, beforeEach } from 'vitest'
import { useFeatureFlags } from '../useFeatureFlags'

const STORAGE_KEY = 'xts-feature-flags'

describe('useFeatureFlags', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset shared state
    const { load } = useFeatureFlags()
    load()
  })

  it('defaults all flags to false', () => {
    const { flags } = useFeatureFlags()
    expect(flags.value.userProfileSwitcher).toBe(false)
  })

  it('setFlag updates the flag value', () => {
    const { flags, setFlag } = useFeatureFlags()
    setFlag('userProfileSwitcher', true)
    expect(flags.value.userProfileSwitcher).toBe(true)
  })

  it('setFlag persists to localStorage', () => {
    const { setFlag } = useFeatureFlags()
    setFlag('userProfileSwitcher', true)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.userProfileSwitcher).toBe(true)
  })

  it('load restores flags from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userProfileSwitcher: true }))

    const { flags, load } = useFeatureFlags()
    load()
    expect(flags.value.userProfileSwitcher).toBe(true)
  })

  it('load handles missing localStorage gracefully', () => {
    const { flags, load } = useFeatureFlags()
    load()
    expect(flags.value.userProfileSwitcher).toBe(false)
  })

  it('load handles corrupted JSON gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not valid json{{{')
    const { flags, load } = useFeatureFlags()
    load()
    expect(flags.value.userProfileSwitcher).toBe(false)
  })

  it('load merges stored flags with defaults (unknown keys ignored, missing keys get defaults)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userProfileSwitcher: true, unknownFlag: true }))

    const { flags, load } = useFeatureFlags()
    load()
    expect(flags.value.userProfileSwitcher).toBe(true)
    expect((flags.value as any).unknownFlag).toBeUndefined()
  })

  it('isEnabled returns the current flag value', () => {
    const { isEnabled, setFlag } = useFeatureFlags()
    expect(isEnabled('userProfileSwitcher')).toBe(false)
    setFlag('userProfileSwitcher', true)
    expect(isEnabled('userProfileSwitcher')).toBe(true)
  })

  it('round-trip: set then load in new instance preserves value', () => {
    const ff1 = useFeatureFlags()
    ff1.setFlag('userProfileSwitcher', true)

    const ff2 = useFeatureFlags()
    ff2.load()
    expect(ff2.flags.value.userProfileSwitcher).toBe(true)
  })
})
