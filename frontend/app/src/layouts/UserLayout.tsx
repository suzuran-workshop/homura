import React from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { NavItem } from '../components/NavItem'
import { AppsRegular, PeopleRegular } from '@fluentui/react-icons'
import { useAuthStore } from '../stores/auth'
import { Text } from '@fluentui/react-components'
import { makeStyles, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  section: {
    marginTop: tokens.spacingVerticalL,
    marginBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalM,
  },
})

export const UserLayout: React.FC = () => {
  const styles = useStyles()
  const { t } = useTranslation()
  const userRole = useAuthStore((s) => s.user?.role)
  const isProvider = userRole === 'provider'

  return (
    <AppShell
      titleKey="layout.user"
      nav={
        <>
          <NavItem to="/user/apps" icon={<AppsRegular />} label={t('nav.apps')} />
          {isProvider && (
            <>
              <div className={styles.section}>
                <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3 }}>
                  {t('nav.admin')}
                </Text>
              </div>
              <NavItem to="/provider/dashboard" icon={<PeopleRegular />} label={t('nav.dashboard')} />
            </>
          )}
        </>
      }
    />
  )
}
