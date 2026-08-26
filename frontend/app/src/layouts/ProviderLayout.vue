<template>
  <AppShell title="服务商门户">
    <template #nav>
      <NavItem to="/provider/dashboard" icon="mdi-view-dashboard" label="仪表盘" />
      <NavItem to="/provider/apps" icon="mdi-apps" label="应用启动台" />
      <NavItem to="/provider/distribution" icon="mdi-share-variant" label="应用分发" />
      <NavItem to="/provider/orgs" icon="mdi-account-multiple" label="组织管理" />
    </template>
  </AppShell>
</template>

<script setup lang="ts">
import AppShell from '../components/AppShell.vue'
import NavItem from '../components/NavItem.vue'
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
