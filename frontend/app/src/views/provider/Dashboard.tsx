import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Card,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
  Select,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { ArrowSyncRegular } from '@fluentui/react-icons'
import { getSystemMetrics, getDatabaseMetrics, getSystemLogs } from '../../api/system'
import type { SystemMetrics, DatabaseMetrics, LogEntry } from '../../api/system'

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  metricCard: {
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  metricHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricValue: {
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalS,
  },
  infoCard: {
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacingVerticalS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  logCard: {
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  logHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  logFilters: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  logContainer: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalM,
    maxHeight: '400px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
  },
  logEntry: {
    padding: `${tokens.spacingVerticalXS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  logTimestamp: {
    color: tokens.colorNeutralForeground3,
    marginRight: tokens.spacingHorizontalS,
  },
  logLevel: {
    display: 'inline-block',
    padding: `0 ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusSmall,
    marginRight: tokens.spacingHorizontalS,
    fontWeight: tokens.fontWeightSemibold,
    minWidth: '60px',
    textAlign: 'center',
  },
  logLevelInfo: {
    backgroundColor: tokens.colorPaletteBlueBackground2,
    color: tokens.colorPaletteBlueForeground2,
  },
  logLevelWarning: {
    backgroundColor: tokens.colorPaletteYellowBackground2,
    color: tokens.colorPaletteYellowForeground2,
  },
  logLevelError: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground2,
  },
  logLevelDebug: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  logMessage: {
    color: tokens.colorNeutralForeground1,
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
  },
})

export const Dashboard: React.FC = () => {
  const styles = useStyles()
  const { t } = useTranslation()
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null)
  const [databaseMetrics, setDatabaseMetrics] = useState<DatabaseMetrics | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [logLevel, setLogLevel] = useState('all')
  const [logLimit, setLogLimit] = useState(100)

  useEffect(() => {
    loadMetrics()
    loadLogs()

    const metricsInterval = setInterval(loadMetrics, 5000)
    const logsInterval = setInterval(loadLogs, 3000)

    return () => {
      clearInterval(metricsInterval)
      clearInterval(logsInterval)
    }
  }, [])

  const loadMetrics = async () => {
    try {
      const [sys, db] = await Promise.all([
        getSystemMetrics(),
        getDatabaseMetrics(),
      ])
      setSystemMetrics(sys)
      setDatabaseMetrics(db)
      setLoading(false)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const loadLogs = async () => {
    try {
      const data = await getSystemLogs(logLimit)
      setLogs(data)
    } catch (err: any) {
      console.error('Failed to load logs:', err)
    }
  }

  const filteredLogs = logs.filter(log => {
    if (logLevel === 'all') return true
    const levels = ['debug', 'info', 'warning', 'error']
    const currentIndex = levels.indexOf(log.level.toLowerCase())
    const filterIndex = levels.indexOf(logLevel.toLowerCase())
    return currentIndex >= filterIndex
  })

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  const formatDuration = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const parts = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)
    return parts.join(' ') || '0m'
  }

  const getLogLevelClass = (level: string) => {
    switch (level.toLowerCase()) {
      case 'info':
        return styles.logLevelInfo
      case 'warning':
        return styles.logLevelWarning
      case 'error':
        return styles.logLevelError
      case 'debug':
        return styles.logLevelDebug
      default:
        return styles.logLevelDebug
    }
  }

  if (loading && !systemMetrics) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" />
        <Text>{t('common.loading')}</Text>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Text size={600} weight="semibold">
          {t('dashboard.title')}
        </Text>
        <Button icon={<ArrowSyncRegular />} appearance="subtle" onClick={loadMetrics}>
          {t('common.refresh')}
        </Button>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>{t('common.error')}</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      {systemMetrics && (
        <>
          <div className={styles.metricsGrid}>
            <Card className={styles.metricCard}>
              <div className={styles.metricHeader}>
                <Text size={400} weight="semibold">
                  {t('dashboard.memory')}
                </Text>
                <Text size={300}>
                  {((systemMetrics.memoryUsage / systemMetrics.memoryTotal) * 100).toFixed(1)}%
                </Text>
              </div>
              <ProgressBar
                value={(systemMetrics.memoryUsage / systemMetrics.memoryTotal) * 100}
                thickness="large"
              />
              <div className={styles.metricValue}>
                <Text size={300}>
                  {formatBytes(systemMetrics.memoryUsage)} / {formatBytes(systemMetrics.memoryTotal)}
                </Text>
              </div>
            </Card>

            <Card className={styles.metricCard}>
              <div className={styles.metricHeader}>
                <Text size={400} weight="semibold">
                  {t('dashboard.disk')}
                </Text>
                <Text size={300}>
                  {((systemMetrics.diskUsage / systemMetrics.diskTotal) * 100).toFixed(1)}%
                </Text>
              </div>
              <ProgressBar
                value={(systemMetrics.diskUsage / systemMetrics.diskTotal) * 100}
                thickness="large"
              />
              <div className={styles.metricValue}>
                <Text size={300}>
                  {formatBytes(systemMetrics.diskUsage)} / {formatBytes(systemMetrics.diskTotal)}
                </Text>
              </div>
            </Card>

            <Card className={styles.metricCard}>
              <div className={styles.metricHeader}>
                <Text size={400} weight="semibold">
                  {t('dashboard.dbConnections')}
                </Text>
                <Text size={300}>
                  {databaseMetrics ? `${databaseMetrics.activeConnections} / ${databaseMetrics.maxConnections}` : '-'}
                </Text>
              </div>
              {databaseMetrics && (
                <ProgressBar
                  value={(databaseMetrics.activeConnections / databaseMetrics.maxConnections) * 100}
                  thickness="large"
                />
              )}
              <div className={styles.metricValue}>
                <Text size={300}>
                  {databaseMetrics ? `${t('dashboard.activeConnections')}: ${databaseMetrics.activeConnections}` : '-'}
                </Text>
              </div>
            </Card>
          </div>

          <div className={styles.infoGrid}>
            <Card className={styles.infoCard}>
              <Text size={400} weight="semibold">
                {t('dashboard.systemInfo')}
              </Text>
              <div className={styles.infoRow}>
                <Text size={300}>{t('dashboard.cpuCores')}</Text>
                <Text size={300} weight="semibold">{systemMetrics.cpuCores}</Text>
              </div>
              <div className={styles.infoRow}>
                <Text size={300}>{t('dashboard.goroutines')}</Text>
                <Text size={300} weight="semibold">{systemMetrics.goroutines}</Text>
              </div>
              <div className={styles.infoRow}>
                <Text size={300}>{t('dashboard.uptime')}</Text>
                <Text size={300} weight="semibold">{formatDuration(systemMetrics.uptime)}</Text>
              </div>
            </Card>

            {databaseMetrics && (
              <Card className={styles.infoCard}>
                <Text size={400} weight="semibold">
                  {t('dashboard.dbInfo')}
                </Text>
                <div className={styles.infoRow}>
                  <Text size={300}>{t('dashboard.maxConnections')}</Text>
                  <Text size={300} weight="semibold">{databaseMetrics.maxConnections}</Text>
                </div>
                <div className={styles.infoRow}>
                  <Text size={300}>{t('dashboard.activeConnections')}</Text>
                  <Text size={300} weight="semibold">{databaseMetrics.activeConnections}</Text>
                </div>
                <div className={styles.infoRow}>
                  <Text size={300}>{t('dashboard.waitCount')}</Text>
                  <Text size={300} weight="semibold">{databaseMetrics.waitCount}</Text>
                </div>
              </Card>
            )}
          </div>
        </>
      )}

      <Card className={styles.logCard}>
        <div className={styles.logHeader}>
          <Text size={400} weight="semibold">
            {t('dashboard.systemLogs')}
          </Text>
          <div className={styles.logFilters}>
            <Select
              value={logLevel}
              onChange={(_, data) => setLogLevel(data.value)}
              style={{ minWidth: 120 }}
            >
              <option value="all">{t('dashboard.allLevels')}</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </Select>
            <Select
              value={String(logLimit)}
              onChange={(_, data) => setLogLimit(parseInt(data.value))}
              style={{ minWidth: 100 }}
            >
              <option value="50">{t('dashboard.lines', { count: 50 })}</option>
              <option value="100">{t('dashboard.lines', { count: 100 })}</option>
              <option value="200">{t('dashboard.lines', { count: 200 })}</option>
              <option value="500">{t('dashboard.lines', { count: 500 })}</option>
            </Select>
            <Button icon={<ArrowSyncRegular />} appearance="subtle" onClick={loadLogs} />
          </div>
        </div>
        <div className={styles.logContainer}>
          {filteredLogs.length === 0 ? (
            <Text size={300}>{t('dashboard.noLogs')}</Text>
          ) : (
            filteredLogs.map((log, idx) => (
              <div key={idx} className={styles.logEntry}>
                <span className={styles.logTimestamp}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`${styles.logLevel} ${getLogLevelClass(log.level)}`}>
                  {log.level.toUpperCase()}
                </span>
                <span className={styles.logMessage}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
