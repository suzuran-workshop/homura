import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Field,
  Input,
  Card,
  Text,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  tokens,
  Spinner,
} from '@fluentui/react-components'
import {
  Eye20Regular,
  EyeOff20Regular,
  Fingerprint20Regular,
  PersonCircle20Regular,
  Person20Regular,
  LockClosed20Regular,
} from '@fluentui/react-icons'
import { useAuthStore } from '../stores/auth'
import { loginWithPassword, exchangeSessionToken, getDingTalkAuthorizeURL, type OrgChoice } from '../api/oauth'
import { loginWithPasskey, isWebAuthnSupported } from '../api/webauthn'
import { useLanguageStore } from '../stores/language'

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
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalM,
  },
  divider: {
    marginTop: tokens.spacingVerticalXXL,
    marginBottom: tokens.spacingVerticalL,
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

type LoginView = 'form' | 'orgSelect'

export const Login: React.FC = () => {
  const styles = useStyles()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { language, setLanguage } = useLanguageStore()
  const { setUser, setTokens } = useAuthStore()

  const [view, setView] = useState<LoginView>('form')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({})

  // Multi-org state
  const [sessionId, setSessionId] = useState('')
  const [availableOrgs, setAvailableOrgs] = useState<OrgChoice[]>([])
  const [loginUserId, setLoginUserId] = useState(0)

  const validate = () => {
    const errors: typeof fieldErrors = {}
    if (!username) errors.username = t('validation.required')
    if (!password) errors.password = t('validation.required')
    else if (password.length < 6) errors.password = t('validation.minLength', { count: 6 })
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const completeLogin = async (sid: string, org: OrgChoice, userId: number, uname: string) => {
    const tokenRes = await exchangeSessionToken(sid, org.orgId)
    setTokens(tokenRes.access_token, tokenRes.refresh_token)
    setUser({
      id: userId,
      name: uname,
      email: '',
      role: org.isAdmin ? 'provider' : 'user',
      orgId: org.orgId,
    })
    navigate(org.isAdmin ? '/provider/dashboard' : '/user/apps')
  }

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setErrorMessage('')

    try {
      const result = await loginWithPassword(username, password)

      if (result.availableOrgs.length === 1) {
        await completeLogin(result.sessionId, result.availableOrgs[0], result.userId, username)
      } else if (result.availableOrgs.length > 1) {
        // Show org selector
        setSessionId(result.sessionId)
        setAvailableOrgs(result.availableOrgs)
        setLoginUserId(result.userId)
        setView('orgSelect')
      } else {
        setErrorMessage(t('login.noOrgs'))
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || t('login.failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleOrgSelect = async (org: OrgChoice) => {
    setLoading(true)
    setErrorMessage('')
    try {
      await completeLogin(sessionId, org, loginUserId, username)
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || t('login.failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleBackToForm = () => {
    setView('form')
    setSessionId('')
    setAvailableOrgs([])
    setErrorMessage('')
  }

  const handlePasskeyLogin = async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const result = await loginWithPasskey()

      // Passkey login returns session info
      if (result.availableOrgs && result.availableOrgs.length === 1) {
        await completeLogin(result.sessionId, result.availableOrgs[0], result.userId, '')
      } else if (result.availableOrgs && result.availableOrgs.length > 1) {
        setSessionId(result.sessionId)
        setAvailableOrgs(result.availableOrgs)
        setLoginUserId(result.userId)
        setView('orgSelect')
      } else {
        setErrorMessage(t('login.passkeyFailed'))
      }
    } catch (err: any) {
      if (err.message === 'Passkey login cancelled') {
        setErrorMessage('')
      } else {
        setErrorMessage(err.response?.data?.error || err.message || t('login.passkeyFailed'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDingTalkLogin = async () => {
    try {
      const redirectURI = `${window.location.origin}/oauth/callback`
      const { url } = await getDingTalkAuthorizeURL(redirectURI)
      window.location.href = url
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || t('login.dingtalkFailed'))
    }
  }

  return (
    <div className={styles.container}>
      {/* Language Switcher */}
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
            {t('login.title')}
          </Text>
        </div>

        {errorMessage && (
          <MessageBar intent="error" style={{ marginBottom: tokens.spacingVerticalL }}>
            <MessageBarBody>
              <MessageBarTitle>{t('common.error')}</MessageBarTitle>
              {errorMessage}
            </MessageBarBody>
          </MessageBar>
        )}

        {view === 'form' ? (
          <>
            <form className={styles.form} onSubmit={handlePasswordLogin}>
              <Field
                label={t('login.username')}
                validationMessage={fieldErrors.username}
                validationState={fieldErrors.username ? 'error' : undefined}
              >
                <Input
                  size="large"
                  contentBefore={<Person20Regular />}
                  value={username}
                  onChange={(_, data) => setUsername(data.value)}
                  placeholder={t('login.username.placeholder')}
                  disabled={loading}
                />
              </Field>

              <Field
                label={t('login.password')}
                validationMessage={fieldErrors.password}
                validationState={fieldErrors.password ? 'error' : undefined}
              >
                <Input
                  size="large"
                  contentBefore={<LockClosed20Regular />}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(_, data) => setPassword(data.value)}
                  placeholder={t('login.password.placeholder')}
                  disabled={loading}
                  contentAfter={
                    <Button
                      icon={showPassword ? <EyeOff20Regular /> : <Eye20Regular />}
                      appearance="transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      size="small"
                    />
                  }
                />
              </Field>

              <Button
                type="submit"
                appearance="primary"
                disabled={loading}
                icon={loading ? <Spinner size="tiny" /> : undefined}
                size="large"
                style={{ marginTop: tokens.spacingVerticalS }}
              >
                {loading ? t('login.submitting') : t('login.submit')}
              </Button>
            </form>

            <Divider className={styles.divider}>{t('login.otherMethods')}</Divider>

            <div className={styles.actions}>
              <Button
                icon={<Fingerprint20Regular />}
                appearance="outline"
                size="large"
                disabled={!isWebAuthnSupported() || loading}
                onClick={handlePasskeyLogin}
                style={{ width: '100%' }}
              >
                {t('login.passkey')}
              </Button>
              <Button
                icon={<PersonCircle20Regular />}
                appearance="outline"
                size="large"
                onClick={handleDingTalkLogin}
                disabled={loading}
                style={{ width: '100%' }}
              >
                {t('login.dingtalk')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Text size={500} weight="semibold">
              {t('login.selectOrg')}
            </Text>
            <div className={styles.orgList}>
              {availableOrgs.map((org) => (
                <div
                  key={org.orgId}
                  className={styles.orgItem}
                  onClick={() => !loading && handleOrgSelect(org)}
                >
                  <div className={styles.orgName}>{org.orgName}</div>
                  <div className={styles.orgRole}>
                    {org.isAdmin ? t('callback.admin') : t('callback.member')}
                  </div>
                </div>
              ))}
            </div>
            <Button
              appearance="subtle"
              size="small"
              onClick={handleBackToForm}
              disabled={loading}
              style={{ marginTop: tokens.spacingVerticalL }}
            >
              {t('common.cancel')}
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
