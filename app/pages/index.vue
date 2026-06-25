<script setup lang="ts">
const config = useRuntimeConfig()
</script>

<template>
  <div class="container mx-auto p-6 max-w-4xl">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold mb-1">
          {{ config.public.appName }}
        </h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ config.public.appTagline }}
        </p>
      </div>
      <NuxtLink to="/config">
        <UButton
          variant="outline"
          icon="i-lucide-settings"
          size="sm"
        >
          Config
        </UButton>
      </NuxtLink>
    </div>

    <!-- Primary Actions -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
              <UIcon
                name="i-lucide-shopping-cart"
                class="w-6 h-6 text-orange-600 dark:text-orange-400"
              />
            </div>
            <h2 class="text-xl font-semibold">
              Self-Checkout
            </h2>
          </div>
        </template>

        <p class="text-gray-600 dark:text-gray-400 mb-4">
          Scan items, build a cart, and check out. Stock is removed automatically.
        </p>

        <template #footer>
          <NuxtLink to="/checkout">
            <UButton
              block
              icon="i-lucide-arrow-right"
              trailing
            >
              Go to Checkout
            </UButton>
          </NuxtLink>
        </template>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-teal-100 dark:bg-teal-900 rounded-lg">
              <UIcon
                name="i-lucide-clipboard-check"
                class="w-6 h-6 text-teal-600 dark:text-teal-400"
              />
            </div>
            <h2 class="text-xl font-semibold">
              Stock Taking
            </h2>
          </div>
        </template>

        <p class="text-gray-600 dark:text-gray-400 mb-4">
          Verify and adjust stock counts by scanning items. Submit changes in bulk.
        </p>

        <template #footer>
          <NuxtLink to="/stock-taking">
            <UButton
              block
              icon="i-lucide-arrow-right"
              trailing
            >
              Go to Stock Taking
            </UButton>
          </NuxtLink>
        </template>
      </UCard>
    </div>

    <!-- Tools Section -->
    <div class="mb-4">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Tools
      </h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <div class="p-1.5 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <UIcon
                name="i-lucide-plus-circle"
                class="w-5 h-5 text-blue-600 dark:text-blue-400"
              />
            </div>
            <h3 class="text-base font-semibold">
              Create Part
            </h3>
          </div>
        </template>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Create new parts with optional initial stock.
        </p>

        <template #footer>
          <NuxtLink to="/create-part">
            <UButton
              block
              size="sm"
              icon="i-lucide-arrow-right"
              trailing
            >
              Create Part
            </UButton>
          </NuxtLink>
        </template>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <div class="p-1.5 bg-green-100 dark:bg-green-900 rounded-lg">
              <UIcon
                name="i-lucide-package-plus"
                class="w-5 h-5 text-green-600 dark:text-green-400"
              />
            </div>
            <h3 class="text-base font-semibold">
              Add Stock
            </h3>
          </div>
        </template>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Search parts by name or IPN and add stock.
        </p>

        <template #footer>
          <NuxtLink to="/add-stock">
            <UButton
              block
              size="sm"
              icon="i-lucide-arrow-right"
              trailing
            >
              Add Stock
            </UButton>
          </NuxtLink>
        </template>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <div class="p-1.5 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <UIcon
                name="i-lucide-scan-barcode"
                class="w-5 h-5 text-purple-600 dark:text-purple-400"
              />
            </div>
            <h3 class="text-base font-semibold">
              Barcode Scanner
            </h3>
          </div>
        </template>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Scan and look up barcodes for inventory items.
        </p>

        <template #footer>
          <NuxtLink to="/scan">
            <UButton
              block
              size="sm"
              icon="i-lucide-arrow-right"
              trailing
            >
              Scanner
            </UButton>
          </NuxtLink>
        </template>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <div class="p-1.5 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
              <UIcon
                name="i-lucide-warehouse"
                class="w-5 h-5 text-indigo-600 dark:text-indigo-400"
              />
            </div>
            <h3 class="text-base font-semibold">
              View Stock
            </h3>
          </div>
        </template>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Browse all parts and stock levels in one view.
        </p>

        <template #footer>
          <NuxtLink to="/stock">
            <UButton
              block
              size="sm"
              icon="i-lucide-arrow-right"
              trailing
            >
              View Stock
            </UButton>
          </NuxtLink>
        </template>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <div class="p-1.5 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
              <UIcon
                name="i-lucide-layers"
                class="w-5 h-5 text-yellow-600 dark:text-yellow-400"
              />
            </div>
            <h3 class="text-base font-semibold">
              BOM
            </h3>
          </div>
        </template>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Manage assemblies and view stock availability.
        </p>

        <template #footer>
          <NuxtLink to="/bom">
            <UButton
              block
              size="sm"
              icon="i-lucide-arrow-right"
              trailing
            >
              Bill of Materials
            </UButton>
          </NuxtLink>
        </template>
      </UCard>
    </div>
  </div>
</template>
