<template>
  <div class="fluent-table-wrapper overflow-x-auto">
    <table class="fluent-table" :class="{ 'table-dense': dense }">
      <slot />
    </table>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  dense?: boolean
}>(), {
  dense: false,
})
</script>

<style scoped>
.fluent-table-wrapper {
  width: 100%;
  border-radius: var(--borderRadiusMedium);
  border: 1px solid var(--colorNeutralStroke2);
  overflow: hidden;
}

.fluent-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fontSizeBase200);
  line-height: var(--lineHeightBase200);
}

.fluent-table :deep(thead) {
  background: var(--colorNeutralBackground2);
}

.fluent-table :deep(th) {
  text-align: left;
  font-weight: var(--fontWeightSemibold);
  padding: var(--spacingVerticalS) var(--spacingHorizontalM);
  border-bottom: 2px solid var(--colorNeutralStroke1);
  color: var(--colorNeutralForeground2);
  white-space: nowrap;
}

.fluent-table :deep(td) {
  padding: var(--spacingVerticalS) var(--spacingHorizontalM);
  border-bottom: 1px solid var(--colorNeutralStroke2);
  color: var(--colorNeutralForeground1);
}

.fluent-table.table-dense :deep(th),
.fluent-table.table-dense :deep(td) {
  padding: var(--spacingVerticalXS) var(--spacingHorizontalS);
}

.fluent-table :deep(tbody tr:last-child td) {
  border-bottom: none;
}

.fluent-table :deep(tbody tr:hover td) {
  background: var(--colorNeutralBackground1Hover, var(--colorNeutralBackground2));
}
</style>
