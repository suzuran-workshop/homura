import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Card,
  makeStyles,
  tokens,
  Spinner,
  Text,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components'
import { useLanguageStore } from '../stores/language'
import { useAuthStore } from '../stores/auth'
import apiClient from '../api/client'

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: `linear-gradient(135deg, ${tokens.colorBrandBackground2} 0%, ${tokens.colorNeutralBackground3} 100%)`,
    padding: tokens.spacingHorizontalXXL,
    position: 'relative',
  },
  languageSwitcher: {
    position: 'absolute',
    top: tokens.spacingVerticalXXL,
    right: tokens.spacingHorizontalXXL,
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  card: {
    maxWidth: '440px',
    width: '100%',
    padding: `${tokens.spacingVerticalXXXL} ${tokens.spacingHorizontalXXXL}`,
    boxShadow: tokens.shadow64,
    borderRadius: tokens.borderRadiusLarge,
  },
  header: {
    textAlign: 'center',
    marginBottom: tokens.spacingVerticalXXL,
  },
  spinnerContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalXXL,
  },
  orgList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalL,
  },
  orgItem: {
    padding: tokens.spacingVerticalM,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    transition: `background-color ${tokens.durationFast} ${tokens.curveEasyEase}`,
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  orgName: {
    fontWeight: tokens.fontWeightSemibold,
  },
  orgRole: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
  },
})

interface OrgChoice {
  orgId: number
  orgName: string
  isAdmin: boolean
}

export const Callback: React.FC = () => {
  const styles = useStyles()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const { language, setLanguage } = useLanguageStore()
  const { setUser, setTokens } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [orgs, setOrgs] = useState<OrgChoice[]>([])
  const [sessionId, setSessionId] = useState('')

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code')
      const state = searchParams.get('state')

      if (!code || !state) {
        setError('Invalid callback parameters')
        setLoading(false)
        return
      }

      try {
        const response = await apiClient.post('/oauth/dingtalk/callback', {
          code,
          state,
        })

        const { sessionId, availableOrgs } = response.data

        if (availableOrgs.length === 1) {
          // Auto-select if only one org
          const org = availableOrgs[0]
          const tokenRes = await apiClient.post('/oauth/session/token', {
            sessionId,
            orgId: org.orgId,
          })

          setTokens(tokenRes.data.access_token, tokenRes.data.refresh_token)
          setUser({
            id: 0, // Will be fetched from backend
            name: '',
            email: '',
            role: org.isAdmin ? 'provider' : 'user',
            orgId: org.orgId,
          })

          navigate(org.isAdmin ? '/provider/dashboard' : '/user/apps')
        } else {
          // Show org selector
          setOrgs(availableOrgs)
          setSessionId(sessionId)
          setLoading(false)
        }
      } catch (err: any) {
        setError(err.response?.data?.error || 'Login failed')
        setLoading(false)
      }
    }

    handleCallback()
  }, [searchParams, navigate, setTokens, setUser])

  const handleOrgSelect = async (org: OrgChoice) => {
    try {
      const tokenRes = await apiClient.post('/oauth/session/token', {
        sessionId,
        orgId: org.orgId,
      })

      setTokens(tokenRes.data.access_token, tokenRes.data.refresh_token)
      setUser({
        id: 0,
        name: '',
        email: '',
        role: org.isAdmin ? 'provider' : 'user',
        orgId: org.orgId,
      })

      navigate(org.isAdmin ? '/provider/dashboard' : '/user/apps')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to select organization')
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.languageSwitcher}>
        <Button
          size="small"
          appearance={language === 'zh' ? 'primary' : 'subtle'}
          onClick={() => setLanguage('zh')}
        >
          中文
        </Button>
        <Button
          size="small"
          appearance={language === 'en' ? 'primary' : 'subtle'}
          onClick={() => setLanguage('en')}
        >
          EN
        </Button>
      </div>

      <Card className={styles.card}>
        <div className={styles.header}>
          <Text size={800} weight="semibold">
            {t('app.name')}
          </Text>
        </div>

        {error && (
          <MessageBar intent="error" style={{ marginBottom: tokens.spacingVerticalL }}>
            <MessageBarBody>
              <MessageBarTitle>{t('common.error')}</MessageBarTitle>
              {error}
            </MessageBarBody>
          </MessageBar>
        )}

        {loading ? (
          <div className={styles.spinnerContainer}>
            <Spinner size="large" />
            <Text size={400}>{t('callback.processing')}</Text>
          </div>
        ) : orgs.length > 0 ? (
          <>
            <Text size={500} weight="semibold">
              {t('callback.selectOrg')}
            </Text>
            <div className={styles.orgList}>
              {orgs.map((org) => (
                <div
                  key={org.orgId}
                  className={styles.orgItem}
                  onClick={() => handleOrgSelect(org)}
                >
                  <div className={styles.orgName}>{org.orgName}</div>
                  <div className={styles.orgRole}>
                    {org.isAdmin ? t('callback.admin') : t('callback.member')}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Card>
    </div>
  )
}
