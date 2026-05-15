import type { Part } from '~/types/inventree'

/**
 * Shared composable for searching and adding parts to a BOM component list.
 * Used by both the Create Assembly tab and the Edit BOM mode.
 */
export const useBomComponentSearch = (excludePks: () => Set<number>) => {
  const inventree = useInventreeApi()

  const searchQuery = ref('')
  const searchResults = ref<Part[]>([])
  const isSearching = ref(false)

  let timeout: ReturnType<typeof setTimeout> | null = null

  const search = () => {
    if (timeout) clearTimeout(timeout)
    if (!searchQuery.value) {
      searchResults.value = []
      return
    }
    timeout = setTimeout(async () => {
      isSearching.value = true
      try {
        const results = await inventree.searchParts(searchQuery.value)
        const excluded = excludePks()
        searchResults.value = results.filter(p => !excluded.has(p.pk))
      } catch {
        searchResults.value = []
      } finally {
        isSearching.value = false
      }
    }, 300)
  }

  const clear = () => {
    searchQuery.value = ''
    searchResults.value = []
  }

  return {
    searchQuery,
    searchResults,
    isSearching,
    search,
    clear
  }
}
