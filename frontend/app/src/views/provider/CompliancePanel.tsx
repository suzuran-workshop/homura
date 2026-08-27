import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Card,
  Text,
  Spinner,
  Badge,
  ProgressBar,
  makeStyles,
  tokens,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
} from '@fluentui/react-components'
import {
  ShieldCheckmarkRegular,
  ArrowDownloadRegular,
  ArrowSyncRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  WarningRegular,
} from '@fluentui/react-icons'
import { complianceApi, type ComplianceReport, type ComplianceSummary } from '../../api/compliance'

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
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  summaryCard: {
    padding: tokens.spacingVerticalL + ' ' + tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  summaryValue: {
    fontSize: '32px',
    fontWeight: tokens.fontWeightBold,
    lineHeight: 1,
  },
  scoreCard: {
    padding: tokens.spacingVerticalXXL + ' ' + tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
  },
  scoreCircle: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '36px',
    fontWeight: tokens.fontWeightBold,
    border: `4px solid ${tokens.colorBrandStroke1}`,
  },
  checksSection: {
    marginTop: tokens.spacingVerticalM,
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  checkDetails: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
    gap: tokens.spacingVerticalM,
  },
})

export const CompliancePanel: React.FC = () => {
  const styles = useStyles()
  const { t } = useTranslation()

  const [summary, setSummary] = useState<ComplianceSummary | null>(null)
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [summaryData, reportData] = await Promise.all([
        complianceApi.getSummary(),
        complianceApi.getLatestReport(),
      ])
      setSummary(summaryData)
      setReport(reportData)
    } catch (error) {
      console.error('Failed to load compliance data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateReport = async () => {
    setGenerating(true)
    try {
      const newReport = await complianceApi.generateReport()
      setReport(newReport)
      await loadData()
    } catch (error) {
      console.error('Failed to generate report:', error)
    } finally {
      setGenerating(false)
    }
  }

  const handleExportReport = async (format: 'pdf' | 'json') => {
    if (!report) return
    try {
      const blob = await complianceApi.exportReport(report.id, format)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `compliance-report-${report.id}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to export report:', error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckmarkCircleRegular style={{ color: tokens.colorPaletteGreenForeground1 }} />
      case 'fail':
        return <DismissCircleRegular style={{ color: tokens.colorPaletteRedForeground1 }} />
      case 'warning':
        return <WarningRegular style={{ color: tokens.colorPaletteYellowForeground1 }} />
      default:
        return <Spinner size="tiny" />
    }
  }

  const getStatusColor = (status: string): 'success' | 'danger' | 'warning' | 'informative' => {
    switch (status) {
      case 'pass':
        return 'success'
      case 'fail':
        return 'danger'
      case 'warning':
        return 'warning'
      default:
        return 'informative'
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return tokens.colorPaletteGreenForeground1
    if (score >= 70) return tokens.colorPaletteYellowForeground1
    return tokens.colorPaletteRedForeground1
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
        <Spinner size="large" />
      </div>
    )
  }

  if (!summary) {
    return (
      <div className={styles.emptyState}>
        <ShieldCheckmarkRegular style={{ fontSize: 48, color: tokens.colorNeutralForeground3 }} />
        <Text size={400}>{t('compliance.noData')}</Text>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <ShieldCheckmarkRegular style={{ fontSize: 24 }} />
          <Text size={600} weight="semibold">{t('compliance.title')}</Text>
        </div>
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
          <Button
            icon={<ArrowSyncRegular />}
            onClick={loadData}
            disabled={generating}
          >
            {t('common.refresh')}
          </Button>
          <Button
            appearance="primary"
            icon={generating ? <Spinner size="tiny" /> : <ArrowSyncRegular />}
            onClick={handleGenerateReport}
            disabled={generating}
          >
            {t('compliance.generateReport')}
          </Button>
        </div>
      </div>

      {/* 总体评分 */}
      <Card className={styles.scoreCard}>
        <div
          className={styles.scoreCircle}
          style={{ color: getScoreColor(summary.overallScore) }}
        >
          {summary.overallScore}
        </div>
        <Text size={400} weight="semibold">{t('compliance.overallScore')}</Text>
        {summary.lastGeneratedAt && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {t('compliance.lastGenerated')}: {new Date(summary.lastGeneratedAt).toLocaleString()}
          </Text>
        )}
      </Card>

      {/* 统计摘要 */}
      <div className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <Text size={300}>{t('compliance.totalChecks')}</Text>
          <Text className={styles.summaryValue}>{summary.totalChecks}</Text>
        </Card>
        <Card className={styles.summaryCard}>
          <Text size={300}>{t('compliance.passed')}</Text>
          <Text className={styles.summaryValue} style={{ color: tokens.colorPaletteGreenForeground1 }}>
            {summary.passedChecks}
          </Text>
          <ProgressBar
            value={summary.totalChecks > 0 ? (summary.passedChecks / summary.totalChecks) * 100 : 0}
            color="success"
          />
        </Card>
        <Card className={styles.summaryCard}>
          <Text size={300}>{t('compliance.failed')}</Text>
          <Text className={styles.summaryValue} style={{ color: tokens.colorPaletteRedForeground1 }}>
            {summary.failedChecks}
          </Text>
          <ProgressBar
            value={summary.totalChecks > 0 ? (summary.failedChecks / summary.totalChecks) * 100 : 0}
            color="error"
          />
        </Card>
        <Card className={styles.summaryCard}>
          <Text size={300}>{t('compliance.warnings')}</Text>
          <Text className={styles.summaryValue} style={{ color: tokens.colorPaletteYellowForeground1 }}>
            {summary.warningChecks}
          </Text>
          <ProgressBar
            value={summary.totalChecks > 0 ? (summary.warningChecks / summary.totalChecks) * 100 : 0}
            color="warning"
          />
        </Card>
      </div>

      {/* 导出按钮 */}
      {report && (
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, justifyContent: 'flex-end' }}>
          <Button
            icon={<ArrowDownloadRegular />}
            onClick={() => handleExportReport('pdf')}
          >
            {t('compliance.exportPDF')}
          </Button>
          <Button
            icon={<ArrowDownloadRegular />}
            onClick={() => handleExportReport('json')}
          >
            {t('compliance.exportJSON')}
          </Button>
        </div>
      )}

      {/* 检查项详情 */}
      {report && report.checks.length > 0 && (
        <Card className={styles.checksSection}>
          <Text size={400} weight="semibold" style={{ marginBottom: tokens.spacingVerticalM }}>
            {t('compliance.checkDetails')}
          </Text>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t('compliance.category')}</TableHeaderCell>
                <TableHeaderCell>{t('compliance.checkName')}</TableHeaderCell>
                <TableHeaderCell>{t('compliance.severity')}</TableHeaderCell>
                <TableHeaderCell>{t('compliance.status')}</TableHeaderCell>
                <TableHeaderCell>{t('compliance.lastChecked')}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.checks.map((check) => (
                <TableRow key={check.id}>
                  <TableCell>{check.category}</TableCell>
                  <TableCell>
                    <Text weight="semibold">{check.name}</Text>
                    {check.details && (
                      <div className={styles.checkDetails}>{check.details}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      appearance="filled"
                      color={
                        check.severity === 'high'
                          ? 'danger'
                          : check.severity === 'medium'
                          ? 'warning'
                          : 'informative'
                      }
                    >
                      {t(`compliance.severity.${check.severity}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={styles.statusBadge}>
                      {getStatusIcon(check.status)}
                      <Badge appearance="filled" color={getStatusColor(check.status)}>
                        {t(`compliance.status.${check.status}`)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Text size={200}>
                      {new Date(check.lastChecked).toLocaleString()}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
