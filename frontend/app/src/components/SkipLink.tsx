import React from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import { useTranslation } from 'react-i18next'

const useStyles = makeStyles({
  skipLink: {
    position: 'absolute',
    top: '-40px',
    left: '0',
    background: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    padding: '8px 16px',
    textDecoration: 'none',
    borderRadius: tokens.borderRadiusMedium,
    zIndex: 10000,
    transition: 'top 0.2s',
    '&:focus': {
      top: '8px',
    },
  },
})

export const SkipLink: React.FC = () => {
  const styles = useStyles()
  const { t } = useTranslation()

  return (
    <a href="#main-content" className={styles.skipLink}>
      {t('accessibility.skipToMain', '跳转到主内容')}
    </a>
  )
}
