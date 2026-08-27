import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Card,
  Field,
  Input,
  makeStyles,
  tokens,
  Text,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components'
import { useLanguageStore } from '../stores/language'
import apiClient from '../api/client'
import { registerPasskey, isWebAuthnSupported } from '../api/webauthn'

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
    maxWidth: '480px',
    width: '100%',
    padding: `${tokens.spacingVerticalXXXL} ${tokens.spacingHorizontalXXXL}`,
    boxShadow: tokens.shadow64,
    borderRadius: tokens.borderRadiusLarge,
  },
  header: {
    textAlign: 'center',
    marginBottom: tokens.spacingVerticalXXL,
  },
  stepper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacingVerticalXXL,
    gap: tokens.spacingHorizontalM,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  stepCircle: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
  },
  stepActive: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepCompleted: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
  stepInactive: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
  },
  stepLine: {
    width: '40px',
    height: '2px',
    backgroundColor: tokens.colorNeutralStroke1,
  },
  stepLineCompleted: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  stepTitle: {
    marginBottom: tokens.spacingVerticalL,
  },
  stepDescription: {
    marginBottom: tokens.spacingVerticalXL,
    color: tokens.colorNeutralForeground2,
  },
  buttonGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalXL,
  },
  successContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalXXL,
  },
  successIcon: {
    width: '64px',
    height: '64px',
    color: tokens.colorPaletteGreenForeground1,
  },
})

export const OOBE: React.FC = () => {
  const styles = useStyles()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { language, setLanguage } = useLanguageStore()

  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1: Admin account
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [orgName, setOrgName] = useState('')

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await apiClient.post('/oobe/setup', {
        adminName,
        adminEmail,
        adminUsername,
        adminPassword,
        orgName,
      })
      setCurrentStep(2)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create admin account')
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterPasskey = async () => {
    if (!isWebAuthnSupported()) {
      setError(t('oobe.step2.webauthnNotSupported'))
      return
    }

    setLoading(true)
    setError('')

    try {
      await registerPasskey()
      setCurrentStep(3)
    } catch (err: any) {
      if (err.message !== 'Passkey registration cancelled') {
        setError(err.response?.data?.error || err.message || t('oobe.step2.registerFailed'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSkipPasskey = () => {
    setCurrentStep(3)
  }

  const handleComplete = () => {
    navigate('/login')
  }

  const getStepClass = (step: number) => {
    if (step < currentStep) return `${styles.stepCircle} ${styles.stepCompleted}`
    if (step === currentStep) return `${styles.stepCircle} ${styles.stepActive}`
    return `${styles.stepCircle} ${styles.stepInactive}`
  }

  const getLineClass = (step: number) => {
    if (step < currentStep) return `${styles.stepLine} ${styles.stepLineCompleted}`
    return styles.stepLine
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
            {t('oobe.title')}
          </Text>
        </div>

        {/* Stepper */}
        <div className={styles.stepper}>
          <div className={styles.step}>
            <div className={getStepClass(1)}>1</div>
          </div>
          <div className={getLineClass(1)} />
          <div className={styles.step}>
            <div className={getStepClass(2)}>2</div>
          </div>
          <div className={getLineClass(2)} />
          <div className={styles.step}>
            <div className={getStepClass(3)}>3</div>
          </div>
        </div>

        {error && (
          <MessageBar intent="error" style={{ marginBottom: tokens.spacingVerticalL }}>
            <MessageBarBody>
              <MessageBarTitle>{t('common.error')}</MessageBarTitle>
              {error}
            </MessageBarBody>
          </MessageBar>
        )}

        {/* Step 1: Create Admin */}
        {currentStep === 1 && (
          <form className={styles.form} onSubmit={handleStep1Submit}>
            <Text size={500} weight="semibold" className={styles.stepTitle}>
              {t('oobe.step1.title')}
            </Text>

            <Field label={t('oobe.step1.name')}>
              <Input
                size="large"
                contentBefore={<span style={{ fontSize: 16 }}>👤</span>}
                value={adminName}
                onChange={(_, data) => setAdminName(data.value)}
                required
              />
            </Field>

            <Field label={t('oobe.step1.email')}>
              <Input
                size="large"
                type="email"
                contentBefore={<span style={{ fontSize: 16 }}>📧</span>}
                value={adminEmail}
                onChange={(_, data) => setAdminEmail(data.value)}
                required
              />
            </Field>

            <Field label={t('oobe.step1.username')}>
              <Input
                size="large"
                contentBefore={<span style={{ fontSize: 16 }}>👤</span>}
                value={adminUsername}
                onChange={(_, data) => setAdminUsername(data.value)}
                required
              />
            </Field>

            <Field label={t('oobe.step1.password')}>
              <Input
                size="large"
                type="password"
                contentBefore={<span style={{ fontSize: 16 }}>🔒</span>}
                value={adminPassword}
                onChange={(_, data) => setAdminPassword(data.value)}
                required
              />
            </Field>

            <Field label={t('oobe.step1.orgName')}>
              <Input
                size="large"
                contentBefore={<span style={{ fontSize: 16 }}>🏢</span>}
                value={orgName}
                onChange={(_, data) => setOrgName(data.value)}
                required
              />
            </Field>

            <Button
              type="submit"
              appearance="primary"
              size="large"
              disabled={loading}
              style={{ marginTop: tokens.spacingVerticalS }}
            >
              {loading ? t('common.loading') : t('oobe.next')}
            </Button>
          </form>
        )}

        {/* Step 2: Register Passkey */}
        {currentStep === 2 && (
          <div>
            <Text size={500} weight="semibold" className={styles.stepTitle}>
              {t('oobe.step2.title')}
            </Text>
            <Text size={400} className={styles.stepDescription}>
              {t('oobe.step2.description')}
            </Text>

            <div className={styles.buttonGroup}>
              <Button
                appearance="primary"
                size="large"
                icon={<span style={{ fontSize: 20 }}>🔑</span>}
                onClick={handleRegisterPasskey}
                disabled={loading}
                style={{ flex: 1 }}
              >
                {loading ? t('common.loading') : t('oobe.step2.register')}
              </Button>
              <Button
                appearance="secondary"
                size="large"
                onClick={handleSkipPasskey}
                style={{ flex: 1 }}
              >
                {t('oobe.step2.skip')}
              </Button>
            </div>

            <Button
              appearance="subtle"
              size="small"
              onClick={() => setCurrentStep(1)}
              style={{ marginTop: tokens.spacingVerticalL }}
            >
              {t('oobe.back')}
            </Button>
          </div>
        )}

        {/* Step 3: Complete */}
        {currentStep === 3 && (
          <div className={styles.successContainer}>
            <div style={{
              fontSize: 64,
              color: tokens.colorPaletteGreenForeground1
            }}>
              ✅
            </div>
            <Text size={600} weight="semibold">
              {t('oobe.step3.title')}
            </Text>
            <Text size={400} align="center">
              {t('oobe.step3.description')}
            </Text>
            <Button
              appearance="primary"
              size="large"
              onClick={handleComplete}
              style={{ marginTop: tokens.spacingVerticalL }}
            >
              {t('oobe.step3.goToLogin')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
