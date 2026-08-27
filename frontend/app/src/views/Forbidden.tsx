import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, makeStyles, tokens, Text } from '@fluentui/react-components'
import { useLanguageStore } from '../stores/language'

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: tokens.spacingHorizontalXXL,
    position: 'relative',
  },
  languageSwitcher: {
    position: 'absolute',
    top: tokens.spacingVerticalXXL,
    right: tokens.spacingHorizontalXXL,
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  icon: {
    width: '96px',
    height: '96px',
    color: tokens.colorPaletteRedForeground1,
    marginBottom: tokens.spacingVerticalXL,
  },
  title: {
    marginBottom: tokens.spacingVerticalM,
  },
  message: {
    marginBottom: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground2,
  },
})

export const Forbidden: React.FC = () => {
  const styles = useStyles()
  const navigate = useNavigate()
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
      <div style={{
        fontSize: 96,
        marginBottom: 24,
        color: tokens.colorPaletteRedForeground1
      }}>
        🔒
      </div>
      <Text size={600} weight="semibold" className={styles.title}>
        {t('error.forbidden.title')}
      </Text>
      <Text size={400} className={styles.message}>
        {t('error.forbidden.message')}
      </Text>
      <Button appearance="primary" size="large" onClick={() => navigate('/')}>
        {t('error.returnHome')}
      </Button>
    </div>
  )
}
