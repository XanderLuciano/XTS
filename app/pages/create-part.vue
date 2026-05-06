<script setup lang="ts">
import type { CreatePartDto, AddStockDto } from '~/types/inventree'

interface PartForm {
  name: string
  description: string
  IPN: string
  active: boolean
  component: boolean
  purchaseable: boolean
  createStock: boolean
  stockQuantity: number
}

const inventree = useInventreeApi()
const toast = useToast()

const debugLog = ref<string[]>([])
const isLoading = ref(false)
const showAdvanced = ref(false)

const stockQuantityInput = ref<InstanceType<typeof UInput> | null>(null)

const partForm = reactive<PartForm>({
  name: '',
  description: '',
  IPN: '',
  active: true,
  component: true,
  purchaseable: true,
  createStock: false,
  stockQuantity: 1
})

watch(() => partForm.createStock, async (checked) => {
  if (checked) {
    await nextTick()
    const el = stockQuantityInput.value?.$el as HTMLElement | undefined
    const input = el?.querySelector('input') as HTMLInputElement | null
    if (input) {
      input.focus()
      input.select()
    }
  }
})

const addLog = (message: string) => {
  const timestamp = new Date().toLocaleTimeString()
  debugLog.value.unshift(`[${timestamp}] ${message}`)
}

const createPart = async () => {
  isLoading.value = true
  addLog(`Creating part: ${partForm.name}`)
  
  try {
    const partData: CreatePartDto = {
      name: partForm.name,
      IPN: partForm.IPN,
      description: partForm.description,
      active: partForm.active
    }
    
    const response = await inventree.createPart(partData)
    
    addLog(`Part created: ${response.pk}`)
    toast.add({ title: 'Part created', description: partForm.name, color: 'success' })
    
    if (partForm.createStock && response.pk) {
      addLog(`Creating initial stock: ${partForm.stockQuantity} units`)
      try {
        const stockData: AddStockDto = {
          part: response.pk,
          quantity: partForm.stockQuantity,
          notes: 'Initial stock created with part'
        }
        await inventree.addStock(stockData)
        addLog(`Stock created: ${partForm.stockQuantity} units`)
        toast.add({ title: 'Initial stock added', description: `${partForm.stockQuantity} units`, color: 'success' })
      } catch (stockError) {
        const message = stockError instanceof Error ? stockError.message : 'Failed to add stock'
        addLog(`Stock error: ${message}`)
        toast.add({ title: 'Failed to add initial stock', description: message, color: 'error' })
      }
    }
    
    // Reset form
    partForm.name = ''
    partForm.description = ''
    partForm.IPN = ''
    partForm.createStock = false
    partForm.stockQuantity = 1
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create part'
    addLog(`Error: ${message}`)
    toast.add({ title: 'Failed to create part', description: message, color: 'error' })
  } finally {
    isLoading.value = false
  }
}

const generateIPN = () => {
  partForm.IPN = Math.random().toString().slice(2, 10)
}

const clearLog = () => {
  debugLog.value = []
}

const copyLog = () => {
  navigator.clipboard.writeText(debugLog.value.join('\n'))
}
</script>

<template>
  <div class="container mx-auto p-6 max-w-3xl">
    <div class="mb-8">
      <h1 class="text-2xl font-bold mb-2">Create InvenTree Part</h1>
      <p class="text-gray-600 dark:text-gray-400">Simple form to create parts in InvenTree</p>
    </div>

    <!-- Part Creation Form -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold">Part Details</h2>
      </template>

      <div class="space-y-4">
        <UFormField label="Part Name" required description="The name of the part">
          <UInput v-model="partForm.name" placeholder="e.g. Resistor 10K" size="lg" />
        </UFormField>

        <UFormField label="Description" description="Optional description of the part">
          <UTextarea v-model="partForm.description" placeholder="e.g. 10K Ohm resistor, 1/4W" :rows="3" />
        </UFormField>

        <UFormField label="Internal Part Number" description="Optional internal part number for tracking">
          <div class="flex gap-2">
            <UInput v-model="partForm.IPN" placeholder="e.g. RES-10K-001" class="flex-1" />
            <UButton @click="generateIPN" icon="i-lucide-shuffle" variant="outline" color="neutral">
              Generate
            </UButton>
          </div>
        </UFormField>

        <UButton 
          @click="showAdvanced = !showAdvanced" 
          variant="ghost" 
          size="sm"
          :icon="showAdvanced ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        >
          {{ showAdvanced ? 'Hide' : 'Show' }} Advanced Options
        </UButton>

        <div v-if="showAdvanced" class="space-y-3 pt-2">
          <USeparator label="Part Properties" />
          <div class="flex items-center gap-2">
            <UCheckbox v-model="partForm.active" />
            <div>
              <label class="text-sm font-medium">Active</label>
              <p class="text-xs text-gray-500">Part is active and available</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UCheckbox v-model="partForm.component" />
            <div>
              <label class="text-sm font-medium">Component</label>
              <p class="text-xs text-gray-500">Part can be used in assemblies</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UCheckbox v-model="partForm.purchaseable" />
            <div>
              <label class="text-sm font-medium">Purchaseable</label>
              <p class="text-xs text-gray-500">Part can be purchased from suppliers</p>
            </div>
          </div>
        </div>

        <USeparator label="Initial Stock" />

        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UCheckbox v-model="partForm.createStock" />
            <div>
              <label class="text-sm font-medium">Create Initial Stock</label>
              <p class="text-xs text-gray-500">Add stock when creating this part</p>
            </div>
          </div>

          <UFormField v-if="partForm.createStock" label="Stock Quantity" description="Number of units to add">
            <UInput ref="stockQuantityInput" v-model.number="partForm.stockQuantity" type="number" min="1" />
          </UFormField>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton 
            @click="createPart" 
            :loading="isLoading" 
            :disabled="!partForm.name"
            icon="i-lucide-plus"
            size="lg"
          >
            Create Part
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
          No logs yet. Test authentication or create a part to see API responses.
        </div>
        <div v-for="(log, index) in debugLog" :key="index" class="mb-2 whitespace-pre-wrap break-all">
          {{ log }}
        </div>
      </div>
    </UCard>
  </div>
</template>
