import React, { useEffect, useState } from 'react'
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
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Badge,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  AddRegular,
  DeleteRegular,
  ArrowSyncRegular,
  ShareRegular,
  PersonAddRegular,
} from '@fluentui/react-icons'
import { listAllApps, type Application } from '../../api/application'
import { listOrgs, type Org } from '../../api/org'
import { listMembers, type Member } from '../../api/user'
import {
  listDistributions,
  distributeApp,
  undistributeApp,
  setAppAdmin,
  removeAppAdmin,
  type DistributionView,
} from '../../api/distribution'

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
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flex: 1,
  },
  appSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  distCard: {
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  distHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  adminChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
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

export const AppDistribution: React.FC = () => {
  const styles = useStyles()
  const { t } = useTranslation()

  const [apps, setApps] = useState<Application[]>([])
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null)
  const [distributions, setDistributions] = useState<DistributionView[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [distributeDialogOpen, setDistributeDialogOpen] = useState(false)
  const [distributeOrgId, setDistributeOrgId] = useState<number | null>(null)

  const [adminDialogOpen, setAdminDialogOpen] = useState(false)
  const [adminOrgId, setAdminOrgId] = useState<number | null>(null)
  const [adminOrgMembers, setAdminOrgMembers] = useState<Member[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

  useEffect(() => {
    loadApps()
    loadOrgs()
  }, [])

  useEffect(() => {
    if (selectedAppId) {
      loadDistributions()
    }
  }, [selectedAppId])

  const loadApps = async () => {
    try {
      const data = await listAllApps()
      setApps(data)
      if (data.length > 0 && !selectedAppId) {
        setSelectedAppId(data[0].id)
      }
      setLoading(false)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
      setLoading(false)
    }
  }

  const loadOrgs = async () => {
    try {
      const data = await listOrgs()
      setOrgs(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadDistributions = async () => {
    if (!selectedAppId) return
    try {
      const data = await listDistributions(selectedAppId)
      setDistributions(data.distributions || [])
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const handleDistribute = async () => {
    if (!selectedAppId || !distributeOrgId) return
    try {
      await distributeApp(selectedAppId, distributeOrgId)
      setDistributeDialogOpen(false)
      loadDistributions()
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const handleUndistribute = async (orgId: number) => {
    if (!selectedAppId) return
    if (!confirm(t('dist.confirmUndistribute'))) return
    try {
      await undistributeApp(selectedAppId, orgId)
      loadDistributions()
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const handleOpenAdminDialog = async (orgId: number) => {
    setAdminOrgId(orgId)
    setSelectedUserId(null)
    try {
      const members = await listMembers(orgId)
      setAdminOrgMembers(members)
      setAdminDialogOpen(true)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const handleSetAdmin = async () => {
    if (!selectedAppId || !adminOrgId || !selectedUserId) return
    try {
      await setAppAdmin(selectedAppId, adminOrgId, selectedUserId)
      setAdminDialogOpen(false)
      loadDistributions()
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const handleRemoveAdmin = async (orgId: number, userId: number) => {
    if (!selectedAppId) return
    try {
      await removeAppAdmin(selectedAppId, orgId, userId)
      loadDistributions()
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const distributedOrgIds = new Set(distributions.map(d => d.orgId))
  const undistributedOrgs = orgs.filter(o => !distributedOrgIds.has(o.id))

  if (loading) {
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
        <div className={styles.headerLeft}>
          <ShareRegular style={{ fontSize: 24 }} />
          <div>
            <Text size={600} weight="semibold">{t('dist.title')}</Text>
            <br />
            <Text size={200}>{t('dist.description')}</Text>
          </div>
        </div>
        <Button icon={<ArrowSyncRegular />} onClick={() => { loadApps(); loadDistributions() }}>
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

      {apps.length === 0 ? (
        <div className={styles.emptyState}>
          <ShareRegular style={{ fontSize: 48, color: tokens.colorNeutralForeground3 }} />
          <Text size={400}>{t('dist.noApps')}</Text>
        </div>
      ) : (
        <>
          <div className={styles.appSelector}>
            <Field label={t('dist.selectApp')}>
              <select
                value={selectedAppId ?? ''}
                onChange={(e) => setSelectedAppId(parseInt(e.target.value))}
                style={{
                  minWidth: 240,
                  padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
                  borderRadius: tokens.borderRadiusMedium,
                  border: `1px solid ${tokens.colorNeutralStroke1}`,
                  backgroundColor: tokens.colorNeutralBackground1,
                }}
              >
                {apps.map(app => (
                  <option key={app.id} value={app.id}>{app.name} (v{app.version})</option>
                ))}
              </select>
            </Field>
          </div>

          <Card className={styles.distCard}>
            <div className={styles.distHeader}>
              <Text size={400} weight="semibold">{t('dist.distributed')} ({distributions.length})</Text>
              <Button
                appearance="primary"
                icon={<AddRegular />}
                onClick={() => {
                  setDistributeOrgId(undistributedOrgs.length > 0 ? undistributedOrgs[0].id : null)
                  setDistributeDialogOpen(true)
                }}
                disabled={undistributedOrgs.length === 0}
              >
                {t('dist.distribute')}
              </Button>
            </div>

            {distributions.length === 0 ? (
              <Text size={300}>{t('dist.notDistributed')}</Text>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>{t('dist.orgName')}</TableHeaderCell>
                    <TableHeaderCell>{t('dist.admins')}</TableHeaderCell>
                    <TableHeaderCell style={{ width: 250 }}>{t('common.actions')}</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {distributions.map(dist => (
                    <TableRow key={dist.orgId}>
                      <TableCell>
                        <Text weight="semibold">{dist.orgName}</Text>
                      </TableCell>
                      <TableCell>
                        <div className={styles.adminChips}>
                          {dist.admins.length === 0 ? (
                            <Text size={200}>{t('dist.noAdmins')}</Text>
                          ) : (
                            dist.admins.map(admin => (
                              <Badge
                                key={admin.userId}
                                appearance="tint"
                                size="medium"
                              >
                                {admin.name}
                                <Button
                                  size="small"
                                  appearance="transparent"
                                  icon={<DeleteRegular />}
                                  onClick={() => handleRemoveAdmin(dist.orgId, admin.userId)}
                                  style={{ minWidth: 'auto', padding: '0 2px', marginLeft: tokens.spacingHorizontalXS }}
                                />
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
                          <Button
                            size="small"
                            icon={<PersonAddRegular />}
                            onClick={() => handleOpenAdminDialog(dist.orgId)}
                          >
                            {t('dist.setAdmin')}
                          </Button>
                          <Button
                            size="small"
                            icon={<DeleteRegular />}
                            onClick={() => handleUndistribute(dist.orgId)}
                          >
                            {t('dist.undistribute')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {/* Distribute Dialog */}
      <Dialog open={distributeDialogOpen} onOpenChange={(_, data) => setDistributeDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('dist.distribute')}</DialogTitle>
            <DialogContent>
              <Field label={t('dist.selectOrg')}>
                <select
                  value={distributeOrgId ?? ''}
                  onChange={(e) => setDistributeOrgId(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
                    borderRadius: tokens.borderRadiusMedium,
                    border: `1px solid ${tokens.colorNeutralStroke1}`,
                    backgroundColor: tokens.colorNeutralBackground1,
                  }}
                >
                  {undistributedOrgs.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </Field>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.cancel')}</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleDistribute} disabled={!distributeOrgId}>
                {t('dist.distribute')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Set Admin Dialog */}
      <Dialog open={adminDialogOpen} onOpenChange={(_, data) => setAdminDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('dist.addAdminTitle')}</DialogTitle>
            <DialogContent>
              <Field label={t('dist.selectUser')}>
                <select
                  value={selectedUserId ?? ''}
                  onChange={(e) => setSelectedUserId(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
                    borderRadius: tokens.borderRadiusMedium,
                    border: `1px solid ${tokens.colorNeutralStroke1}`,
                    backgroundColor: tokens.colorNeutralBackground1,
                  }}
                >
                  <option value="">--</option>
                  {adminOrgMembers.map(m => (
                    <option key={m.userId} value={m.userId}>{m.name} ({m.username})</option>
                  ))}
                </select>
              </Field>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.cancel')}</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleSetAdmin} disabled={!selectedUserId}>
                {t('dist.setAdmin')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
