<template>
  <AppShell title="用户中心">
    <template #nav>
      <NavItem to="/user/apps" icon="mdi-apps" label="应用启动台" />

      <template v-if="authStore.userRole === 'provider'">
        <div class="nav-section">管理功能</div>
        <NavItem to="/provider/dashboard" icon="mdi-account-multiple" label="服务商管理" />
      </template>
    </template>
  </AppShell>
</template>

<script setup lang="ts">
import AppShell from '../components/AppShell.vue'
import NavItem from '../components/NavItem.vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
</script>

<style scoped>
.nav-section {
  padding: var(--spacingVerticalS) var(--spacingHorizontalL);
  margin-top: var(--spacingVerticalS);
  font-size: var(--fontSizeBase100);
  font-weight: var(--fontWeightSemibold);
  color: var(--colorNeutralForeground3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
