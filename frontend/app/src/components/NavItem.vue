<template>
  <router-link
    :to="to"
    class="nav-item"
    :class="{ active: isActive }"
  >
    <i :class="['mdi', mdiClass]"></i>
    <span class="nav-label">{{ label }}</span>
  </router-link>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  to: string
  icon: string
  label: string
}>()

const route = useRoute()
const isActive = computed(() => route.path.startsWith(props.to))

// NavItem receives MDI names from layouts, so pass-through as-is
// e.g. "mdi-view-dashboard", "mdi-apps", etc.
const mdiClass = computed(() => {
  if (props.icon.startsWith('mdi-')) return props.icon
  return 'mdi-' + props.icon
})
</script>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalM);
  padding: var(--spacingVerticalS) var(--spacingHorizontalL);
  margin: 1px var(--spacingHorizontalS);
  border-radius: var(--borderRadiusMedium);
  color: var(--colorNeutralForeground2);
  text-decoration: none;
  font-size: var(--fontSizeBase200);
  transition: all 0.15s ease;
}

.nav-item:hover {
  background: var(--colorNeutralBackground3);
  color: var(--colorNeutralForeground1);
  text-decoration: none;
}

.nav-item.active {
  background: var(--colorBrandBackground2);
  color: var(--colorBrandForeground1);
  font-weight: var(--fontWeightSemibold);
}

.nav-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
