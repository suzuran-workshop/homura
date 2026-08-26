import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fluentui/web-components'
import '@mdi/font/css/materialdesignicons.css'
import './styles/fluent-theme.css'
import './styles/utilities.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

// Restore auth state from localStorage before mounting (so route guards see it).
import { useAuthStore } from './stores/auth'
useAuthStore(pinia).initFromStorage()

app.use(router)
app.mount('#app')
