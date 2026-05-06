import { describe, it, expect, beforeEach } from 'vitest'
import { useCurrentUser } from '../useCurrentUser'

const STORAGE_KEY = 'xts-current-user'

describe('useCurrentUser', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to the first user (xanderr)', () => {
    const { currentUser } = useCurrentUser()
    expect(currentUser.value.id).toBe('xanderr')
    expect(currentUser.value.name).toBe('Xander Luciano')
  })

  it('has 3 predefined users', () => {
    const { users } = useCurrentUser()
    expect(users).toHaveLength(3)
    expect(users.map(u => u.id)).toEqual(['xanderr', 'moojoshq', 'kevincnc'])
  })

  it('switchUser changes the current user', () => {
    const { currentUser, switchUser } = useCurrentUser()
    switchUser('moojoshq')
    expect(currentUser.value.id).toBe('moojoshq')
    expect(currentUser.value.name).toBe('Joshua Moore')
  })

  it('switchUser persists to localStorage', () => {
    const { switchUser } = useCurrentUser()
    switchUser('kevincnc')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('kevincnc')
  })

  it('switchUser ignores unknown user IDs', () => {
    const { currentUser, switchUser } = useCurrentUser()
    const before = currentUser.value.id
    switchUser('nonexistent')
    expect(currentUser.value.id).toBe(before)
  })

  it('loadUser restores from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'kevincnc')
    const { currentUser, loadUser } = useCurrentUser()
    loadUser()
    expect(currentUser.value.id).toBe('kevincnc')
    expect(currentUser.value.name).toBe('Kevin Strom')
  })

  it('loadUser handles missing localStorage gracefully', () => {
    const { currentUser, loadUser } = useCurrentUser()
    loadUser()
    // Should stay on whatever the current user is (shared state)
    expect(currentUser.value).toBeTruthy()
  })

  it('loadUser ignores invalid stored user ID', () => {
    localStorage.setItem(STORAGE_KEY, 'nonexistent')
    const { currentUser, loadUser } = useCurrentUser()
    const before = currentUser.value.id
    loadUser()
    expect(currentUser.value.id).toBe(before)
  })

  it('each user has initials', () => {
    const { users } = useCurrentUser()
    for (const user of users) {
      expect(user.initials).toBeTruthy()
      expect(user.initials.length).toBe(2)
    }
  })
})
