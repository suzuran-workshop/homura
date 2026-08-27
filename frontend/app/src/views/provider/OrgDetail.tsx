import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Spinner,
  Tab,
  TabList,
  Text,
  Card,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  ChevronLeftRegular,
  BuildingRegular,
} from '@fluentui/react-icons'
import { listOrgs, type Org } from '../../api/org'
import { DepartmentManager } from '../../components/org/DepartmentManager'
import { MemberManager } from '../../components/org/MemberManager'
import { RoleManager } from '../../components/org/RoleManager'
import { WorkflowManager } from '../../components/org/WorkflowManager'
import { MyTasks } from '../../components/org/MyTasks'

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
  orgCard: {
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
  },
  orgIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    flexShrink: 0,
  },
  orgInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
})

export const OrgDetail: React.FC = () => {
  const styles = useStyles()
  const navigate = useNavigate()
  const { orgId } = useParams<{ orgId: string }>()
  const { t } = useTranslation()

  const [org, setOrg] = useState<Org | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTab, setSelectedTab] = useState<string>('departments')

  useEffect(() => {
    loadOrg()
  }, [orgId])

  const loadOrg = async () => {
    try {
      const orgs = await listOrgs()
      const found = orgs.find(o => o.id === parseInt(orgId!))
      setOrg(found || null)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
        <Spinner size="large" />
      </div>
    )
  }

  if (!org) {
    return <Text>{t('common.error')}</Text>
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Button icon={<ChevronLeftRegular />} appearance="subtle" onClick={() => navigate('/provider/orgs')} />
        <Text size={600} weight="semibold">{t('orgs.detail')}</Text>
      </div>

      <Card className={styles.orgCard}>
        <div className={styles.orgIcon}>
          <BuildingRegular />
        </div>
        <div className={styles.orgInfo}>
          <Text size={500} weight="semibold">{org.name}</Text>
          <Text size={200}>{t('orgs.orgId')}: {org.id}</Text>
          {org.description && <Text size={200}>{org.description}</Text>}
        </div>
      </Card>

      <TabList selectedValue={selectedTab} onTabSelect={(_, data) => setSelectedTab(data.value as string)}>
        <Tab value="departments">{t('orgs.departments')}</Tab>
        <Tab value="members">{t('orgs.members')}</Tab>
        <Tab value="roles">{t('roles.title')}</Tab>
        <Tab value="workflows">{t('orgs.workflows')}</Tab>
        <Tab value="tasks">{t('myTasks.title')}</Tab>
      </TabList>

      {selectedTab === 'departments' && <DepartmentManager orgId={org.id} />}
      {selectedTab === 'members' && <MemberManager orgId={org.id} />}
      {selectedTab === 'roles' && <RoleManager orgId={org.id} />}
      {selectedTab === 'workflows' && <WorkflowManager orgId={org.id} />}
      {selectedTab === 'tasks' && <MyTasks orgId={org.id} />}
    </div>
  )
}
