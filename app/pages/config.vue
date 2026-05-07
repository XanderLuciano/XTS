<script setup lang="ts">
const serverUrl = ref('')
const apiToken = ref('')
const savedMessage = ref('')

const zebraPrinterUrl = ref('')
const zebraApiKey = ref('')
const zebraMessage = ref('')

const { flags, setFlag, load: loadFlags } = useFeatureFlags()

onMounted(() => {
  loadFlags()
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
    savedMessage.value = `✓ Connection successful! Authenticated as: ${response.username}`
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
    zebraMessage.value = '✓ Printer service is reachable!'
  } catch (error: any) {
    zebraMessage.value = `✗ Printer connection failed: ${error.message}`
  }
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
      <p class="text-gray-600 dark:text-gray-400">Configure InvenTree server connection</p>
    </div>

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Server Settings</h2>
      </template>

      <div class="space-y-4">
        <UFormGroup 
          label="InvenTree API URL" 
          description="The base URL of your InvenTree API (e.g., http://localhost/api)"
        >
          <UInput v-model="serverUrl" placeholder="http://localhost/api" size="lg" />
        </UFormGroup>

        <UFormGroup 
          label="API Token" 
          description="Your InvenTree API authentication token"
        >
          <UInput v-model="apiToken" type="password" placeholder="inv-..." size="lg" />
        </UFormGroup>

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

    <UCard class="mt-6">
      <template #header>
        <h2 class="text-lg font-semibold">How to Get Your API Token</h2>
      </template>

      <div class="space-y-3 text-sm">
        <p>1. Log in to your InvenTree server</p>
        <p>2. Go to <strong>Settings → User Settings → API</strong></p>
        <p>3. Click <strong>"Generate Token"</strong> or copy your existing token</p>
        <p>4. Paste the token in the field above</p>
      </div>
    </UCard>

    <UCard class="mt-6">
      <template #header>
        <h2 class="text-lg font-semibold">Zebra Label Printer</h2>
      </template>

      <div class="space-y-4">
        <UFormGroup
          label="Printer Service URL"
          description="The URL of your zebra-label-printer HTTP API (e.g., http://localhost:3420)"
        >
          <UInput v-model="zebraPrinterUrl" placeholder="http://localhost:3420" size="lg" />
        </UFormGroup>

        <UFormGroup
          label="Printer API Key"
          description="API key for the printer service (leave empty if not configured)"
        >
          <UInput v-model="zebraApiKey" type="password" placeholder="Optional" size="lg" />
        </UFormGroup>

        <div v-if="zebraMessage" class="p-4 rounded-lg" :class="zebraMessage.startsWith('✓') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
          {{ zebraMessage }}
        </div>
      </div>

      <template #footer>
        <div class="flex gap-3 justify-end">
          <UButton @click="testPrinter" variant="outline" icon="i-lucide-printer">
            Test Connection
          </UButton>
          <UButton @click="saveZebraConfig" icon="i-lucide-save" size="lg">
            Save Printer Config
          </UButton>
        </div>
      </template>
    </UCard>

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
