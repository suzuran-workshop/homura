import React from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { useThemeStore } from './stores/theme'
import { useAuthStore } from './stores/auth'
import { ToastProvider } from './components/ToastMessage'
import { SkipLink } from './components/SkipLink'
import './i18n'
import './index.css'

// Initialize auth state from localStorage
useAuthStore.getState().initFromStorage()

function App() {
  const isDark = useThemeStore((s) => s.isDark)

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme}>
      <SkipLink />
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </FluentProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
