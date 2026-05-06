<script setup lang="ts">
import type { Part, AddStockDto, RemoveStockDto } from '~/types/inventree'

const inventree = useInventreeApi()
const toast = useToast()

const debugLog = ref<string[]>([])
const isLoading = ref(false)
const searchQuery = ref('')
const searchInputRef = ref<InstanceType<typeof UInput> | null>(null)
const selectedPart = ref<Part | null>(null)
const stockQuantity = ref(1)

const addLog = (message: string) => {
  const timestamp = new Date().toLocaleTimeString()
  debugLog.value.unshift(`[${timestamp}] ${message}`)
}

const searchPart = async () => {
  if (!searchQuery.value) return
  
  isLoading.value = true
  addLog(`Searching for: ${searchQuery.value}`)
  try {
    const results = await inventree.searchParts(searchQuery.value)
    
    if (results.length > 0) {
      const found = results[0]
      if (found) {
        selectedPart.value = found
        addLog(`Found: ${found.name}`)
        toast.add({ title: 'Part found', description: found.name, color: 'success' })
      }
    } else {
      selectedPart.value = null
      addLog(`No results for: ${searchQuery.value}`)
      toast.add({ title: 'No parts found', color: 'warning' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed'
    addLog(`Error: ${message}`)
    toast.add({ title: 'Search failed', description: message, color: 'error' })
  } finally {
    isLoading.value = false
  }
}

const addStock = async () => {
  if (!selectedPart.value) return
  
  isLoading.value = true
  addLog(`Adding ${stockQuantity.value} units`)
  
  try {
    const stockData: AddStockDto = {
      part: selectedPart.value.pk,
      quantity: stockQuantity.value,
      notes: 'Stock added via webapp'
    }
    await inventree.addStock(stockData)
    
    selectedPart.value.in_stock += stockQuantity.value
    addLog(`Added ${stockQuantity.value} units`)
    toast.add({ title: 'Stock added', description: `Added ${stockQuantity.value} units`, color: 'success' })
    stockQuantity.value = 1
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add stock'
    addLog(`Error: ${message}`)
    toast.add({ title: 'Failed to add stock', description: message, color: 'error' })
  } finally {
    isLoading.value = false
  }
}

const removeStock = async () => {
  if (!selectedPart.value) return
  
  isLoading.value = true
  addLog(`Removing ${stockQuantity.value} units`)
  
  try {
    const stockItems = await inventree.getStockItems(selectedPart.value.pk)
    
    if (stockItems.length === 0) {
      addLog('No stock available')
      toast.add({ title: 'No stock available', color: 'warning' })
      isLoading.value = false
      return
    }
    
    const stockItem = stockItems[0]
    if (!stockItem) {
      addLog('No stock item found')
      toast.add({ title: 'No stock item found', color: 'warning' })
      isLoading.value = false
      return
    }
    
    const removeData: RemoveStockDto = {
      quantity: stockQuantity.value,
      notes: 'Stock removed via webapp'
    }
    await inventree.removeStock(stockItem.pk, removeData)
    
    selectedPart.value.in_stock = Math.max(0, selectedPart.value.in_stock - stockQuantity.value)
    addLog(`Removed ${stockQuantity.value} units`)
    toast.add({ title: 'Stock removed', description: `Removed ${stockQuantity.value} units`, color: 'success' })
    stockQuantity.value = 1
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove stock'
    addLog(`Error: ${message}`)
    toast.add({ title: 'Failed to remove stock', description: message, color: 'error' })
  } finally {
    isLoading.value = false
  }
}

const clearLog = () => {
  debugLog.value = []
}

const copyLog = () => {
  navigator.clipboard.writeText(debugLog.value.join('\n'))
}

onMounted(() => {
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === '/') {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      searchInputRef.value?.inputRef?.focus()
    }
  }
  document.addEventListener('keydown', handleKeydown)
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })
})
</script>

<template>
  <div class="container mx-auto p-6 max-w-3xl">
    <div class="mb-8">
      <h1 class="text-2xl font-bold mb-2">Add Stock</h1>
      <p class="text-gray-600 dark:text-gray-400">Search for a part and add stock</p>
    </div>

    <!-- Part Search -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold">Find Part</h2>
      </template>

      <div class="space-y-4">
        <UFormField label="Search by Name or IPN" description="Enter part name or internal part number">
          <div class="flex gap-2">
            <UInput 
              ref="searchInputRef"
              v-model="searchQuery" 
              placeholder="e.g. Resistor or RES-10K-001" 
              class="flex-1"
              @keyup.enter="searchPart"
            >
              <template #trailing>
                <UKbd value="/" size="sm" />
              </template>
            </UInput>
            <UButton 
              @click="searchPart" 
              :loading="isLoading"
              icon="i-lucide-search"
            >
              Search
            </UButton>
          </div>
        </UFormField>

        <div v-if="selectedPart" class="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 mt-4">
          <div class="flex items-start justify-between">
            <div>
              <p class="font-semibold text-lg">{{ selectedPart.name }}</p>
              <p v-if="selectedPart.IPN" class="text-sm text-gray-600 dark:text-gray-400">IPN: {{ selectedPart.IPN }}</p>
              <p v-if="selectedPart.description" class="text-sm mt-1">{{ selectedPart.description }}</p>
              <p class="text-sm mt-2 font-medium">Current Stock: {{ selectedPart.in_stock || 0 }} units</p>
            </div>
            <UBadge color="success">Found</UBadge>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Manage Stock Form -->
    <UCard v-if="selectedPart" class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold">Manage Stock</h2>
      </template>

      <div class="space-y-4">
        <UFormField label="Quantity" description="Number of units">
          <UInput v-model.number="stockQuantity" type="number" min="1" size="lg" />
        </UFormField>
      </div>

      <template #footer>
        <div class="flex gap-3 justify-end">
          <UButton 
            @click="removeStock" 
            :loading="isLoading"
            icon="i-lucide-minus"
            color="error"
            size="lg"
          >
            Remove Stock
          </UButton>
          <UButton 
            @click="addStock" 
            :loading="isLoading"
            icon="i-lucide-plus"
            size="lg"
          >
            Add Stock
          </UButton>
        </div>
      </template>
    </UCard>

    <!-- Debug Log -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Debug Log</h2>
          <div class="flex gap-2">
            <UButton @click="copyLog" variant="ghost" size="xs" icon="i-lucide-copy">
              Copy
            </UButton>
            <UButton @click="clearLog" variant="ghost" size="xs" icon="i-lucide-trash-2">
              Clear
            </UButton>
          </div>
        </div>
      </template>

      <div class="bg-gray-50 dark:bg-gray-900 rounded p-4 font-mono text-xs max-h-96 overflow-y-auto">
        <div v-if="debugLog.length === 0" class="text-gray-500">
          No logs yet. Search for a part to see API responses.
        </div>
        <div v-for="(log, index) in debugLog" :key="index" class="mb-2 whitespace-pre-wrap break-all">
          {{ log }}
        </div>
      </div>
    </UCard>
  </div>
</template>
