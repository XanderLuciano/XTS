import { ref, readonly } from 'vue'

export interface AppUser {
  id: string
  name: string
  username: string
  initials: string
}

const users: AppUser[] = [
  { id: 'xanderr', name: 'Xander Luciano', username: 'xanderr', initials: 'XL' },
  { id: 'moojoshq', name: 'Joshua Moore', username: 'moojoshq', initials: 'JM' },
  { id: 'kevincnc', name: 'Kevin Strom', username: 'kevincnc', initials: 'KS' }
]

const STORAGE_KEY = 'xts-current-user'

const currentUser = ref<AppUser>(users[0])

export const useCurrentUser = () => {
  const loadUser = () => {
    if (typeof localStorage === 'undefined') return
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const found = users.find(u => u.id === stored)
      if (found) currentUser.value = found
    }
  }

  const switchUser = (userId: string) => {
    const found = users.find(u => u.id === userId)
    if (found) {
      currentUser.value = found
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, userId)
      }
    }
  }

  return {
    currentUser: readonly(currentUser),
    users,
    switchUser,
    loadUser
  }
}
