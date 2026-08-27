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
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  PersonRegular,
} from '@fluentui/react-icons'
import {
  getDepartmentTree,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  setDepartmentManager,
  listDepartments,
  type DepartmentNode,
  type DepartmentRequest,
  type Department,
} from '../../api/department'
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
  treeNode: {
    display: 'flex',
    flexDirection: 'column',
  },
  nodeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  nodeExpand: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '12px',
    userSelect: 'none',
  },
  nodeChildren: {
    marginLeft: tokens.spacingHorizontalXXL,
  },
  nodeName: {
    flex: 1,
  },
  nodeActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    opacity: 0,
    transition: `opacity ${tokens.durationFast}`,
    '$nodeRow:hover &': {
      opacity: 1,
    },
  },
})

interface TreeNodeProps {
  node: DepartmentNode
  members: Member[]
  allDepts: Department[]
  depth: number
  styles: ReturnType<typeof useStyles>
  t: (key: string) => string
  onEdit: (dept: Department) => void
  onDelete: (dept: Department) => void
  onSetManager: (dept: Department) => void
}

const TreeNodeView: React.FC<TreeNodeProps> = ({ node, members, depth, styles, t, onEdit, onDelete, onSetManager }) => {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children && node.children.length > 0
  const manager = members.find(m => m.userId === node.managerUserId)

  return (
    <div className={styles.treeNode}>
      <div className={styles.nodeRow} style={{ paddingLeft: `${depth * 24 + 8}px` }}>
        <span
          className={styles.nodeExpand}
          onClick={() => hasChildren && setExpanded(!expanded)}
        >
          {hasChildren ? (expanded ? '▼' : '▶') : '·'}
        </span>
        <Text size={300} weight="semibold" className={styles.nodeName}>
          {node.name}
        </Text>
        {manager && (
          <Badge appearance="tint" size="small" icon={<PersonRegular />}>
            {t('dept.manager')}: {manager.name}
          </Badge>
        )}
        {!manager && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {t('dept.noManager')}
          </Text>
        )}
        <div className={styles.nodeActions}>
          <Button size="small" icon={<PersonRegular />} onClick={() => onSetManager(node)}>
            {t('dept.setManager')}
          </Button>
          <Button size="small" icon={<EditRegular />} onClick={() => onEdit(node)} />
          <Button size="small" icon={<DeleteRegular />} onClick={() => onDelete(node)} />
        </div>
      </div>
      {hasChildren && expanded && (
        <div className={styles.nodeChildren}>
          {node.children.map(child => (
            <TreeNodeView
              key={child.id}
              node={child}
              members={members}
              allDepts={[]}
              depth={depth + 1}
              styles={styles}
              t={t}
              onEdit={onEdit}
              onDelete={onDelete}
              onSetManager={onSetManager}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface DepartmentManagerProps {
  orgId: number
}

export const DepartmentManager: React.FC<DepartmentManagerProps> = ({ orgId }) => {
  const styles = useStyles()
  const { t } = useTranslation()

  const [tree, setTree] = useState<DepartmentNode[]>([])
  const [flatDepts, setFlatDepts] = useState<Department[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [formData, setFormData] = useState<DepartmentRequest>({ name: '', parentId: null, description: '' })
  const [saving, setSaving] = useState(false)

  const [managerDialogOpen, setManagerDialogOpen] = useState(false)
  const [managerDept, setManagerDept] = useState<Department | null>(null)
  const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null)

  useEffect(() => {
    loadData()
  }, [orgId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [treeData, flatData, memberData] = await Promise.all([
        getDepartmentTree(orgId),
        listDepartments(orgId),
        listMembers(orgId),
      ])
      setTree(treeData)
      setFlatDepts(flatData)
      setMembers(memberData)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingDept(null)
    setFormData({ name: '', parentId: null, description: '' })
    setDialogOpen(true)
  }

  const handleEdit = (dept: Department) => {
    setEditingDept(dept)
    setFormData({ name: dept.name, parentId: dept.parentId, description: dept.description })
    setDialogOpen(true)
  }

  const handleDelete = async (dept: Department) => {
    if (!confirm(t('dept.confirmDelete'))) return
    try {
      await deleteDepartment(orgId, dept.id)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleSave = async () => {
    if (!formData.name.trim()) return
    setSaving(true)
    try {
      if (editingDept) {
        await updateDepartment(orgId, editingDept.id, formData)
      } else {
        await createDepartment(orgId, formData)
      }
      setDialogOpen(false)
      loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleSetManager = (dept: Department) => {
    setManagerDept(dept)
    setSelectedManagerId(dept.managerUserId)
    setManagerDialogOpen(true)
  }

  const handleSaveManager = async () => {
    if (!managerDept) return
    try {
      await setDepartmentManager(orgId, managerDept.id, selectedManagerId)
      setManagerDialogOpen(false)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return <Text>{t('common.loading')}</Text>
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Button appearance="primary" icon={<AddRegular />} onClick={handleCreate}>
          {t('dept.create')}
        </Button>
      </div>

      {tree.length === 0 ? (
        <div className={styles.emptyState}>
          <Text size={400}>{t('dept.noDepartments')}</Text>
          <Text size={200}>{t('dept.noDepartmentsHint')}</Text>
        </div>
      ) : (
        tree.map(node => (
          <TreeNodeView
            key={node.id}
            node={node}
            members={members}
            allDepts={flatDepts}
            depth={0}
            styles={styles}
            t={t}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSetManager={handleSetManager}
          />
        ))
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editingDept ? t('dept.editTitle') : t('dept.createTitle')}</DialogTitle>
            <DialogContent>
              <Field label={t('dept.name')} required>
                <Input
                  value={formData.name}
                  onChange={(_, data) => setFormData({ ...formData, name: data.value })}
                />
              </Field>
              <Field label={t('dept.parent')} style={{ marginTop: tokens.spacingVerticalM }}>
                <select
                  value={formData.parentId ?? ''}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value ? parseInt(e.target.value) : null })}
                  style={{
                    width: '100%',
                    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
                    borderRadius: tokens.borderRadiusMedium,
                    border: `1px solid ${tokens.colorNeutralStroke1}`,
                    backgroundColor: tokens.colorNeutralBackground1,
                  }}
                >
                  <option value="">{t('dept.rootLevel')}</option>
                  {flatDepts
                    .filter(d => !editingDept || d.id !== editingDept.id)
                    .map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
              </Field>
              <Field label={t('dept.descriptionLabel')} style={{ marginTop: tokens.spacingVerticalM }}>
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

      {/* Set Manager Dialog */}
      <Dialog open={managerDialogOpen} onOpenChange={(_, data) => setManagerDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('dept.setManager')}</DialogTitle>
            <DialogContent>
              <Field label={t('dept.manager')}>
                <select
                  value={selectedManagerId ?? ''}
                  onChange={(e) => setSelectedManagerId(e.target.value ? parseInt(e.target.value) : null)}
                  style={{
                    width: '100%',
                    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
                    borderRadius: tokens.borderRadiusMedium,
                    border: `1px solid ${tokens.colorNeutralStroke1}`,
                    backgroundColor: tokens.colorNeutralBackground1,
                  }}
                >
                  <option value="">{t('dept.noManager')}</option>
                  {members.map(m => (
                    <option key={m.userId} value={m.userId}>{m.name} ({m.username})</option>
                  ))}
                </select>
              </Field>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.cancel')}</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleSaveManager}>
                {t('common.save')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
