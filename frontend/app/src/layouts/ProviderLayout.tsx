import React from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { NavItem } from '../components/NavItem'
import {
  DashboardRegular,
  AppsRegular,
  ShareRegular,
  PeopleRegular,
  ToolboxRegular,
  DocumentBulletListRegular,
  DocumentRegular,
  ChatRegular,
} from '@fluentui/react-icons'

export const ProviderLayout: React.FC = () => {
  const { t } = useTranslation()

  return (
    <AppShell
      titleKey="layout.provider"
      nav={
        <>
          <NavItem to="/provider/dashboard" icon={<DashboardRegular />} label={t('nav.dashboard')} />
          <NavItem to="/provider/apps" icon={<AppsRegular />} label={t('nav.apps')} />
          <NavItem to="/provider/distribution" icon={<ShareRegular />} label={t('nav.distribution')} />
          <NavItem to="/provider/orgs" icon={<PeopleRegular />} label={t('nav.organizations')} />
          <NavItem to="/provider/mcp/tools" icon={<ToolboxRegular />} label={t('mcp.tools')} />
          <NavItem to="/provider/mcp/logs" icon={<DocumentBulletListRegular />} label={t('mcp.logs')} />
          <NavItem to="/provider/files" icon={<DocumentRegular />} label={t('nav.files')} />
          <NavItem to="/provider/chat" icon={<ChatRegular />} label={t('nav.chat')} />
        </>
      }
    />
  )
}
