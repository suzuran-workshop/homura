<template>
  <div
    :class="['fluent-card', {
      'card-outlined': outlined,
      'card-interactive': interactive,
      'card-selected': selected,
    }]"
    @click="interactive ? $emit('click', $event) : null"
  >
    <div v-if="$slots.header" class="card-header">
      <slot name="header" />
    </div>
    <div class="card-body">
      <slot />
    </div>
    <div v-if="$slots.actions" class="card-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  outlined?: boolean
  interactive?: boolean
  selected?: boolean
}>(), {
  outlined: false,
  interactive: false,
  selected: false,
})

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<style scoped>
.fluent-card {
  background: var(--colorNeutralBackground1);
  border-radius: var(--borderRadiusMedium);
  box-shadow: var(--shadow4);
  overflow: hidden;
}

.card-outlined {
  box-shadow: none;
  border: 1px solid var(--colorNeutralStroke1);
}

.card-interactive {
  cursor: pointer;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.card-interactive:hover {
  box-shadow: var(--shadow8);
  transform: translateY(-1px);
}

.card-interactive:active {
  transform: translateY(0);
}

.card-selected {
  border: 2px solid var(--colorBrandBackground);
}

.card-header {
  padding: var(--spacingVerticalL) var(--spacingHorizontalL);
  border-bottom: 1px solid var(--colorNeutralStroke2);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-body {
  padding: var(--spacingVerticalL) var(--spacingHorizontalL);
}

.card-actions {
  padding: var(--spacingVerticalM) var(--spacingHorizontalL);
  border-top: 1px solid var(--colorNeutralStroke2);
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalS);
}
</style>
