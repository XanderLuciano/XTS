<script setup lang="ts">
import { composeLabelElements, elementsToZpl, generateTestLabelData } from '~/utils/label'

const serverUrl = ref('')
const apiToken = ref('')
const savedMessage = ref('')

const zebraPrinterUrl = ref('')
const zebraApiKey = ref('')
const zebraMessage = ref('')

const { flags, setFlag, load: loadFlags } = useFeatureFlags()
const { settings: printerSettings, load: loadPrinterSettings, setDefaultMethod } = usePrinterSettings()
const {
  isSupported: localPrinterSupported,
  isConnected: localPrinterConnected,
  isConnecting: localPrinterConnecting,
  connectedPrinterName,
  lastError: localPrinterError,
  listenForUsbEvents,
  connect: connectLocalPrinter,
  reconnect: reconnectLocalPrinter,
  disconnect: disconnectLocalPrinter,
  printZpl
} = useLocalPrinter()

const toast = useToast()
const localPrinterMessage = ref('')
const serverTestMessage = ref('')
const isTestingServer = ref(false)
const isTestingLocal = ref(false)

onMounted(() => {
  loadFlags()
  loadPrinterSettings()
  // Listen for USB plug/unplug events to keep status reactive
  listenForUsbEvents()
  // Try to auto-reconnect to a previously paired local printer
  reconnectLocalPrinter()
})

const saveConfig = () => {
  localStorage.setItem('inventree_api_url', serverUrl.value)
  localStorage.setItem('inventree_api_token', apiToken.value)

  savedMessage.value = '✓ Configuration saved! Reload the page for changes to take effect.'

  setTimeout(() => {
    savedMessage.value = ''
  }, 5000)
}

const testConnection = async () => {
  savedMessage.value = 'Testing connection...'
  try {
    const response = await $fetch(`${serverUrl.value}/user/me/`, {
      headers: {
        Authorization: `Token ${apiToken.value}`
      }
    })
    savedMessage.value = `✓ Connection successful! Authenticated as: ${(response as any).username}`
  } catch (error: any) {
    savedMessage.value = `✗ Connection failed: ${error.message}`
  }
}

const saveZebraConfig = () => {
  localStorage.setItem('zebra_printer_url', zebraPrinterUrl.value)
  localStorage.setItem('zebra_api_key', zebraApiKey.value)

  zebraMessage.value = '✓ Printer configuration saved!'

  setTimeout(() => {
    zebraMessage.value = ''
  }, 5000)
}

const testPrinter = async () => {
  zebraMessage.value = 'Testing printer connection...'
  try {
    const url = zebraPrinterUrl.value.replace(/\/$/, '')
    await $fetch(`${url}/api/health`)

    // Connection works — auto-save the config
    localStorage.setItem('zebra_printer_url', zebraPrinterUrl.value)
    localStorage.setItem('zebra_api_key', zebraApiKey.value)

    zebraMessage.value = '✓ Printer service is reachable! Configuration saved.'
  } catch (error: any) {
    zebraMessage.value = `✗ Printer connection failed: ${error.message}`
  }
}

// --- Test Print (Server) ---
const testPrintServer = async () => {
  isTestingServer.value = true
  serverTestMessage.value = 'Sending test label to server printer...'

  try {
    const testData = generateTestLabelData()
    const printerUrl = localStorage.getItem('zebra_printer_url') || ''
    const printerApiKey = localStorage.getItem('zebra_api_key') || ''

    await $fetch('/api/print-label', {
      method: 'POST',
      body: {
        barcode: testData.barcode,
        partName: testData.partName,
        partNumber: testData.partNumber,
        quantity: testData.quantity,
        vendor: testData.vendor,
        printerUrl: printerUrl || undefined,
        apiKey: printerApiKey || undefined
      }
    })

    serverTestMessage.value = '✓ Test label sent to server printer!'
    toast.add({ title: 'Test label printed', description: 'Sent via server printer', color: 'success' })
  } catch (error: any) {
    const message = error?.data?.message || error?.message || 'Unknown error'
    serverTestMessage.value = `✗ Test print failed: ${message}`
  } finally {
    isTestingServer.value = false
    setTimeout(() => { serverTestMessage.value = '' }, 5000)
  }
}

// --- Local Printer Controls ---
const handleConnectLocal = async () => {
  const success = await connectLocalPrinter()
  if (success) {
    localPrinterMessage.value = `✓ Connected to ${connectedPrinterName.value}`
    toast.add({ title: 'Local printer connected', description: connectedPrinterName.value || 'USB printer', color: 'success' })
  } else if (localPrinterError.value) {
    localPrinterMessage.value = `✗ ${localPrinterError.value}`
  }
  setTimeout(() => { localPrinterMessage.value = '' }, 5000)
}

const handleDisconnectLocal = async () => {
  await disconnectLocalPrinter()
  localPrinterMessage.value = '✓ Disconnected from local printer'
  setTimeout(() => { localPrinterMessage.value = '' }, 5000)
}

// --- Test Print (Local USB) ---
const testPrintLocal = async () => {
  if (!localPrinterConnected.value) {
    localPrinterMessage.value = '✗ No local printer connected. Connect a printer first.'
    setTimeout(() => { localPrinterMessage.value = '' }, 5000)
    return
  }

  isTestingLocal.value = true
  localPrinterMessage.value = 'Sending test label to local printer...'

  try {
    const testData = generateTestLabelData()
    const elements = composeLabelElements(testData)
    const zpl = elementsToZpl(elements)
    const ok = await printZpl(zpl)

    if (ok) {
      localPrinterMessage.value = '✓ Test label sent to local printer!'
      toast.add({ title: 'Test label printed', description: 'Sent via local USB', color: 'success' })
    } else {
      localPrinterMessage.value = `✗ Print failed: ${localPrinterError.value || 'Unknown error'}`
    }
  } catch (error: any) {
    localPrinterMessage.value = `✗ Test print failed: ${error.message}`
  } finally {
    isTestingLocal.value = false
    setTimeout(() => { localPrinterMessage.value = '' }, 5000)
  }
}

// --- Default Printer Selection ---
const defaultPrinterOptions = [
  { label: 'Server Printer (Remote API)', value: 'server' as const },
  { label: 'Local USB Printer', value: 'local' as const }
]

const onDefaultMethodChange = (value: 'server' | 'local') => {
  setDefaultMethod(value)
  toast.add({
    title: 'Default printer updated',
    description: value === 'local' ? 'Labels will print to local USB by default' : 'Labels will print to server printer by default',
    color: 'success'
  })
}

// Load from localStorage on mount, fall back to runtimeConfig defaults
onMounted(() => {
  const config = useRuntimeConfig()
  const savedUrl = localStorage.getItem('inventree_api_url')
  const savedToken = localStorage.getItem('inventree_api_token')

  serverUrl.value = savedUrl || config.public.inventreeApiUrl || ''
  apiToken.value = savedToken || config.public.inventreeApiToken || ''

  const savedPrinterUrl = localStorage.getItem('zebra_printer_url')
  const savedPrinterKey = localStorage.getItem('zebra_api_key')

  zebraPrinterUrl.value = savedPrinterUrl || config.public.zebraPrinterUrl || ''
  zebraApiKey.value = savedPrinterKey || config.public.zebraApiKey || ''
})
</script>

<template>
  <div class="container mx-auto p-6 max-w-3xl">
    <div class="mb-8">
      <h1 class="text-2xl font-bold mb-2">Configuration</h1>
      <p class="text-gray-600 dark:text-gray-400">Configure InvenTree server connection and printer settings</p>
    </div>

    <!-- InvenTree Server Settings -->
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Server Settings</h2>
      </template>

      <div class="space-y-4">
        <div class="space-y-4">
          <UFormField
            label="InvenTree API URL"
            description="The base URL of your InvenTree API (e.g., http://localhost/api)"
          >
            <UInput v-model="serverUrl" placeholder="http://localhost/api" size="lg" />
          </UFormField>

          <UFormField
            label="API Token"
            description="Your InvenTree API authentication token"
          >
            <UInput v-model="apiToken" type="password" placeholder="inv-..." size="lg" />
          </UFormField>
        </div>

        <!-- How to get your token -->
        <div class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-info" class="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p class="font-medium mb-1">How to Get Your API Token</p>
              <ul class="list-disc list-inside space-y-0.5 text-xs">
                <li>Log in to your InvenTree server</li>
                <li>Go to Settings → User Settings → API</li>
                <li>Click "Generate Token" or copy your existing token</li>
                <li>Paste the token in the field above</li>
              </ul>
            </div>
          </div>
        </div>

        <div v-if="savedMessage" class="p-4 rounded-lg" :class="savedMessage.startsWith('✓') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
          {{ savedMessage }}
        </div>
      </div>

      <template #footer>
        <div class="flex gap-3 justify-end">
          <UButton @click="testConnection" variant="outline" icon="i-lucide-shield-check">
            Test Connection
          </UButton>
          <UButton @click="saveConfig" icon="i-lucide-save" size="lg">
            Save Configuration
          </UButton>
        </div>
      </template>
    </UCard>

    <!-- Default Printer Selection -->
    <UCard class="mt-6">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-printer" class="w-5 h-5" />
          <h2 class="text-lg font-semibold">Default Printer</h2>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Choose which printer to use by default when printing labels. If the selected printer is unavailable,
          you'll be given the option to retry or fall back to the other method.
        </p>

        <UFormField label="Print Method">
          <USelectMenu
            :model-value="printerSettings.defaultMethod"
            :items="defaultPrinterOptions"
            value-key="value"
            :searchable="false"
            size="lg"
            @update:model-value="onDefaultMethodChange"
          />
        </UFormField>

        <div v-if="printerSettings.defaultMethod === 'local' && !localPrinterSupported" class="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 text-sm">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-alert-circle" class="w-4 h-4 shrink-0" />
            <span>WebUSB is not supported in this browser. Local printing requires Chrome or Edge.</span>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Server Printer Configuration -->
    <UCard class="mt-6">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-server" class="w-5 h-5" />
          <h2 class="text-lg font-semibold">Server Printer (Remote API)</h2>
        </div>
      </template>

      <div class="space-y-4">
        <UFormField
          label="Printer Service URL"
          description="The URL of your zebra-label-printer HTTP API (e.g., http://localhost:3420)"
        >
          <UInput v-model="zebraPrinterUrl" placeholder="http://localhost:3420" size="lg" />
        </UFormField>

        <UFormField
          label="Printer API Key"
          description="API key for the printer service (leave empty if not configured)"
        >
          <UInput v-model="zebraApiKey" type="password" placeholder="Optional" size="lg" />
        </UFormField>

        <div v-if="zebraMessage" class="p-4 rounded-lg" :class="zebraMessage.startsWith('✓') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
          {{ zebraMessage }}
        </div>

        <div v-if="serverTestMessage" class="p-4 rounded-lg" :class="serverTestMessage.startsWith('✓') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
          {{ serverTestMessage }}
        </div>
      </div>

      <template #footer>
        <div class="flex gap-3 justify-end">
          <UButton @click="testPrinter" variant="outline" icon="i-lucide-wifi">
            Test Connection
          </UButton>
          <UButton @click="testPrintServer" variant="outline" icon="i-lucide-printer" :loading="isTestingServer">
            Print Test Label
          </UButton>
          <UButton @click="saveZebraConfig" icon="i-lucide-save" size="lg">
            Save Printer Config
          </UButton>
        </div>
      </template>
    </UCard>

    <!-- Local USB Printer -->
    <UCard class="mt-6">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-usb" class="w-5 h-5" />
          <h2 class="text-lg font-semibold">Local USB Printer</h2>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Connect a Zebra label printer directly via USB. Prints labels without going through the server.
          Requires Chrome or Edge browser.
        </p>

        <!-- Status -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <div
              class="w-2.5 h-2.5 rounded-full"
              :class="localPrinterConnected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'"
            />
            <span class="text-sm font-medium">
              <template v-if="localPrinterConnected">
                Connected: {{ connectedPrinterName }}
              </template>
              <template v-else-if="!localPrinterSupported">
                Not supported (requires Chrome/Edge)
              </template>
              <template v-else>
                Not connected
              </template>
            </span>
          </div>
        </div>

        <div v-if="localPrinterMessage" class="p-4 rounded-lg" :class="localPrinterMessage.startsWith('✓') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
          {{ localPrinterMessage }}
        </div>

        <!-- Windows driver note -->
        <div class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-info" class="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p class="font-medium mb-1">Setup Notes</p>
              <ul class="list-disc list-inside space-y-0.5 text-xs">
                <li>On Windows, the printer may need the WinUSB driver (use Zadig to switch)</li>
                <li>The browser will remember your printer selection after first pairing</li>
                <li>HTTPS or localhost is required for WebUSB access</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-3 justify-end">
          <UButton
            v-if="localPrinterConnected"
            @click="handleDisconnectLocal"
            variant="outline"
            color="error"
            icon="i-lucide-unplug"
          >
            Disconnect
          </UButton>
          <UButton
            v-else
            @click="handleConnectLocal"
            variant="outline"
            icon="i-lucide-plug"
            :loading="localPrinterConnecting"
            :disabled="!localPrinterSupported"
          >
            Connect Printer
          </UButton>
          <UButton
            @click="testPrintLocal"
            variant="outline"
            icon="i-lucide-printer"
            :loading="isTestingLocal"
            :disabled="!localPrinterConnected"
          >
            Print Test Label
          </UButton>
        </div>
      </template>
    </UCard>

    <!-- Feature Flags -->
    <UCard class="mt-6">
      <template #header>
        <h2 class="text-lg font-semibold">Feature Flags</h2>
      </template>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium text-sm">User Profile Switcher</p>
            <p class="text-xs text-muted">Show the top navbar with user profile dropdown</p>
          </div>
          <USwitch
            :model-value="flags.userProfileSwitcher"
            @update:model-value="(val: boolean) => setFlag('userProfileSwitcher', val)"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
