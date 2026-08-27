import React from 'react'
import { useTranslation } from 'react-i18next'
import { makeStyles, tokens, Spinner, Text } from '@fluentui/react-components'
import { useLanguageStore } from '../stores/language'
import { Button } from '@fluentui/react-components'

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: tokens.spacingVerticalXL,
    position: 'relative',
  },
  languageSwitcher: {
    position: 'absolute',
    top: tokens.spacingVerticalXXL,
    right: tokens.spacingHorizontalXXL,
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
})

export const Home: React.FC = () => {
  const styles = useStyles()
  const { t } = useTranslation()
  const { language, setLanguage } = useLanguageStore()

  return (
    <div className={styles.container}>
      <div className={styles.languageSwitcher}>
        <Button
          size="small"
          appearance={language === 'zh' ? 'primary' : 'subtle'}
          onClick={() => setLanguage('zh')}
        >
          中文
        </Button>
        <Button
          size="small"
          appearance={language === 'en' ? 'primary' : 'subtle'}
          onClick={() => setLanguage('en')}
        >
          EN
        </Button>
      </div>
      <Spinner size="large" />
      <Text size={400}>{t('home.redirecting')}</Text>
    </div>
  )
}
