<script setup lang="ts">
import type { CreatePartDto, AddStockDto } from '~/types/inventree'

interface PartForm {
  name: string
  description: string
  IPN: string
  revision: string
  createStock: boolean
  stockQuantity: number
  printLabels: boolean
  labelMode: 'one' | 'per-item'
}

const inventree = useInventreeApi()
const toast = useToast()

const isLoading = ref(false)

const stockQuantityInput = ref<InstanceType<typeof UInput> | null>(null)

const partForm = reactive<PartForm>({
  name: '',
  description: '',
  IPN: '',
  revision: '',
  createStock: false,
  stockQuantity: 1,
  printLabels: false,
  labelMode: 'one'
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

const createPart = async () => {
  isLoading.value = true

  try {
    const partData: CreatePartDto = {
      name: partForm.name,
      IPN: partForm.IPN,
      revision: partForm.revision || undefined,
      description: partForm.description || undefined,
      active: true,
      component: true,
      purchaseable: true
    }

    const response = await inventree.createPart(partData)

    toast.add({ title: 'Part created', description: partForm.name, color: 'success' })

    let stockItem: { pk: number } | undefined

    if (partForm.createStock && response.pk) {
      try {
        const stockData: AddStockDto = {
          part: response.pk,
          quantity: partForm.stockQuantity,
          notes: 'Initial stock created with part'
        }
        stockItem = await inventree.addStock(stockData)
        toast.add({ title: 'Initial stock added', description: `${partForm.stockQuantity} units`, color: 'success' })
      } catch (stockError) {
        const message = stockError instanceof Error ? stockError.message : 'Failed to add stock'
        toast.add({ title: 'Failed to add initial stock', description: message, color: 'error' })
      }
    }

    // Print labels and link barcodes if label printing is enabled
    if (partForm.printLabels && stockItem) {
      try {
        const labelCount = partForm.labelMode === 'per-item'
          ? partForm.stockQuantity
          : 1

        for (let i = 0; i < labelCount; i++) {
          const barcode = `${partForm.IPN || 'PART'}-${Date.now()}-${i}`
          const quantity = partForm.labelMode === 'one' ? partForm.stockQuantity : undefined

          const result = await $fetch('/api/print-label', {
            method: 'POST',
            body: {
              barcode,
              partName: partForm.name,
              partNumber: partForm.IPN || 'N/A',
              quantity
            }
          })

          // Link barcode to the stock item
          await inventree.linkBarcode(barcode, stockItem.pk)

          toast.add({
            title: `Label ${i + 1} of ${labelCount} printed`,
            description: `Barcode: ${barcode}`,
            color: 'success'
          })
        }
      } catch (labelError) {
        const message = labelError instanceof Error ? labelError.message : 'Failed to print label'
        toast.add({ title: 'Label printing failed', description: message, color: 'error' })
      }
    }

    // Reset form
    partForm.name = ''
    partForm.description = ''
    partForm.IPN = ''
    partForm.revision = ''
    partForm.createStock = false
    partForm.stockQuantity = 1
    partForm.printLabels = false
    partForm.labelMode = 'one'
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create part'
    toast.add({ title: 'Failed to create part', description: message, color: 'error' })
  } finally {
    isLoading.value = false
  }
}

const generateIPN = () => {
  partForm.IPN = Math.random().toString().slice(2, 10)
}
</script>

<template>
  <div class="container mx-auto p-6 max-w-3xl">
    <div class="mb-8">
      <h1 class="text-2xl font-bold mb-2">Create Part</h1>
      <p class="text-gray-600 dark:text-gray-400">Add a new part to the InvenTree database</p>
    </div>

    <!-- Part Creation Form -->
    <UCard class="mb-6">
      <div class="space-y-6">
        <!-- Part Number (IPN) -->
        <UFormField label="Part Number" description="Internal part number for tracking (optional)">
          <div class="flex gap-2 w-full">
            <UInput v-model="partForm.IPN" placeholder="e.g. RES-10K-001" class="flex-1" />
            <UButton @click="generateIPN" icon="i-lucide-shuffle" variant="outline" color="neutral">
              Generate
            </UButton>
          </div>
        </UFormField>

        <!-- Part Revision -->
        <UFormField label="Part Revision" description="Revision identifier for the part (optional)">
          <UInput v-model="partForm.revision" placeholder="e.g. A, Rev B" />
        </UFormField>

        <!-- Part Name -->
        <UFormField label="Part Name" required description="The display name of the part">
          <UInput v-model="partForm.name" placeholder="e.g. 10K Ohm Resistor" size="lg" />
        </UFormField>

        <!-- Description -->
        <UFormField label="Description" description="Optional description of the part">
          <UTextarea v-model="partForm.description" placeholder="e.g. 1/4W, 5% tolerance, through-hole" :rows="3" />
        </UFormField>

        <USeparator />

        <!-- Initial Stock -->
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UCheckbox v-model="partForm.createStock" />
            <div>
              <label class="text-sm font-medium">Create Initial Stock</label>
              <p class="text-xs text-gray-500">Initial stock will be created when the part is saved</p>
            </div>
          </div>

          <UFormField v-if="partForm.createStock" label="Stock Quantity" description="Number of units to add">
            <UInput ref="stockQuantityInput" v-model.number="partForm.stockQuantity" type="number" min="1" />
          </UFormField>

          <!-- Label Printing -->
          <div v-if="partForm.createStock" class="space-y-3 pt-2">
            <div class="flex items-center gap-2">
              <UCheckbox v-model="partForm.printLabels" />
              <div>
                <label class="text-sm font-medium">Print labels for this stock</label>
                <p class="text-xs text-gray-500">Print Zebra labels with part name, part number, and QR code</p>
              </div>
            </div>

            <div v-if="partForm.printLabels" class="ml-7 space-y-3">
              <div class="flex items-center gap-4">
                <URadioGroup
                  v-model="partForm.labelMode"
                  :items="[
                    { label: 'One label for this part', value: 'one' },
                    { label: 'One label per item', value: 'per-item' }
                  ]"
                />
              </div>
              <p class="text-xs text-gray-500">
                <template v-if="partForm.labelMode === 'one'">
                  Prints a single label with the total quantity ({{ partForm.stockQuantity }}).
                  Attach it to the bin or container.
                </template>
                <template v-else>
                  Prints {{ partForm.stockQuantity }} labels — one for each item.
                  Each unique barcode is linked to the same stock item in InvenTree.
                </template>
              </p>
            </div>
          </div>
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
  </div>
</template>
