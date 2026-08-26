<!-- 组织详情：头部卡片 + fluent-tablist 部门/成员 -->
<template>
  <div v-if="org">
    <fluent-button appearance="subtle" @click="router.push('/provider/orgs')" style="margin-bottom: var(--spacingVerticalM);">
      <i class="mdi mdi-arrow-left" style="font-size: 16px; margin-right: 4px;"</i>
      返回组织列表
    </fluent-button>

    <!-- 组织头部 -->
    <FluentCard style="margin-bottom: var(--spacingVerticalXL);">
      <div style="display: flex; align-items: center; gap: var(--spacingHorizontalM);">
        <div style="width: 56px; height: 56px; border-radius: var(--borderRadiusCircular); background: var(--colorBrandBackground); display: flex; align-items: center; justify-content: center;">
          <i class="mdi mdi-domain" style="font-size: 32px; color: #fff"</i>
        </div>
        <div>
          <div style="font-size: var(--fontSizeBase400); font-weight: var(--fontWeightBold);">{{ org.name }}</div>
          <div style="font-size: var(--fontSizeBase100); color: var(--colorNeutralForeground3); margin-top: var(--spacingVerticalXS);">ID: {{ org.id }}</div>
        </div>
      </div>
      <fluent-divider style="margin: var(--spacingVerticalM) 0;" />
      <div style="font-size: var(--fontSizeBase200); color: var(--colorNeutralForeground2);">{{ org.description || '暂无描述' }}</div>
    </FluentCard>

    <!-- 部门 / 成员 Tab -->
    <fluent-tablist :selected-value="activeTab" @change="activeTab = ($event.target as any).selectedValue" style="margin-bottom: var(--spacingVerticalM);">
      <fluent-tab value="departments">
        <i class="mdi mdi-folder" style="font-size: 16px; margin-right: 4px;"</i>
        部门
      </fluent-tab>
      <fluent-tab value="members">
        <i class="mdi mdi-account-group" style="font-size: 16px; margin-right: 4px;"</i>
        成员
      </fluent-tab>
    </fluent-tablist>

    <div v-if="activeTab === 'departments'">
      <DepartmentManager :org-id="orgId" />
    </div>
    <div v-if="activeTab === 'members'">
      <MemberManager :org-id="orgId" />
    </div>
  </div>

  <div v-else style="text-align: center; padding: var(--spacingVerticalXXXL);">
    <fluent-spinner size="large" />
    <div style="margin-top: var(--spacingVerticalM); color: var(--colorNeutralForeground3);">加载组织中...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { listOrgs, type Org } from '../../api/org'
import DepartmentManager from '../../components/org/DepartmentManager.vue'
import MemberManager from '../../components/org/MemberManager.vue'
import FluentCard from '../../components/FluentCard.vue'

const router = useRouter()
const route = useRoute()
const orgId = Number(route.params.orgId)

const org = ref<Org | null>(null)
const activeTab = ref('departments')

onMounted(async () => {
  try {
    const r = await listOrgs()
    org.value = r.data.find((o: Org) => o.id === orgId) ?? null
  } catch (err) {
    console.error('Failed to load org:', err)
  }
})
</script>
