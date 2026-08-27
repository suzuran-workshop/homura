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
  Card,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  PlayRegular,
} from '@fluentui/react-icons'
import {
  listWorkflowDefinitions,
  createWorkflowDefinition,
  updateWorkflowDefinition,
  deleteWorkflowDefinition,
  startWorkflowInstance,
  type WorkflowDefinition,
  type CreateWorkflowRequest,
} from '../../api/workflow'

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
  workflowCard: {
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  workflowHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  workflowInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  workflowActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  statusBadge: {
    marginLeft: tokens.spacingHorizontalS,
  },
})

interface WorkflowManagerProps {
  orgId: number
}

export const WorkflowManager: React.FC<WorkflowManagerProps> = ({ orgId }) => {
  const styles = useStyles()
  const { t } = useTranslation()

  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowDefinition | null>(null)
  const [formData, setFormData] = useState<CreateWorkflowRequest>({
    name: '',
    description: '',
    nodes: [
      { id: 'start', type: 'start', name: '开始', nextNodes: [] },
      { id: 'end', type: 'end', name: '结束', nextNodes: [] },
    ],
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [orgId])

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await listWorkflowDefinitions(orgId)
      setWorkflows(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingWorkflow(null)
    setFormData({
      name: '',
      description: '',
      nodes: [
        { id: 'start', type: 'start', name: '开始', nextNodes: [] },
        { id: 'end', type: 'end', name: '结束', nextNodes: [] },
      ],
    })
    setDialogOpen(true)
  }

  const handleEdit = (workflow: WorkflowDefinition) => {
    setEditingWorkflow(workflow)
    setFormData({
      name: workflow.name,
      description: workflow.description,
      nodes: [], // TODO: Load actual nodes from backend
    })
    setDialogOpen(true)
  }

  const handleDelete = async (workflow: WorkflowDefinition) => {
    if (!confirm(t('workflow.confirmDelete'))) return
    try {
      await deleteWorkflowDefinition(orgId, workflow.id)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleSave = async () => {
    if (!formData.name.trim()) return
    setSaving(true)
    try {
      if (editingWorkflow) {
        await updateWorkflowDefinition(orgId, editingWorkflow.id, formData)
      } else {
        await createWorkflowDefinition(orgId, formData)
      }
      setDialogOpen(false)
      loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleStartInstance = async (workflow: WorkflowDefinition) => {
    if (!confirm(t('workflow.confirmStart'))) return
    try {
      await startWorkflowInstance(orgId, workflow.id)
      // TODO: Show success message or navigate to instance list
    } catch (err) {
      console.error(err)
    }
  }

  const getStatusColor = (status: string): 'success' | 'warning' | 'danger' | 'informative' => {
    switch (status) {
      case 'active': return 'success'
      case 'draft': return 'informative'
      case 'inactive': return 'warning'
      default: return 'informative'
    }
  }

  if (loading) {
    return <Text>{t('common.loading')}</Text>
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Button appearance="primary" icon={<AddRegular />} onClick={handleCreate}>
          {t('workflow.create')}
        </Button>
      </div>

      {workflows.length === 0 ? (
        <div className={styles.emptyState}>
          <Text size={400}>{t('workflow.noWorkflows')}</Text>
          <Text size={200}>{t('workflow.noWorkflowsHint')}</Text>
        </div>
      ) : (
        workflows.map(workflow => (
          <Card key={workflow.id} className={styles.workflowCard}>
            <div className={styles.workflowHeader}>
              <div className={styles.workflowInfo}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Text size={400} weight="semibold">{workflow.name}</Text>
                  <Badge
                    appearance="filled"
                    color={getStatusColor(workflow.status)}
                    className={styles.statusBadge}
                  >
                    {t(`workflow.status.${workflow.status}`)}
                  </Badge>
                </div>
                <Text size={200}>{workflow.description}</Text>
              </div>
              <div className={styles.workflowActions}>
                <Button
                  size="small"
                  icon={<PlayRegular />}
                  onClick={() => handleStartInstance(workflow)}
                  disabled={workflow.status !== 'active'}
                >
                  {t('workflow.start')}
                </Button>
                <Button size="small" icon={<EditRegular />} onClick={() => handleEdit(workflow)} />
                <Button size="small" icon={<DeleteRegular />} onClick={() => handleDelete(workflow)} />
              </div>
            </div>
          </Card>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editingWorkflow ? t('workflow.editTitle') : t('workflow.createTitle')}</DialogTitle>
            <DialogContent>
              <Field label={t('workflow.name')} required>
                <Input
                  value={formData.name}
                  onChange={(_, data) => setFormData({ ...formData, name: data.value })}
                />
              </Field>
              <Field label={t('workflow.description')} style={{ marginTop: tokens.spacingVerticalM }}>
                <Input
                  value={formData.description}
                  onChange={(_, data) => setFormData({ ...formData, description: data.value })}
                />
              </Field>
              <Text size={200} style={{ marginTop: tokens.spacingVerticalM, color: tokens.colorNeutralForeground3 }}>
                {t('workflow.designerHint')}
              </Text>
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
