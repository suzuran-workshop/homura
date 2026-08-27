import React, { useEffect, useState } from 'react'
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
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  ArrowSyncRegular,
  ToolboxRegular,
} from '@fluentui/react-icons'
import { listMCPTools, type MCPTool } from '../../api/mcp'

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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  toolCard: {
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  paramTable: {
    marginTop: tokens.spacingVerticalS,
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

export const MCPTools: React.FC = () => {
  const styles = useStyles()
  const { t } = useTranslation()

  const [tools, setTools] = useState<MCPTool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadTools()
  }, [])

  const loadTools = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listMCPTools()
      setTools(data)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const renderParams = (schema: any) => {
    if (!schema || !schema.properties) return null
    const props = schema.properties
    const required = schema.required || []

    return (
      <div className={styles.paramTable}>
        <Text size={200} weight="semibold">{t('mcp.parameters')}</Text>
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Required</TableHeaderCell>
              <TableHeaderCell>Description</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(props).map(([name, prop]: [string, any]) => (
              <TableRow key={name}>
                <TableCell><Text size={200} weight="semibold">{name}</Text></TableCell>
                <TableCell><Text size={200}>{prop.type || '-'}</Text></TableCell>
                <TableCell><Text size={200}>{required.includes(name) ? '✓' : '-'}</Text></TableCell>
                <TableCell><Text size={200}>{prop.description || '-'}</Text></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
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
          <ToolboxRegular style={{ fontSize: 24 }} />
          <div>
            <Text size={600} weight="semibold">{t('mcp.tools')}</Text>
            <br />
            <Text size={200}>{t('mcp.toolsDescription')}</Text>
          </div>
        </div>
        <Button icon={<ArrowSyncRegular />} onClick={loadTools}>{t('common.refresh')}</Button>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>{t('common.error')}</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      {tools.length === 0 ? (
        <div className={styles.emptyState}>
          <ToolboxRegular style={{ fontSize: 48, color: tokens.colorNeutralForeground3 }} />
          <Text size={400}>{t('mcp.noTools')}</Text>
        </div>
      ) : (
        <div className={styles.grid}>
          {tools.map(tool => (
            <Card key={tool.name} className={styles.toolCard}>
              <Text size={400} weight="semibold">{tool.name}</Text>
              <Text size={200}>{tool.description || '-'}</Text>
              {renderParams(tool.inputSchema)}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
