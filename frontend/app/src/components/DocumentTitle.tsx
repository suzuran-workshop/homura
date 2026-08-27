import { useEffect } from 'react'
import { useMatches } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function DocumentTitle() {
  const matches = useMatches()
  const { t, i18n } = useTranslation()

  useEffect(() => {
    const updateTitle = () => {
      // 找到最后一个有 titleKey 的路由（从当前路由向上查找）
      const matchWithTitle = [...matches].reverse().find(
        (match) => (match.handle as any)?.titleKey
      )

      const titleKey = (matchWithTitle?.handle as any)?.titleKey

      if (titleKey) {
        const pageTitle = t(titleKey)
        const appName = t('app.name')
        document.title = `${pageTitle} - ${appName}`
      } else {
        // 默认标题
        document.title = t('app.name')
      }
    }

    updateTitle()

    // 监听语言变化事件
    i18n.on('languageChanged', updateTitle)

    return () => {
      i18n.off('languageChanged', updateTitle)
    }
  }, [matches, t, i18n])

  return null
}
