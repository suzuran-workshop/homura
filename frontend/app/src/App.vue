<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter, RouterView } from 'vue-router'
import { useAuthStore } from './stores/auth'

const authStore = useAuthStore()
const router = useRouter()

onMounted(() => {
  authStore.initFromStorage()
  // Listen for auth:logout events from api/client.ts to navigate via router
  // instead of window.location.href (avoids full page reload).
  window.addEventListener('auth:logout', handleLogout)
})

onUnmounted(() => {
  window.removeEventListener('auth:logout', handleLogout)
})

function handleLogout() {
  authStore.logout()
  if (router.currentRoute.value.path !== '/login') {
    router.push('/login')
  }
}
</script>

<template>
  <RouterView />
</template>

<style scoped>
</style>
