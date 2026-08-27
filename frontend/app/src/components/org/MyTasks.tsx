import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Text,
  Badge,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogTrigger,
  Field,
  Input,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  CheckmarkRegular,
  DismissRegular,
  ArrowRightRegular,
} from '@fluentui/react-icons'
import {
  listMyTasks,
  approveWorkflowTask,
  rejectWorkflowTask,
  transferWorkflowTask,
  type WorkflowTask,
} from '../../api/workflow'
import { listMembers, type Member } from '../../api/user'

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: tokens.spacingVerticalXXL,
    gap: tokens.spacingVerticalM,
  },
  taskCard: {
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  taskHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  taskInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  taskActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  commentInput: {
    marginTop: tokens.spacingVerticalS,
  },
})

interface MyTasksProps {
  orgId: number
}

export const MyTasks: React.FC<MyTasksProps> = ({ orgId }) => {
  const styles = useStyles()
  const { t } = useTranslation()

  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  const [commentDialogOpen, setCommentDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null)
  const [comment, setComment] = useState('')
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'transfer'>('approve')

  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [targetUserId, setTargetUserId] = useState<number | null>(null)

  useEffect(() => {
    loadData()
  }, [orgId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [tasksData, membersData] = await Promise.all([
        listMyTasks(orgId),
        listMembers(orgId),
      ])
      setTasks(tasksData)
      setMembers(membersData)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = (task: WorkflowTask) => {
    setSelectedTask(task)
    setComment('')
    setActionType('approve')
    setCommentDialogOpen(true)
  }

  const handleReject = (task: WorkflowTask) => {
    setSelectedTask(task)
    setComment('')
    setActionType('reject')
    setCommentDialogOpen(true)
  }

  const handleTransfer = (task: WorkflowTask) => {
    setSelectedTask(task)
    setComment('')
    setTargetUserId(null)
    setActionType('transfer')
    setTransferDialogOpen(true)
  }

  const handleConfirmAction = async () => {
    if (!selectedTask) return

    try {
      if (actionType === 'approve') {
        await approveWorkflowTask(orgId, selectedTask.id, comment)
      } else if (actionType === 'reject') {
        if (!comment.trim()) {
          alert(t('workflow.commentRequired'))
          return
        }
        await rejectWorkflowTask(orgId, selectedTask.id, comment)
      }
      setCommentDialogOpen(false)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleConfirmTransfer = async () => {
    if (!selectedTask || !targetUserId) return

    try {
      await transferWorkflowTask(orgId, selectedTask.id, targetUserId, comment)
      setTransferDialogOpen(false)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const getStatusColor = (status: string): 'success' | 'warning' | 'danger' | 'informative' => {
    switch (status) {
      case 'pending': return 'informative'
      case 'approved': return 'success'
      case 'rejected': return 'danger'
      case 'transferred': return 'warning'
      default: return 'informative'
    }
  }

  if (loading) {
    return <Text>{t('common.loading')}</Text>
  }

  return (
    <div className={styles.container}>
      {tasks.length === 0 ? (
        <div className={styles.emptyState}>
          <Text size={400}>{t('workflow.noTasks')}</Text>
          <Text size={200}>{t('workflow.noTasksHint')}</Text>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{t('workflow.taskName')}</TableHeaderCell>
              <TableHeaderCell>{t('workflow.instance')}</TableHeaderCell>
              <TableHeaderCell>{t('workflow.status')}</TableHeaderCell>
              <TableHeaderCell>{t('workflow.createdAt')}</TableHeaderCell>
              <TableHeaderCell>{t('common.actions')}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map(task => (
              <TableRow key={task.id}>
                <TableCell>{task.nodeName}</TableCell>
                <TableCell>#{task.instanceId}</TableCell>
                <TableCell>
                  <Badge appearance="filled" color={getStatusColor(task.status)}>
                    {t(`workflow.taskStatus.${task.status}`)}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(task.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  {task.status === 'pending' && (
                    <div className={styles.taskActions}>
                      <Button
                        size="small"
                        icon={<CheckmarkRegular />}
                        appearance="primary"
                        onClick={() => handleApprove(task)}
                      >
                        {t('workflow.approve')}
                      </Button>
                      <Button
                        size="small"
                        icon={<DismissRegular />}
                        onClick={() => handleReject(task)}
                      >
                        {t('workflow.reject')}
                      </Button>
                      <Button
                        size="small"
                        icon={<ArrowRightRegular />}
                        onClick={() => handleTransfer(task)}
                      >
                        {t('workflow.transfer')}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Approve/Reject Dialog */}
      <Dialog open={commentDialogOpen} onOpenChange={(_, data) => setCommentDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {actionType === 'approve' ? t('workflow.approveTitle') : t('workflow.rejectTitle')}
            </DialogTitle>
            <DialogContent>
              <Field label={t('workflow.comment')} required={actionType === 'reject'}>
                <Input
                  value={comment}
                  onChange={(_, data) => setComment(data.value)}
                  placeholder={t('workflow.commentPlaceholder')}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.cancel')}</Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                onClick={handleConfirmAction}
                disabled={actionType === 'reject' && !comment.trim()}
              >
                {t('common.confirm')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={(_, data) => setTransferDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('workflow.transferTitle')}</DialogTitle>
            <DialogContent>
              <Field label={t('workflow.transferTo')} required>
                <select
                  value={targetUserId ?? ''}
                  onChange={(e) => setTargetUserId(parseInt(e.target.value))}
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
                    .filter(m => m.userId !== selectedTask?.assigneeId)
                    .map(m => (
                      <option key={m.userId} value={m.userId}>{m.name} ({m.username})</option>
                    ))}
                </select>
              </Field>
              <Field label={t('workflow.comment')} className={styles.commentInput}>
                <Input
                  value={comment}
                  onChange={(_, data) => setComment(data.value)}
                  placeholder={t('workflow.commentPlaceholder')}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.cancel')}</Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                onClick={handleConfirmTransfer}
                disabled={!targetUserId}
              >
                {t('common.confirm')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
