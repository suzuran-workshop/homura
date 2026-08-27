import React from 'react'
import { useToastStore } from '../stores/toast'
import {
  Toast,
  ToastBody,
  ToastTitle,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  CheckmarkCircle24Regular,
  DismissCircle24Regular,
  Warning24Regular,
  Info24Regular,
  Dismiss20Regular,
} from '@fluentui/react-icons'

const useStyles = makeStyles({
  container: {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    maxWidth: '480px',
    width: '100%',
  },
  success: {
    backgroundColor: tokens.colorStatusSuccessBackground3,
  },
  error: {
    backgroundColor: tokens.colorStatusDangerBackground3,
  },
  warning: {
    backgroundColor: tokens.colorStatusWarningBackground3,
  },
  info: {
    backgroundColor: tokens.colorBrandBackground,
  },
})

export const ToastMessage: React.FC = () => {
  const styles = useStyles()
  const { visible, text, intent, hide } = useToastStore()

  if (!visible) return null

  const iconMap = {
    success: <CheckmarkCircle24Regular />,
    error: <DismissCircle24Regular />,
    warning: <Warning24Regular />,
    info: <Info24Regular />,
  }

  return (
    <div className={styles.container}>
      <Toast className={styles[intent]}>
        {iconMap[intent]}
        <ToastBody>
          <ToastTitle>{text}</ToastTitle>
        </ToastBody>
        <Button
          icon={<Dismiss20Regular />}
          appearance="transparent"
          onClick={hide}
          aria-label="关闭"
        />
      </Toast>
    </div>
  )
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      {children}
      <ToastMessage />
    </>
  )
}
