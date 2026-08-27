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
  Text,
  Badge,
  Checkbox,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  PersonAddRegular,
  PersonDeleteRegular,
} from '@fluentui/react-icons'
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listRoleUsers,
  assignRoleToUser,
  removeRoleFromUser,
  type Role,
  type CreateRoleRequest,
} from '../../api/role'
import { listMembers, type Member } from '../../api/user'

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
  roleCard: {
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  roleHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  roleInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  roleActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  permissionList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
  },
  userSection: {
    marginTop: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  userList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalS,
  },
  userItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3,
  },
})

interface RoleManagerProps {
  orgId: number
}

export const RoleManager: React.FC<RoleManagerProps> = ({ orgId }) => {
  const styles = useStyles()
  const { t } = useTranslation()

  const [roles, setRoles] = useState<Role[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [formData, setFormData] = useState<CreateRoleRequest>({
    name: '',
    description: '',
    permissions: [],
  })
  const [saving, setSaving] = useState(false)

  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [roleUsers, setRoleUsers] = useState<Array<{ userId: number; name: string; username: string }>>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

  useEffect(() => {
    loadData()
  }, [orgId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [rolesData, membersData] = await Promise.all([
        listRoles(orgId),
        listMembers(orgId),
      ])
      setRoles(rolesData)
      setMembers(membersData)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingRole(null)
    setFormData({ name: '', description: '', permissions: [] })
    setDialogOpen(true)
  }

  const handleEdit = (role: Role) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      description: role.description,
      permissions: role.permissions,
    })
    setDialogOpen(true)
  }

  const handleDelete = async (role: Role) => {
    if (!confirm(t('roles.confirmDelete'))) return
    try {
      await deleteRole(orgId, role.id)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleSave = async () => {
    if (!formData.name.trim()) return
    setSaving(true)
    try {
      if (editingRole) {
        await updateRole(orgId, editingRole.id, formData)
      } else {
        await createRole(orgId, formData)
      }
      setDialogOpen(false)
      loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePermission = (perm: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm],
    }))
  }

  const handleAssignUsers = async (role: Role) => {
    setSelectedRole(role)
    try {
      const users = await listRoleUsers(orgId, role.id)
      const usersWithNames = users.map(u => {
        const member = members.find(m => m.userId === u.userId)
        return {
          userId: u.userId,
          name: member?.name || 'Unknown',
          username: member?.username || '',
        }
      })
      setRoleUsers(usersWithNames)
      setAssignDialogOpen(true)
    } catch (err) {
      console.error(err)
    }
  }

  const handleAssignUser = async () => {
    if (!selectedRole || !selectedUserId) return
    try {
      await assignRoleToUser(orgId, selectedRole.id, selectedUserId)
      const users = await listRoleUsers(orgId, selectedRole.id)
      const usersWithNames = users.map(u => {
        const member = members.find(m => m.userId === u.userId)
        return {
          userId: u.userId,
          name: member?.name || 'Unknown',
          username: member?.username || '',
        }
      })
      setRoleUsers(usersWithNames)
      setSelectedUserId(null)
    } catch (err) {
      console.error(err)
    }
  }

  const handleRemoveUser = async (userId: number) => {
    if (!selectedRole) return
    try {
      await removeRoleFromUser(orgId, selectedRole.id, userId)
      setRoleUsers(prev => prev.filter(u => u.userId !== userId))
    } catch (err) {
      console.error(err)
    }
  }

  const availablePermissions = [
    'org:manage',
    'org:view',
    'user:manage',
    'user:view',
    'app:manage',
    'app:view',
    'data:manage',
    'data:view',
    'role:manage',
    'role:view',
  ]

  if (loading) {
    return <Text>{t('common.loading')}</Text>
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Button appearance="primary" icon={<AddRegular />} onClick={handleCreate}>
          {t('roles.create')}
        </Button>
      </div>

      {roles.length === 0 ? (
        <div className={styles.emptyState}>
          <Text size={400}>{t('roles.noRoles')}</Text>
          <Text size={200}>{t('roles.noRolesHint')}</Text>
        </div>
      ) : (
        roles.map(role => (
          <div key={role.id} className={styles.roleCard}>
            <div className={styles.roleHeader}>
              <div className={styles.roleInfo}>
                <Text size={400} weight="semibold">{role.name}</Text>
                <Text size={200}>{role.description}</Text>
              </div>
              <div className={styles.roleActions}>
                <Button
                  size="small"
                  icon={<PersonAddRegular />}
                  onClick={() => handleAssignUsers(role)}
                >
                  {t('roles.assignUsers')}
                </Button>
                <Button size="small" icon={<EditRegular />} onClick={() => handleEdit(role)} />
                <Button size="small" icon={<DeleteRegular />} onClick={() => handleDelete(role)} />
              </div>
            </div>
            <div className={styles.permissionList}>
              {role.permissions.map(perm => (
                <Badge key={perm} appearance="tint" size="small">
                  {perm}
                </Badge>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editingRole ? t('roles.editTitle') : t('roles.createTitle')}</DialogTitle>
            <DialogContent>
              <Field label={t('roles.name')} required>
                <Input
                  value={formData.name}
                  onChange={(_, data) => setFormData({ ...formData, name: data.value })}
                />
              </Field>
              <Field label={t('roles.description')} style={{ marginTop: tokens.spacingVerticalM }}>
                <Input
                  value={formData.description}
                  onChange={(_, data) => setFormData({ ...formData, description: data.value })}
                />
              </Field>
              <Field label={t('roles.permissions')} style={{ marginTop: tokens.spacingVerticalM }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS }}>
                  {availablePermissions.map(perm => (
                    <Checkbox
                      key={perm}
                      label={perm}
                      checked={formData.permissions.includes(perm)}
                      onChange={() => handleTogglePermission(perm)}
                    />
                  ))}
                </div>
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

      {/* Assign Users Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={(_, data) => setAssignDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('roles.assignUsersTitle')}</DialogTitle>
            <DialogContent>
              <Text size={300} weight="semibold">{selectedRole?.name}</Text>
              <div className={styles.userSection}>
                <Text size={300}>{t('roles.currentUsers')}</Text>
                <div className={styles.userList}>
                  {roleUsers.length === 0 ? (
                    <Text size={200}>{t('roles.noUsers')}</Text>
                  ) : (
                    roleUsers.map(user => (
                      <div key={user.userId} className={styles.userItem}>
                        <Text size={200}>{user.name} ({user.username})</Text>
                        <Button
                          size="small"
                          icon={<PersonDeleteRegular />}
                          appearance="subtle"
                          onClick={() => handleRemoveUser(user.userId)}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className={styles.userSection}>
                <Field label={t('roles.addUser')}>
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
                    {members
                      .filter(m => !roleUsers.some(u => u.userId === m.userId))
                      .map(m => (
                        <option key={m.userId} value={m.userId}>{m.name} ({m.username})</option>
                      ))}
                  </select>
                </Field>
                <Button
                  appearance="primary"
                  icon={<PersonAddRegular />}
                  onClick={handleAssignUser}
                  disabled={!selectedUserId}
                  style={{ marginTop: tokens.spacingVerticalS }}
                >
                  {t('roles.assign')}
                </Button>
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.close')}</Button>
              </DialogTrigger>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
