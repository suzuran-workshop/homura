<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="visible" :class="['toast-message', `toast-${intent}`]">
        <i :class="['mdi', iconClass]" style="font-size: 20px"></i>
        <span class="toast-text">{{ text }}</span>
        <button type="button" class="toast-close" @click="dismiss">
          <i class="mdi mdi-close" style="font-size: 16px"></i>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useToast } from '../composables/useToast'

const { toastState } = useToast()

const visible = computed(() => toastState.value.visible)
const text = computed(() => toastState.value.text)
const intent = computed(() => toastState.value.intent)

const iconClass = computed(() => {
  switch (intent.value) {
    case 'success': return 'mdi-check-circle'
    case 'error': return 'mdi-close-circle'
    case 'warning': return 'mdi-alert-circle'
    case 'info': return 'mdi-information-outline'
    default: return 'mdi-check-circle'
  }
})

function dismiss() {
  toastState.value.visible = false
}
</script>

<style scoped>
.toast-message {
  position: fixed;
  bottom: var(--spacingVerticalXL);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalS);
  padding: var(--spacingVerticalS) var(--spacingHorizontalL);
  border-radius: var(--borderRadiusMedium);
  box-shadow: var(--shadow16);
  font-size: var(--fontSizeBase200);
  z-index: 9999;
  max-width: 480px;
  pointer-events: auto;
}

.toast-success {
  background: var(--colorPaletteGreenBackground3);
  color: #fff;
}

.toast-error {
  background: var(--colorPaletteRedBackground3);
  color: #fff;
}

.toast-warning {
  background: var(--colorPaletteYellowBackground3);
  color: #000;
}

.toast-info {
  background: var(--colorPaletteBlueBackground3);
  color: #fff;
}

.toast-text {
  flex: 1;
}

.toast-close {
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  opacity: 0.7;
  color: inherit;
}

.toast-close:hover {
  opacity: 1;
}

.toast-enter-active {
  animation: toastIn 0.3s ease;
}

.toast-leave-active {
  animation: toastOut 0.3s ease;
}

@keyframes toastIn {
  from { transform: translateX(-50%) translateY(100%); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
}

@keyframes toastOut {
  from { transform: translateX(-50%) translateY(0); opacity: 1; }
  to { transform: translateX(-50%) translateY(100%); opacity: 0; }
}
</style>
