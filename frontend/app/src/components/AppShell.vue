<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-left">
        <span class="header-title font-semibold">{{ title }}</span>
      </div>
      <div class="header-right">
        <fluent-button appearance="subtle" @click="toggleTheme">
          <i :class="['mdi', isDark ? 'mdi-weather-sunny' : 'mdi-weather-night']" style="font-size: 20px"></i>
        </fluent-button>
        <span class="user-name">{{ authStore.user?.name }}</span>
        <fluent-button appearance="subtle" @click="authStore.logout">退出</fluent-button>
      </div>
    </header>
    <div class="app-body">
      <nav class="app-sidebar">
        <slot name="nav" />
      </nav>
      <main class="app-content">
        <div class="content-container">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTheme } from '../composables/useTheme'

withDefaults(defineProps<{
  title?: string
}>(), {
  title: 'Suzuran Cloud',
})

const authStore = useAuthStore()
const { isDark, toggleTheme } = useTheme()
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: 48px 1fr;
  height: 100vh;
  background: var(--colorNeutralBackground1);
  color: var(--colorNeutralForeground1);
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacingHorizontalL);
  background: var(--colorNeutralBackground2);
  border-bottom: 1px solid var(--colorNeutralStroke2);
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalS);
}

.header-title {
  font-size: var(--fontSizeBase400);
  color: var(--colorNeutralForeground1);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalS);
}

.user-name {
  color: var(--colorNeutralForeground2);
  font-size: var(--fontSizeBase200);
}

.app-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  overflow: hidden;
}

.app-sidebar {
  background: var(--colorNeutralBackground2);
  border-right: 1px solid var(--colorNeutralStroke2);
  overflow-y: auto;
  padding: var(--spacingVerticalS) 0;
}

.app-content {
  overflow-y: auto;
  padding: var(--spacingVerticalXL) var(--spacingHorizontalXL);
}

.content-container {
  max-width: 1200px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .app-body {
    grid-template-columns: 1fr;
  }
  .app-sidebar {
    position: fixed;
    top: 48px;
    left: 0;
    bottom: 0;
    width: 240px;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }
}
</style>
