import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Select,
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
  ArrowSyncRegular,
  DocumentBulletListRegular,
} from '@fluentui/react-icons'
import { listAuditLogs, type AuditLogEntry } from '../../api/mcp'

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
  filters: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'flex-end',
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

export const MCPLogs: React.FC = () => {
  const styles = useStyles()
  const { t } = useTranslation()

  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [limit, setLimit] = useState(100)

  useEffect(() => {
    loadLogs()
  }, [actionFilter, limit])

  const loadLogs = async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { limit }
      if (actionFilter) params.action = actionFilter
      const data = await listAuditLogs(params)
      setLogs(data)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
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
          <DocumentBulletListRegular style={{ fontSize: 24 }} />
          <div>
            <Text size={600} weight="semibold">{t('mcp.logs')}</Text>
            <br />
            <Text size={200}>{t('mcp.logsDescription')}</Text>
          </div>
        </div>
        <div className={styles.filters}>
          <Select
            value={actionFilter}
            onChange={(_, data) => setActionFilter(data.value)}
            style={{ minWidth: 140 }}
          >
            <option value="">{t('mcp.allActions')}</option>
            <option value="tool_call">Tool Call</option>
            <option value="tool_list">Tool List</option>
            <option value="resource_read">Resource Read</option>
          </Select>
          <Select
            value={String(limit)}
            onChange={(_, data) => setLimit(parseInt(data.value))}
            style={{ minWidth: 100 }}
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </Select>
          <Button icon={<ArrowSyncRegular />} onClick={loadLogs}>{t('common.refresh')}</Button>
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

      {logs.length === 0 ? (
        <div className={styles.emptyState}>
          <DocumentBulletListRegular style={{ fontSize: 48, color: tokens.colorNeutralForeground3 }} />
          <Text size={400}>{t('mcp.noLogs')}</Text>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell style={{ width: 180 }}>{t('mcp.time')}</TableHeaderCell>
              <TableHeaderCell style={{ width: 60 }}>{t('mcp.user')}</TableHeaderCell>
              <TableHeaderCell style={{ width: 60 }}>{t('mcp.org')}</TableHeaderCell>
              <TableHeaderCell>{t('mcp.action')}</TableHeaderCell>
              <TableHeaderCell>{t('mcp.resource')}</TableHeaderCell>
              <TableHeaderCell style={{ width: 80 }}>{t('mcp.status')}</TableHeaderCell>
              <TableHeaderCell style={{ width: 130 }}>{t('mcp.ip')}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map(log => (
              <TableRow key={log.id}>
                <TableCell>
                  <Text size={200}>{new Date(log.createdAt).toLocaleString()}</Text>
                </TableCell>
                <TableCell><Text size={200}>{log.userId}</Text></TableCell>
                <TableCell><Text size={200}>{log.orgId}</Text></TableCell>
                <TableCell>
                  <Badge appearance="tint" size="small">{log.action}</Badge>
                </TableCell>
                <TableCell>
                  <Text size={200} truncate style={{ maxWidth: 200 }}>
                    {log.resourceType}:{log.resourceId}
                  </Text>
                </TableCell>
                <TableCell>
                  <Badge
                    appearance="filled"
                    color={log.responseStatus < 400 ? 'success' : 'danger'}
                    size="small"
                  >
                    {log.responseStatus}
                  </Badge>
                </TableCell>
                <TableCell><Text size={200}>{log.ipAddress}</Text></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
