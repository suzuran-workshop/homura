import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons'
import { listOrgs, type Org } from '../api/org'
import { listTables, listRows, insertRow, updateRow, deleteRow, type TableInfo } from '../api/data'
import { useAuthStore } from '../stores/auth'

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
  content: {
    display: 'grid',
    gridTemplateColumns: '250px 1fr',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
    },
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  tableList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  tableItem: {
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    transition: `background-color ${tokens.durationFast} ${tokens.curveEasyEase}`,
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  tableItemActive: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalM,
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

export const DataManager: React.FC = () => {
  const styles = useStyles()
  const navigate = useNavigate()
  const { appId } = useParams<{ appId: string }>()
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const isProvider = user?.role === 'provider'

  const [orgs, setOrgs] = useState<Org[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [currentPage, setCurrentPage] = useState(1)
  const [totalRows, setTotalRows] = useState(0)
  const pageSize = 50

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<Record<string, any> | null>(null)
  const [editValues, setEditValues] = useState<Record<string, any>>({})

  useEffect(() => {
    if (isProvider) {
      loadOrgs()
    } else if (user?.orgId) {
      setSelectedOrgId(user.orgId)
    }
  }, [isProvider, user])

  useEffect(() => {
    if (selectedOrgId && appId) {
      loadTables()
    }
  }, [selectedOrgId, appId])

  useEffect(() => {
    if (selectedOrgId && appId && selectedTable) {
      loadRows()
    }
  }, [selectedOrgId, appId, selectedTable, currentPage])

  const loadOrgs = async () => {
    try {
      const data = await listOrgs()
      setOrgs(data)
      if (data.length > 0 && !selectedOrgId) {
        setSelectedOrgId(data[0].id)
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  const loadTables = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listTables(selectedOrgId!, parseInt(appId!))
      setTables(data)
      if (data.length > 0 && !selectedTable) {
        setSelectedTable(data[0].tableName)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadRows = async () => {
    setLoading(true)
    setError('')
    try {
      const offset = (currentPage - 1) * pageSize
      const data = await listRows(selectedOrgId!, parseInt(appId!), selectedTable!, pageSize, offset)
      setRows(data.rows)
      setTotalRows(data.count)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddRow = () => {
    setEditingRow(null)
    setEditValues({})
    setEditDialogOpen(true)
  }

  const handleEditRow = (row: Record<string, any>) => {
    setEditingRow(row)
    setEditValues({ ...row })
    setEditDialogOpen(true)
  }

  const handleDeleteRow = async (row: Record<string, any>) => {
    if (!confirm(t('data.confirmDelete'))) return

    try {
      await deleteRow(selectedOrgId!, parseInt(appId!), selectedTable!, row.id)
      loadRows()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleSaveRow = async () => {
    try {
      if (editingRow) {
        await updateRow(selectedOrgId!, parseInt(appId!), selectedTable!, editingRow.id, editValues)
      } else {
        await insertRow(selectedOrgId!, parseInt(appId!), selectedTable!, editValues)
      }
      setEditDialogOpen(false)
      loadRows()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const currentTable = tables.find(t => t.tableName === selectedTable)
  const totalPages = Math.ceil(totalRows / pageSize)

  if (loading && !tables.length) {
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
        <Button icon={<ChevronLeftRegular />} appearance="subtle" onClick={() => navigate(-1)} />
        <Text size={600} weight="semibold">
          {t('data.title')}
        </Text>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>{t('common.error')}</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.content}>
        <div className={styles.sidebar}>
          {isProvider && (
            <Field label={t('data.selectOrg')}>
              <select
                value={selectedOrgId || ''}
                onChange={(e) => setSelectedOrgId(parseInt(e.target.value))}
                style={{
                  padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
                  borderRadius: tokens.borderRadiusMedium,
                  border: `1px solid ${tokens.colorNeutralStroke1}`,
                  backgroundColor: tokens.colorNeutralBackground1,
                }}
              >
                {orgs.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </Field>
          )}

          <Text size={300} weight="semibold">
            {t('data.selectTable')}
          </Text>
          <div className={styles.tableList}>
            {tables.length === 0 ? (
              <Text size={200}>{t('data.noTables')}</Text>
            ) : (
              tables.map(table => (
                <div
                  key={table.tableName}
                  className={`${styles.tableItem} ${selectedTable === table.tableName ? styles.tableItemActive : ''}`}
                  onClick={() => {
                    setSelectedTable(table.tableName)
                    setCurrentPage(1)
                  }}
                >
                  <Text size={300}>{table.tableName}</Text>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.main}>
          {!selectedTable ? (
            <div className={styles.emptyState}>
              <Text size={400}>{t('data.selectTable')}</Text>
            </div>
          ) : (
            <>
              <div className={styles.tableHeader}>
                <Text size={400} weight="semibold">
                  {selectedTable}
                </Text>
                <Button
                  appearance="primary"
                  icon={<AddRegular />}
                  onClick={handleAddRow}
                >
                  {t('data.addRow')}
                </Button>
              </div>

              {loading ? (
                <div className={styles.loading}>
                  <Spinner size="large" />
                </div>
              ) : rows.length === 0 ? (
                <div className={styles.emptyState}>
                  <Text size={400}>{t('data.noData')}</Text>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {currentTable?.columns.map(col => (
                          <TableHeaderCell key={col.name}>
                            {col.name}
                          </TableHeaderCell>
                        ))}
                        <TableHeaderCell style={{ width: 100 }}>
                          {t('common.actions')}
                        </TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, idx) => (
                        <TableRow key={idx}>
                          {currentTable?.columns.map(col => (
                            <TableCell key={col.name}>
                              {row[col.name] !== null && row[col.name] !== undefined
                                ? String(row[col.name])
                                : '-'}
                            </TableCell>
                          ))}
                          <TableCell>
                            <Button
                              size="small"
                              icon={<EditRegular />}
                              appearance="subtle"
                              onClick={() => handleEditRow(row)}
                            />
                            <Button
                              size="small"
                              icon={<DeleteRegular />}
                              appearance="subtle"
                              onClick={() => handleDeleteRow(row)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className={styles.pagination}>
                    <Button
                      icon={<ChevronLeftRegular />}
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      {t('data.prev')}
                    </Button>
                    <Text size={300}>
                      {t('data.pageInfo', { current: currentPage, total: totalPages })}
                    </Text>
                    <Button
                      icon={<ChevronRightRegular />}
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                    >
                      {t('data.next')}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={(_, data) => setEditDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {editingRow ? t('data.editRow') : t('data.addRow')}
            </DialogTitle>
            <DialogContent>
              {currentTable?.columns.map(col => (
                <Field key={col.name} label={col.name}>
                  <Input
                    value={editValues[col.name] !== undefined ? String(editValues[col.name]) : ''}
                    onChange={(_, data) => setEditValues({ ...editValues, [col.name]: data.value })}
                    disabled={col.name === 'id'}
                  />
                </Field>
              ))}
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.cancel')}</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleSaveRow}>
                {t('common.save')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
