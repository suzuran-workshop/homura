import { ref, watch } from 'vue'

const isDark = ref(localStorage.getItem('theme') === 'dark')

watch(isDark, (val) => {
  document.documentElement.setAttribute('data-theme', val ? 'dark' : 'light')
  localStorage.setItem('theme', val ? 'dark' : 'light')
}, { immediate: true })

export function useTheme() {
  function toggleTheme() {
    isDark.value = !isDark.value
  }
  return { isDark, toggleTheme }
}
