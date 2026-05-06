<template>
  <UContainer class="py-8">
    <h1 class="text-3xl font-bold mb-6">InvenTree Parts</h1>
    <UCard v-if="pending">Loading...</UCard>
    <UCard v-else-if="error">Error: {{ error.message }}</UCard>
    <div v-else class="grid gap-4">
      <UCard v-for="part in data?.parts" :key="part.pk">
        <template #header>
          <h3 class="text-xl font-semibold">{{ part.name }}</h3>
        </template>
        <p>Category: {{ part.category }}</p>
        <p>Stock: {{ part.stock }}</p>
      </UCard>
    </div>
  </UContainer>
</template>

<script setup lang="ts">
const api = useInventreeApi()
const { data, pending, error } = await useAsyncData('parts', () => api('/parts'))
</script>
