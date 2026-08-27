import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
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
  EditRegular,
  ArrowSyncRegular,
  PeopleRegular,
} from '@fluentui/react-icons'
import { listOrgs, createOrg, updateOrg, deleteOrg, type Org, type OrgRequest } from '../../api/org'
import { useAuthStore } from '../../stores/auth'

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
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
})

export const Organizations: React.FC = () => {
  const styles = useStyles()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Org | null>(null)
  const [formData, setFormData] = useState<OrgRequest>({ name: '', description: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadOrgs()
  }, [])

  const loadOrgs = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listOrgs()
      setOrgs(data)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingOrg(null)
    setFormData({ name: '', description: '' })
    setDialogOpen(true)
  }

  const handleEdit = (org: Org) => {
    setEditingOrg(org)
    setFormData({ name: org.name, description: org.description })
    setDialogOpen(true)
  }

  const handleDelete = async (org: Org) => {
    if (!confirm(t('orgs.confirmDelete'))) return
    try {
      await deleteOrg(org.id)
      loadOrgs()
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const handleSave = async () => {
    if (!formData.name.trim()) return
    setSaving(true)
    try {
      if (editingOrg) {
        await updateOrg(editingOrg.id, formData)
      } else {
        await createOrg(formData)
      }
      setDialogOpen(false)
      loadOrgs()
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setSaving(false)
    }
  }

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
          <PeopleRegular style={{ fontSize: 24 }} />
          <div>
            <Text size={600} weight="semibold">{t('orgs.title')}</Text>
            <br />
            <Text size={200}>{t('orgs.description')}</Text>
          </div>
        </div>
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
          <Button icon={<ArrowSyncRegular />} onClick={loadOrgs}>{t('common.refresh')}</Button>
          <Button appearance="primary" icon={<AddRegular />} onClick={handleCreate}>
            {t('orgs.create')}
          </Button>
        </div>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>{t('common.error')}</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      {orgs.length === 0 ? (
        <div className={styles.emptyState}>
          <PeopleRegular style={{ fontSize: 48, color: tokens.colorNeutralForeground3 }} />
          <Text size={400}>{t('orgs.noOrgs')}</Text>
          <Text size={200}>{t('orgs.noOrgsHint')}</Text>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell style={{ width: 60 }}>{t('orgs.id')}</TableHeaderCell>
              <TableHeaderCell>{t('orgs.name')}</TableHeaderCell>
              <TableHeaderCell>{t('orgs.descriptionLabel')}</TableHeaderCell>
              <TableHeaderCell style={{ width: 180 }}>{t('orgs.createdAt')}</TableHeaderCell>
              <TableHeaderCell style={{ width: 200 }}>{t('orgs.actions')}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map(org => (
              <TableRow key={org.id}>
                <TableCell>{org.id}</TableCell>
                <TableCell>
                  <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
                    <Text weight="semibold">{org.name}</Text>
                    {user?.orgId === org.id && (
                      <Badge appearance="filled" color="brand" size="small">
                        {t('orgs.currentOrg')}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell><Text size={200}>{org.description || '-'}</Text></TableCell>
                <TableCell><Text size={200}>{new Date(org.createdAt).toLocaleDateString()}</Text></TableCell>
                <TableCell>
                  <div className={styles.actions}>
                    <Button size="small" appearance="primary" onClick={() => navigate(`/provider/orgs/${org.id}`)}>
                      {t('orgs.manage')}
                    </Button>
                    <Button size="small" icon={<EditRegular />} onClick={() => handleEdit(org)} />
                    <Button size="small" icon={<DeleteRegular />} onClick={() => handleDelete(org)} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editingOrg ? t('orgs.editTitle') : t('orgs.createTitle')}</DialogTitle>
            <DialogContent>
              <Field label={t('orgs.name')} required>
                <Input
                  value={formData.name}
                  onChange={(_, data) => setFormData({ ...formData, name: data.value })}
                />
              </Field>
              <Field label={t('orgs.descriptionLabel')} style={{ marginTop: tokens.spacingVerticalM }}>
                <Input
                  value={formData.description}
                  onChange={(_, data) => setFormData({ ...formData, description: data.value })}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.cancel')}</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleSave} disabled={saving || !formData.name.trim()}>
                {t('common.save')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
