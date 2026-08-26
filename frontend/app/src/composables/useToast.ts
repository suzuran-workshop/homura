import { ref } from 'vue'

const toastState = ref({ visible: false, text: '', intent: 'success' as string })

export function useToast() {
  function notify(text: string, intent = 'success') {
    toastState.value = { visible: true, text, intent }
    setTimeout(() => { toastState.value.visible = false }, 3000)
  }
  return { toastState, notify }
}
