import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Card,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import type { Application } from '../api/application'

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
    cursor: 'pointer',
    transition: `box-shadow ${tokens.durationFast} ${tokens.curveEasyEase}`,
    '&:hover': {
      boxShadow: tokens.shadow8,
    },
  },
  cardDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
    '&:hover': {
      boxShadow: tokens.shadow2,
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flex: 1,
    minWidth: 0,
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusRunning: {
    backgroundColor: tokens.colorPaletteGreenForeground1,
  },
  statusStopped: {
    backgroundColor: tokens.colorNeutralForeground3,
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
  },
})

interface AppCardProps {
  app: Application
  disabled?: boolean
  onClick?: () => void
  onDetails?: () => void
  onData?: () => void
}

export const AppCard: React.FC<AppCardProps> = ({
  app,
  disabled = false,
  onClick,
  onDetails,
  onData,
}) => {
  const styles = useStyles()
  const { t } = useTranslation()

  const statusClass = app.status === 'running' ? styles.statusRunning : styles.statusStopped

  const handleCardClick = () => {
    if (!disabled && onClick) {
      onClick()
    }
  }

  return (
    <Card
      className={`${styles.card} ${disabled ? styles.cardDisabled : ''}`}
      onClick={handleCardClick}
    >
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={`${styles.statusDot} ${statusClass}`} />
          <Text size={400} weight="semibold" truncate>
            {app.name}
          </Text>
        </div>
        <Text size={200}>{app.version}</Text>
      </div>

      <div className={styles.info}>
        <div className={styles.infoRow}>
          <span>Runtime: {app.runtime}</span>
        </div>
        <div className={styles.infoRow}>
          <span>CPU: {app.cpuQuota} | Memory: {app.memoryQuota}MB</span>
        </div>
      </div>

      <div className={styles.actions}>
        {disabled ? (
          <Button size="small" disabled>
            {t('apps.notRunning')}
          </Button>
        ) : (
          <Button size="small" appearance="primary" onClick={(e) => {
            e.stopPropagation()
            onClick?.()
          }}>
            {t('apps.enter')}
          </Button>
        )}
        {onDetails && (
          <Button size="small" onClick={(e) => {
            e.stopPropagation()
            onDetails()
          }}>
            {t('apps.details')}
          </Button>
        )}
        {onData && (
          <Button size="small" onClick={(e) => {
            e.stopPropagation()
            onData()
          }}>
            {t('apps.data')}
          </Button>
        )}
      </div>
    </Card>
  )
}
