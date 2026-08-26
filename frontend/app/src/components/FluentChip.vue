<template>
  <span
    :class="['fluent-chip', `chip-${variant}`, `chip-${color}`, {
      'chip-small': small,
      'chip-closable': closable,
    }]"
  >
    <i v-if="icon" :class="['mdi', mdiIconClass, 'chip-icon']" :style="`font-size: ${small ? 10 : 12}px`"></i>
    <span class="chip-text"><slot /></span>
    <button
      v-if="closable"
      type="button"
      class="chip-close"
      :aria-label="'移除'"
      @click.stop="$emit('close')"
    >
      <i class="mdi mdi-close" :style="`font-size: ${small ? 10 : 12}px`"></i>
    </button>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'filled' | 'outlined' | 'subtle'
  color?: 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
  small?: boolean
  closable?: boolean
  icon?: string
}>(), {
  variant: 'filled',
  color: 'default',
  small: false,
  closable: false,
})

defineEmits<{
  close: []
}>()

// Map Fluent icon names to MDI class names
const fluentToMdi: Record<string, string> = {
  'play-circle': 'mdi-play-circle-outline',
  'pause-circle': 'mdi-pause-circle-outline',
  'add-circle': 'mdi-plus-circle-outline',
  'warning': 'mdi-alert-circle',
  'arrow-sync': 'mdi-autorenew',
  'question-circle': 'mdi-help-circle-outline',
  'checkmark-circle': 'mdi-check-circle',
  'dismiss-circle': 'mdi-close-circle',
}

const mdiIconClass = computed(() => {
  if (!props.icon) return ''
  // If it's a mapped Fluent name, use the mapping
  if (fluentToMdi[props.icon]) return fluentToMdi[props.icon]
  // If it already starts with mdi-, use as-is
  if (props.icon.startsWith('mdi-')) return props.icon
  // Fallback: try to use as-is
  return 'mdi-' + props.icon
})
</script>

<style scoped>
.fluent-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacingHorizontalXS);
  border-radius: var(--borderRadiusCircular);
  font-size: var(--fontSizeBase200);
  line-height: var(--lineHeightBase200);
  padding: var(--spacingVerticalXXS) var(--spacingHorizontalS);
  white-space: nowrap;
  transition: background-color 0.15s ease;
}

.fluent-chip.chip-small {
  font-size: var(--fontSizeBase100);
  padding: 1px var(--spacingHorizontalXS);
}

/* Filled variants */
.chip-filled.chip-default {
  background: var(--colorNeutralBackground3);
  color: var(--colorNeutralForeground1);
}
.chip-filled.chip-brand {
  background: var(--colorBrandBackground);
  color: #fff;
}
.chip-filled.chip-success {
  background: var(--colorPaletteGreenBackground3);
  color: #fff;
}
.chip-filled.chip-warning {
  background: var(--colorPaletteYellowBackground3);
  color: #000;
}
.chip-filled.chip-danger {
  background: var(--colorPaletteRedBackground3);
  color: #fff;
}
.chip-filled.chip-info {
  background: var(--colorPaletteBlueBackground3);
  color: #fff;
}

/* Outlined variants */
.chip-outlined {
  background: transparent;
  border: 1px solid var(--colorNeutralStroke1);
  color: var(--colorNeutralForeground1);
}
.chip-outlined.chip-brand {
  border-color: var(--colorBrandForeground1);
  color: var(--colorBrandForeground1);
}
.chip-outlined.chip-success {
  border-color: var(--colorPaletteGreenForeground1);
  color: var(--colorPaletteGreenForeground1);
}
.chip-outlined.chip-warning {
  border-color: var(--colorPaletteYellowForeground1);
  color: var(--colorPaletteYellowForeground1);
}
.chip-outlined.chip-danger {
  border-color: var(--colorPaletteRedForeground1);
  color: var(--colorPaletteRedForeground1);
}
.chip-outlined.chip-info {
  border-color: var(--colorPaletteBlueForeground1);
  color: var(--colorPaletteBlueForeground1);
}

/* Subtle variants */
.chip-subtle {
  background: transparent;
}
.chip-subtle.chip-default {
  color: var(--colorNeutralForeground2);
}
.chip-subtle.chip-brand {
  color: var(--colorBrandForeground1);
}
.chip-subtle.chip-success {
  color: var(--colorPaletteGreenForeground1);
}
.chip-subtle.chip-warning {
  color: var(--colorPaletteYellowForeground1);
}
.chip-subtle.chip-danger {
  color: var(--colorPaletteRedForeground1);
}
.chip-subtle.chip-info {
  color: var(--colorPaletteBlueForeground1);
}

.chip-icon {
  flex-shrink: 0;
}

.chip-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 0;
  margin-left: 2px;
  cursor: pointer;
  opacity: 0.6;
  border-radius: var(--borderRadiusCircular);
  transition: opacity 0.15s ease;
  color: inherit;
}

.chip-close:hover {
  opacity: 1;
}
</style>
