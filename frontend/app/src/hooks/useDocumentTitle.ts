import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export function useDocumentTitle(titleKey: string) {
  const { t } = useTranslation()

  useEffect(() => {
    const appName = t('app.name')
    const pageTitle = t(titleKey)
    document.title = `${pageTitle} - ${appName}`
  }, [t, titleKey])
}
