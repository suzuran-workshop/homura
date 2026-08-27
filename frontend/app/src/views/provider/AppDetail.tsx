import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Card,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Badge,
  Divider,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  ChevronLeftRegular,
  ArrowSyncRegular,
  PlayRegular,
  StopRegular,
  ArrowRotateClockwiseRegular,
  RocketRegular,
  DocumentBulletListRegular,
} from '@fluentui/react-icons'
import {
  getApp,
  deployApp,
  startApp,
  stopApp,
  restartApp,
  getAppLogs,
  getDeployments,
  type Application,
  type Deployment,
} from '../../api/application'

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  headerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flex: 1,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
    },
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
    padding: `${tokens.spacingVerticalXS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    '&:last-child': { borderBottom: 'none' },
  },
  lifecycleCard: {
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  lifecycleButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
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
  },
  logContainer: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalM,
    maxHeight: '400px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  deployCard: {
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
  },
})

const statusColorMap: Record<string, 'success' | 'danger' | 'warning' | 'informative' | undefined> = {
  running: 'success',
  stopped: undefined,
  error: 'danger',
  deploying: 'warning',
  building: 'warning',
  created: 'informative',
}

export const AppDetail: React.FC = () => {
  const styles = useStyles()
  const navigate = useNavigate()
  const { appId } = useParams<{ appId: string }>()
  const { t } = useTranslation()

  const [app, setApp] = useState<Application | null>(null)
  const [logs, setLogs] = useState('')
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState('')

  useEffect(() => {
    loadData()
    const interval = setInterval(loadLogs, 5000)
    return () => clearInterval(interval)
  }, [appId])

  const loadData = async () => {
    try {
      const data = await getApp(parseInt(appId!))
      setApp(data)
      setLoading(false)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
      setLoading(false)
    }
  }

  const loadLogs = async () => {
    try {
      const data = await getAppLogs(parseInt(appId!), 200)
      setLogs(typeof data === 'string' ? data : data.logs || JSON.stringify(data))
    } catch (err) {
      console.error(err)
    }
  }

  const loadDeployments = async () => {
    try {
      const data = await getDeployments(parseInt(appId!))
      setDeployments(data)
    } catch (err) {
      console.error(err)
    }
  }

  const handleAction = async (action: string) => {
    setActionLoading(action)
    setError('')
    try {
      switch (action) {
        case 'deploy': await deployApp(parseInt(appId!)); break
        case 'start': await startApp(parseInt(appId!)); break
        case 'stop': await stopApp(parseInt(appId!)); break
        case 'restart': await restartApp(parseInt(appId!)); break
      }
      await loadData()
      await loadLogs()
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setActionLoading('')
    }
  }

  useEffect(() => {
    loadDeployments()
  }, [appId])

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" />
        <Text>{t('common.loading')}</Text>
      </div>
    )
  }

  if (!app) {
    return <Text>{t('common.error')}</Text>
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Button icon={<ChevronLeftRegular />} appearance="subtle" onClick={() => navigate('/provider/apps')} />
        <div className={styles.headerInfo}>
          <Text size={600} weight="semibold">{app.name}</Text>
          <Badge
            appearance="filled"
            color={statusColorMap[app.status] || undefined}
            size="medium"
          >
            {t(`status.${app.status}`)}
          </Badge>
        </div>
        <Button icon={<ArrowSyncRegular />} onClick={loadData}>{t('common.refresh')}</Button>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>{t('common.error')}</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.grid}>
        <Card className={styles.infoCard}>
          <Text size={400} weight="semibold">{t('apps.appInfo')}</Text>
          <div className={styles.infoRow}>
            <Text size={300}>{t('apps.version')}</Text>
            <Text size={300} weight="semibold">{app.version}</Text>
          </div>
          <div className={styles.infoRow}>
            <Text size={300}>{t('apps.runtime')}</Text>
            <Text size={300} weight="semibold">{app.runtime}</Text>
          </div>
          <div className={styles.infoRow}>
            <Text size={300}>{t('apps.entrypoint')}</Text>
            <Text size={300} weight="semibold">{app.entrypoint}</Text>
          </div>
          <div className={styles.infoRow}>
            <Text size={300}>{t('apps.port')}</Text>
            <Text size={300} weight="semibold">{app.port}</Text>
          </div>
          <div className={styles.infoRow}>
            <Text size={300}>{t('apps.cpuQuota')}</Text>
            <Text size={300} weight="semibold">{app.cpuQuota}</Text>
          </div>
          <div className={styles.infoRow}>
            <Text size={300}>{t('apps.memoryQuota')}</Text>
            <Text size={300} weight="semibold">{app.memoryQuota} MB</Text>
          </div>
          <div className={styles.infoRow}>
            <Text size={300}>{t('apps.dbConnQuota')}</Text>
            <Text size={300} weight="semibold">{app.dbConnQuota}</Text>
          </div>
          <div className={styles.infoRow}>
            <Text size={300}>{t('apps.sourceKey')}</Text>
            <Text size={300} weight="semibold">{app.sourceKey || '-'}</Text>
          </div>
          {app.mcpScopes.length > 0 && (
            <div className={styles.infoRow}>
              <Text size={300}>{t('apps.mcpScopes')}</Text>
              <div style={{ display: 'flex', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' }}>
                {app.mcpScopes.map(scope => (
                  <Badge key={scope} appearance="tint" size="small">{scope}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className={styles.lifecycleCard}>
          <Text size={400} weight="semibold">{t('apps.lifecycle')}</Text>
          <div className={styles.lifecycleButtons}>
            <Button
              appearance="primary"
              icon={<RocketRegular />}
              onClick={() => handleAction('deploy')}
              disabled={!!actionLoading}
            >
              {actionLoading === 'deploy' ? <Spinner size="tiny" /> : t('apps.deploy')}
            </Button>
            <Button
              icon={<PlayRegular />}
              onClick={() => handleAction('start')}
              disabled={app.status === 'running' || !!actionLoading}
            >
              {actionLoading === 'start' ? <Spinner size="tiny" /> : t('apps.start')}
            </Button>
            <Button
              icon={<StopRegular />}
              onClick={() => handleAction('stop')}
              disabled={app.status !== 'running' || !!actionLoading}
            >
              {actionLoading === 'stop' ? <Spinner size="tiny" /> : t('apps.stop')}
            </Button>
            <Button
              icon={<ArrowRotateClockwiseRegular />}
              onClick={() => handleAction('restart')}
              disabled={app.status !== 'running' || !!actionLoading}
            >
              {actionLoading === 'restart' ? <Spinner size="tiny" /> : t('apps.restart')}
            </Button>
          </div>
          <Divider />
          <Text size={300}>
            Container: {app.containerId || t('common.none')}
          </Text>
        </Card>
      </div>

      <Card className={styles.logCard}>
        <div className={styles.logHeader}>
          <Text size={400} weight="semibold">
            <DocumentBulletListRegular style={{ marginRight: tokens.spacingHorizontalS }} />
            {t('apps.appLogs')}
          </Text>
          <Button icon={<ArrowSyncRegular />} appearance="subtle" onClick={loadLogs} />
        </div>
        <div className={styles.logContainer}>
          {logs || t('apps.noLogs')}
        </div>
      </Card>

      <Card className={styles.deployCard}>
        <Text size={400} weight="semibold">{t('apps.deployHistory')}</Text>
        {deployments.length === 0 ? (
          <Text size={300}>{t('apps.noDeployments')}</Text>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t('apps.deployId')}</TableHeaderCell>
                <TableHeaderCell>{t('apps.version')}</TableHeaderCell>
                <TableHeaderCell>{t('apps.imageTag')}</TableHeaderCell>
                <TableHeaderCell>{t('common.status', 'Status')}</TableHeaderCell>
                <TableHeaderCell>{t('apps.completedAt')}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map(dep => (
                <TableRow key={dep.id}>
                  <TableCell>{dep.id}</TableCell>
                  <TableCell>{dep.version}</TableCell>
                  <TableCell><Text size={200}>{dep.imageTag}</Text></TableCell>
                  <TableCell>
                    <Badge
                      appearance="filled"
                      color={statusColorMap[dep.status] || undefined}
                      size="small"
                    >
                      {dep.status}
                    </Badge>
                  </TableCell>
                  <TableCell><Text size={200}>{dep.completedAt ? new Date(dep.completedAt).toLocaleString() : '-'}</Text></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
