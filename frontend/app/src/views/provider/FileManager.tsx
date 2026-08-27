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
  DeleteRegular,
  ArrowDownloadRegular,
  ArrowSyncRegular,
  DocumentRegular,
} from '@fluentui/react-icons'
import { fileApi, type FileInfo } from '../../api/file'

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
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  table: {
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
  fileIcon: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
})

export const FileManager: React.FC = () => {
  const styles = useStyles()
  const { t } = useTranslation()

  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<FileInfo | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadFiles()
  }, [])

  const loadFiles = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fileApi.list()
      setFiles(response.files)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (file: FileInfo) => {
    try {
      const { url } = await fileApi.getDownloadUrl(file.key)
      window.open(url, '_blank')
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const handleDeleteClick = (file: FileInfo) => {
    setFileToDelete(file)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return

    setDeleting(true)
    setError(null)
    try {
      await fileApi.delete(fileToDelete.key)
      setDeleteDialogOpen(false)
      setFileToDelete(null)
      loadFiles()
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setDeleting(false)
    }
  }

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString()
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
          <DocumentRegular style={{ fontSize: 24 }} />
          <Text size={600} weight="semibold">{t('files.title')}</Text>
        </div>
        <div className={styles.actions}>
          <Button icon={<ArrowSyncRegular />} onClick={loadFiles}>
            {t('common.refresh')}
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

      <Field label={t('files.search')}>
        <Input
          value={searchTerm}
          onChange={(_, data) => setSearchTerm(data.value)}
          placeholder={t('files.searchPlaceholder')}
        />
      </Field>

      {filteredFiles.length === 0 ? (
        <div className={styles.emptyState}>
          <DocumentRegular style={{ fontSize: 48, color: tokens.colorNeutralForeground3 }} />
          <Text size={400}>{t('files.noFiles')}</Text>
          <Text size={200}>{t('files.noFilesHint')}</Text>
        </div>
      ) : (
        <Table className={styles.table}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{t('files.name')}</TableHeaderCell>
              <TableHeaderCell>{t('files.size')}</TableHeaderCell>
              <TableHeaderCell>{t('files.lastModified')}</TableHeaderCell>
              <TableHeaderCell>{t('common.actions')}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFiles.map(file => (
              <TableRow key={file.key}>
                <TableCell>
                  <div className={styles.fileIcon}>
                    <DocumentRegular style={{ fontSize: 16 }} />
                    <Text>{file.name}</Text>
                  </div>
                </TableCell>
                <TableCell>{formatFileSize(file.size)}</TableCell>
                <TableCell>{formatDate(file.lastModified)}</TableCell>
                <TableCell>
                  <div className={styles.actions}>
                    <Button
                      size="small"
                      icon={<ArrowDownloadRegular />}
                      onClick={() => handleDownload(file)}
                    >
                      {t('files.download')}
                    </Button>
                    <Button
                      size="small"
                      icon={<DeleteRegular />}
                      appearance="subtle"
                      onClick={() => handleDeleteClick(file)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={(_, data) => setDeleteDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('files.deleteTitle')}</DialogTitle>
            <DialogContent>
              <Text>{t('files.deleteConfirm', { name: fileToDelete?.name })}</Text>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">{t('common.cancel')}</Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {t('common.delete')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
