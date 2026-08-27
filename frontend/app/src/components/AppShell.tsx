import React from 'react'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  makeStyles,
  tokens,
  Button,
  Text,
} from '@fluentui/react-components'
import {
  WeatherMoon20Regular,
  WeatherSunny20Regular,
  SignOut20Regular,
} from '@fluentui/react-icons'
import { useThemeStore } from '../stores/theme'
import { useAuthStore } from '../stores/auth'
import { useLanguageStore } from '../stores/language'
import { ToastMessage } from './ToastMessage'

const useStyles = makeStyles({
  container: {
    display: 'grid',
    gridTemplateRows: '48px 1fr',
    gridTemplateColumns: '240px 1fr',
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  header: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `0 ${tokens.spacingHorizontalXXL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  sidebar: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalM,
    overflowY: 'auto',
  },
  main: {
    padding: tokens.spacingHorizontalXXL,
    overflowY: 'auto',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
})

interface AppShellProps {
  titleKey?: string
  nav: React.ReactNode
}

export const AppShell: React.FC<AppShellProps> = ({ titleKey = 'app.name', nav }) => {
  const styles = useStyles()
  const { t } = useTranslation()
  const { isDark, toggle } = useThemeStore()
  const { user, logout } = useAuthStore()
  const { language, setLanguage } = useLanguageStore()

  return (
    <>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <Text size={500} weight="semibold">
              {t(titleKey)}
            </Text>
          </div>
          <div className={styles.headerRight}>
            <Button
              size="small"
              appearance={language === 'zh' ? 'subtle' : 'transparent'}
              onClick={() => setLanguage('zh')}
            >
              中文
            </Button>
            <Button
              size="small"
              appearance={language === 'en' ? 'subtle' : 'transparent'}
              onClick={() => setLanguage('en')}
            >
              EN
            </Button>
            <Button
              icon={isDark ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />}
              appearance="subtle"
              onClick={toggle}
              aria-label={t('layout.theme')}
            />
            <Text size={300}>{user?.name}</Text>
            <Button
              icon={<SignOut20Regular />}
              appearance="subtle"
              onClick={logout}
              aria-label={t('layout.logout')}
            />
          </div>
        </header>
        <aside className={styles.sidebar}>{nav}</aside>
        <main id="main-content" className={styles.main}>
          <div className={styles.content}>
            <Outlet />
          </div>
        </main>
      </div>
      <ToastMessage />
    </>
  )
}
