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
    // Compose display name: "165580-001 · Rev A · 10K Ohm Resistor"
    const composedName = [
      partForm.IPN,
      partForm.revision ? `Rev ${partForm.revision}` : null,
      partForm.name
    ].filter(Boolean).join(' · ')

    const partData: CreatePartDto = {
      name: composedName,
      IPN: partForm.IPN,
      revision: partForm.revision || undefined,
      description: partForm.description || undefined,
      active: true,
      component: true,
      purchaseable: true
    }

    const response = await inventree.createPart(partData)

    toast.add({ title: 'Part created', description: composedName, color: 'success' })

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

    // Print labels and link barcode if label printing is enabled
    if (partForm.printLabels && stockItem) {
      try {
        // Generate one barcode for all labels (per-item prints identical copies)
        const partId = (partForm.IPN || partForm.name).replace(/\s+/g, '-').toUpperCase()
        const revision = partForm.revision || '0'
        const uid = Math.random().toString(36).slice(2, 8)
        const barcode = `${partId}-${revision}-${uid}`

        const labelCount = partForm.labelMode === 'per-item'
          ? partForm.stockQuantity
          : 1
        const quantity = partForm.labelMode === 'one' ? partForm.stockQuantity : undefined

        // Print N labels (identical copies for per-item, or one label with quantity)
        const printerUrl = localStorage.getItem('zebra_printer_url') || ''
        const printerApiKey = localStorage.getItem('zebra_api_key') || ''

        for (let i = 0; i < labelCount; i++) {
          await $fetch('/api/print-label', {
            method: 'POST',
            body: {
              barcode,
              partName: partForm.name,
              partNumber: partForm.IPN || 'N/A',
              quantity,
              printerUrl: printerUrl || undefined,
              apiKey: printerApiKey || undefined
            }
          })
        }

        // Link barcode to the stock item (once — all labels share the same barcode)
        await inventree.linkBarcode(barcode, stockItem.pk)

        // Single summary toast
        const copies = labelCount > 1 ? ` (${labelCount} identical copies)` : ''
        toast.add({
          title: labelCount === 1 ? 'Label printed' : `${labelCount} labels printed`,
          description: `Barcode: ${barcode}${copies}`,
          color: 'success'
        })
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
        <UFormField label="Part Number" description="Engineering part number, e.g. 165801-001 (optional)">
          <UInput v-model="partForm.IPN" placeholder="e.g. 165801-001" />
        </UFormField>

        <!-- Part Revision -->
        <UFormField label="Part Revision" description="Just the letter or number — &quot;Rev&quot; is prepended automatically (optional)">
          <UInput v-model="partForm.revision" placeholder="e.g. A" />
        </UFormField>

        <!-- Part Name -->
        <UFormField label="Part Name" required description="The display name of the part">
          <UInput v-model="partForm.name" placeholder="e.g. Fork Arm" size="lg" />
        </UFormField>

        <!-- Description -->
        <UFormField label="Description" description="Optional description of the part">
          <UTextarea v-model="partForm.description" placeholder="e.g. Injection molded ABS, black, snap-fit" :rows="3" />
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
                  All share the same barcode linked to the stock item in InvenTree.
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
