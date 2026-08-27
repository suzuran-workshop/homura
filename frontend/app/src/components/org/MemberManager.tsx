import React, { useEffect, useState } from 'react'
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
  Switch,
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
  KeyRegular,
} from '@fluentui/react-icons'
import { listMembers, createMember, updateMember, removeMember, resetPassword, type Member, type MemberRequest } from '../../api/user'
import { listDepartments, type Department } from '../../api/department'

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: tokens.spacingVerticalXXL,
    gap: tokens.spacingVerticalM,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
})

interface MemberManagerProps {
  orgId: number
}

export const MemberManager: React.FC<MemberManagerProps> = ({ orgId }) => {
  const styles = useStyles()
  const { t } = useTranslation()

  const [members, setMembers] = useState<Member[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [formData, setFormData] = useState<MemberRequest>({
    name: '', username: '', email: '', phone: '', position: '',
    isAdmin: false, isDepartmentManager: false, departmentId: null,
  })
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetMember, setResetMember] = useState<Member | null>(null)
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    loadData()
  }, [orgId])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [memberData, deptData] = await Promise.all([
        listMembers(orgId),
        listDepartments(orgId),
      ])
      setMembers(memberData)
      setDepartments(deptData)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingMember(null)
    setFormData({
      name: '', username: '', email: '', phone: '', position: '',
      isAdmin: false, isDepartmentManager: false, departmentId: null,
    })
    setPassword('')
    setDialogOpen(true)
  }

  const handleEdit = (member: Member) => {
    setEditingMember(member)
    setFormData({
      name: member.name,
      username: member.username,
      email: member.email,
      phone: member.phone,
      position: member.position,
      isAdmin: member.isAdmin,
      isDepartmentManager: member.isDepartmentManager,
      departmentId: member.departmentId,
    })
    setPassword('')
    setDialogOpen(true)
  }

  const handleRemove = async (member: Member) => {
    if (!confirm(t('members.confirmRemove'))) return
    try {
      await removeMember(orgId, member.userId)
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.username.trim()) return
    setSaving(true)
    try {
      if (editingMember) {
        await updateMember(orgId, editingMember.userId, formData)
      } else {
        await createMember(orgId, { ...formData, password: password || undefined })
      }
      setDialogOpen(false)
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = (member: Member) => {
    setResetMember(member)
    setNewPassword('')
    setResetDialogOpen(true)
  }

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'
    let pwd = ''
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setNewPassword(pwd)
  }

  const handleSavePassword = async () => {
    if (!resetMember || !newPassword) return
    try {
      await resetPassword(orgId, resetMember.userId, newPassword)
      try {
        await navigator.clipboard.writeText(newPassword)
      } catch {}
      setResetDialogOpen(false)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const getDeptName = (deptId: number | null) => {
    if (!deptId) return t('members.noDepartment')
    return departments.find(d => d.id === deptId)?.name || '-'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
        <Spinner size="large" />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>{t('common.error')}</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.toolbar}>
        <Button appearance="primary" icon={<AddRegular />} onClick={handleAdd}>
          {t('members.add')}
        </Button>
      </div>

      {members.length === 0 ? (
        <div className={styles.emptyState}>
          <Text size={400}>{t('members.noMembers')}</Text>
          <Text size={200}>{t('members.noMembersHint')}</Text>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{t('members.name')}</TableHeaderCell>
              <TableHeaderCell>{t('members.username')}</TableHeaderCell>
              <TableHeaderCell>{t('members.email')}</TableHeaderCell>
              <TableHeaderCell>{t('members.phone')}</TableHeaderCell>
              <TableHeaderCell>{t('members.position')}</TableHeaderCell>
              <TableHeaderCell>{t('members.department')}</TableHeaderCell>
              <TableHeaderCell>{t('common.actions')}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map(member => (
              <TableRow key={member.userId}>
                <TableCell>
                  <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
                    <Text weight="semibold">{member.name}</Text>
                    {member.isAdmin && <Badge appearance="filled" color="brand" size="small">Admin</Badge>}
                  </div>
                </TableCell>
                <TableCell><Text size={200}>{member.username}</Text></TableCell>
                <TableCell><Text size={200}>{member.email}</Text></TableCell>
                <TableCell><Text size={200}>{member.phone || '-'}</Text></TableCell>
                <TableCell><Text size={200}>{member.position || '-'}</Text></TableCell>
                <TableCell><Text size={200}>{getDeptName(member.departmentId)}</Text></TableCell>
                <TableCell>
                  <div className={styles.actions}>
                    <Button size="small" icon={<EditRegular />} onClick={() => handleEdit(member)} />
                    <Button size="small" icon={<KeyRegular />} onClick={() => handleResetPassword(member)} />
                    <Button size="small" icon={<DeleteRegular />} onClick={() => handleRemove(member)} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editingMember ? t('members.editTitle') : t('members.addTitle')}</DialogTitle>
            <DialogContent>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingVerticalM }}>
                <Field label={t('members.name')} required>
                  <Input value={formData.name} onChange={(_, data) => setFormData({ ...formData, name: data.value })} />
                </Field>
                <Field label={t('members.username')} required>
                  <Input value={formData.username} onChange={(_, data) => setFormData({ ...formData, username: data.value })} disabled={!!editingMember} />
                </Field>
                <Field label={t('members.email')}>
                  <Input value={formData.email} onChange={(_, data) => setFormData({ ...formData, email: data.value })} />
                </Field>
                <Field label={t('members.phone')}>
                  <Input value={formData.phone} onChange={(_, data) => setFormData({ ...formData, phone: data.value })} />
                </Field>
                <Field label={t('members.position')}>
                  <Input value={formData.position} onChange={(_, data) => setFormData({ ...formData, position: data.value })} />
                </Field>
                <Field label={t('members.department')}>
                  <select
                    value={formData.departmentId ?? ''}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value ? parseInt(e.target.value) : null })}
                    style={{
                      width: '100%',
                      padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
                      borderRadius: tokens.borderRadiusMedium,
                      border: `1px solid ${tokens.colorNeutralStroke1}`,
                      backgroundColor: tokens.colorNeutralBackground1,
                    }}
                  >
                    <option value="">{t('members.noDepartment')}</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {!editingMember && (
                <Field label={t('login.password')} style={{ marginTop: tokens.spacingVerticalM }}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(_, data) => setPassword(data.value)}
                    placeholder="Optional - auto-generated if empty"
                  />
                </Field>
              )}
              <div style={{ display: 'flex', gap: tokens.spacingHorizontalM, marginTop: tokens.spacingVerticalM }}>
                <Switch
                  label={t('members.isAdmin')}
                  checked={formData.isAdmin}
                  onChange={(_, data) => setFormData({ ...formData, isAdmin: data.checked as boolean })}
                />
                <Switch
                  label={t('members.isDeptManager')}
                  checked={formData.isDepartmentManager}
                  onChange={(_, data) => setFormData({ ...formData, isDepartmentManager: data.checked as boolean })}
                />
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.cancel')}</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleSave} disabled={saving || !formData.name.trim() || !formData.username.trim()}>
                {t('common.save')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={(_, data) => setResetDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('members.resetPasswordTitle')}</DialogTitle>
            <DialogContent>
              <Field label={t('members.newPassword')}>
                <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
                  <Input
                    type="text"
                    value={newPassword}
                    onChange={(_, data) => setNewPassword(data.value)}
                    style={{ flex: 1 }}
                  />
                  <Button onClick={generatePassword}>{t('members.generatePassword')}</Button>
                </div>
              </Field>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.cancel')}</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleSavePassword} disabled={!newPassword}>
                {t('common.save')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
