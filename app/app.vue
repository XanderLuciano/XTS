<script setup lang="ts">
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'XTS Inventory'
const description = 'XTS inventory management interface powered by InvenTree.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
})

const { currentUser, users, switchUser, loadUser } = useCurrentUser()
const { flags, load: loadFlags } = useFeatureFlags()

onMounted(() => {
  loadUser()
  loadFlags()
})

const userMenuItems = computed(() =>
  users
    .filter(u => u.id !== currentUser.value.id)
    .map(u => [{
      label: u.name,
      avatar: { text: u.initials },
      click: () => switchUser(u.id)
    }])
)

const primaryNav = [
  {
    label: 'Checkout',
    icon: 'i-lucide-shopping-cart',
    to: '/checkout'
  },
  {
    label: 'Stock Taking',
    icon: 'i-lucide-clipboard-check',
    to: '/stock-taking'
  }
]

const toolsNav = [
  {
    label: 'Create Part',
    icon: 'i-lucide-plus-circle',
    to: '/create-part'
  },
  {
    label: 'Add Stock',
    icon: 'i-lucide-package-plus',
    to: '/add-stock'
  },
  {
    label: 'Scanner',
    icon: 'i-lucide-scan-barcode',
    to: '/scan'
  }
]

const settingsNav = [
  {
    label: 'Config',
    icon: 'i-lucide-settings',
    to: '/config'
  }
]
</script>

<template>
  <UApp>
    <UDashboardGroup>
      <UDashboardSidebar>
        <template #header>
          <NuxtLink to="/" class="flex items-center gap-2 px-1">
            <span class="font-bold text-lg bg-gradient-to-r from-primary-500 to-primary-400 bg-clip-text text-transparent tracking-wide">XTS</span>
            <span class="text-sm text-muted">Inventory</span>
          </NuxtLink>
        </template>

        <UNavigationMenu :items="primaryNav" orientation="vertical" />

        <USeparator label="Tools" class="my-2" />

        <UNavigationMenu :items="toolsNav" orientation="vertical" />

        <USeparator class="my-2" />

        <UNavigationMenu :items="settingsNav" orientation="vertical" />

        <template #footer>
          <div class="flex items-center w-full">
            <UColorModeButton size="xs" />
            <div class="flex-1" />
            <p class="text-xs text-muted">made by xanderr</p>
          </div>
        </template>
      </UDashboardSidebar>

      <UDashboardPanel>
        <template v-if="flags.userProfileSwitcher" #header>
          <UDashboardNavbar :ui="{ root: 'h-10 min-h-10' }">
            <template #right>
              <UDropdownMenu :items="userMenuItems">
                <UButton variant="ghost" color="neutral" class="gap-2">
                  <UAvatar :text="currentUser.initials" size="2xs" />
                  <span class="text-sm">{{ currentUser.name }}</span>
                </UButton>
              </UDropdownMenu>
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <NuxtPage />
        </template>
      </UDashboardPanel>
    </UDashboardGroup>
  </UApp>
</template>
