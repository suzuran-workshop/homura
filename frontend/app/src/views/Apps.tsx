import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  AddRegular,
  ArrowSyncRegular,
  StoreMicrosoftRegular,
} from '@fluentui/react-icons'
import { useApplicationStore } from '../stores/application'
import { useAuthStore } from '../stores/auth'
import { importApp } from '../api/application'
import { AppCard } from '../components/AppCard'

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
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  headerActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
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

export const Apps: React.FC = () => {
  const styles = useStyles()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { apps, loading, error, fetchApps } = useApplicationStore()
  const { user } = useAuthStore()
  const isProvider = user?.role === 'provider'

  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    fetchApps()
  }, [fetchApps])

  const handleRefresh = () => {
    fetchApps()
  }

  const handleImport = async () => {
    if (!importFile) return

    setImporting(true)
    setImportError('')

    try {
      await importApp(importFile)
      setImportDialogOpen(false)
      setImportFile(null)
      fetchApps()
    } catch (err: any) {
      setImportError(err.response?.data?.error || '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const handleAppClick = (appId: number) => {
    const app = apps.find(a => a.id === appId)
    if (!app) return

    if (app.status === 'running') {
      window.open(`/apps/${appId}/`, '_blank')
    }
  }

  const handleDetails = (appId: number) => {
    navigate(`/provider/apps/${appId}`)
  }

  const handleData = (appId: number) => {
    navigate(`/user/data/${appId}`)
  }

  const runningApps = apps.filter(app => app.status === 'running')
  const stoppedApps = apps.filter(app => app.status !== 'running')

  if (loading && apps.length === 0) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" />
        <Text>{t('common.loading')}</Text>
      </div>
    )
  }

  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>
          <MessageBarTitle>{t('common.error')}</MessageBarTitle>
          {error}
        </MessageBarBody>
      </MessageBar>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <StoreMicrosoftRegular style={{ fontSize: 24 }} />
          <Text size={600} weight="semibold">
            {t('apps.title')}
          </Text>
        </div>
        <div className={styles.headerActions}>
          {isProvider && (
            <Dialog open={importDialogOpen} onOpenChange={(_, data) => setImportDialogOpen(data.open)}>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="primary" icon={<AddRegular />}>
                  {t('apps.import')}
                </Button>
              </DialogTrigger>
              <DialogSurface>
                <DialogBody>
                  <DialogTitle>{t('apps.importTitle')}</DialogTitle>
                  <DialogContent>
                    {importError && (
                      <MessageBar intent="error" style={{ marginBottom: tokens.spacingVerticalM }}>
                        <MessageBarBody>
                          <MessageBarTitle>{t('common.error')}</MessageBarTitle>
                          {importError}
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    <Field label={t('apps.selectFile')}>
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                        style={{ marginTop: tokens.spacingVerticalXS }}
                      />
                    </Field>
                    {importFile && (
                      <Text size={200} style={{ marginTop: tokens.spacingVerticalS }}>
                        {importFile.name}
                      </Text>
                    )}
                  </DialogContent>
                  <DialogActions>
                    <DialogTrigger disableButtonEnhancement>
                      <Button appearance="secondary" disabled={importing}>
                        {t('common.cancel')}
                      </Button>
                    </DialogTrigger>
                    <Button
                      appearance="primary"
                      onClick={handleImport}
                      disabled={!importFile || importing}
                    >
                      {importing ? t('apps.importing') : t('apps.import')}
                    </Button>
                  </DialogActions>
                </DialogBody>
              </DialogSurface>
            </Dialog>
          )}
          <Button icon={<ArrowSyncRegular />} onClick={handleRefresh}>
            {t('apps.refresh')}
          </Button>
        </div>
      </div>

      {apps.length === 0 ? (
        <Card className={styles.emptyState}>
          <StoreMicrosoftRegular style={{ fontSize: 48, color: tokens.colorNeutralForeground3 }} />
          <Text size={400}>{t('apps.noApps')}</Text>
          <Text size={200}>{t('apps.noAppsHint')}</Text>
        </Card>
      ) : (
        <>
          {runningApps.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: tokens.colorPaletteGreenForeground1,
                }} />
                <Text size={400} weight="semibold">
                  {t('apps.running')} ({runningApps.length})
                </Text>
              </div>
              <div className={styles.grid}>
                {runningApps.map(app => (
                  <AppCard
                    key={app.id}
                    app={app}
                    onClick={() => handleAppClick(app.id)}
                    onDetails={isProvider ? () => handleDetails(app.id) : undefined}
                    onData={() => handleData(app.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {stoppedApps.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: tokens.colorNeutralForeground3,
                }} />
                <Text size={400} weight="semibold">
                  {t('apps.stopped')} ({stoppedApps.length})
                </Text>
              </div>
              <div className={styles.grid}>
                {stoppedApps.map(app => (
                  <AppCard
                    key={app.id}
                    app={app}
                    disabled
                    onDetails={isProvider ? () => handleDetails(app.id) : undefined}
                    onData={() => handleData(app.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
