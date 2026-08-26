<!-- frontend/app/src/views/provider/AppDistribution.vue -->
<template>
  <div>
    <h2 style="font-size: var(--fontSizeBase400); font-weight: var(--fontWeightSemibold); margin-bottom: var(--spacingVerticalM);">应用分发</h2>
    <p style="font-size: var(--fontSizeBase200); color: var(--colorNeutralForeground3); margin-bottom: var(--spacingVerticalM);">
      将应用分发给组织后，该组织成员即可在启动台看到此应用。每个组织可单独设置应用管理员（对应用数据拥有全部读写权限）。服务商天然是任何应用的管理员。
    </p>

    <FluentCard style="margin-bottom: var(--spacingVerticalM);">
      <fluent-field label="选择应用">
        <fluent-dropdown
          :value="selectedAppId"
          @change="selectedAppId = ($event.target as any).value; loadDistributions()"
          :disabled="appsLoading"
          style="width: 100%;"
        >
          <fluent-option v-for="app in apps" :key="app.id" :value="app.id">
            {{ app.name }}
          </fluent-option>
        </fluent-dropdown>
      </fluent-field>
    </FluentCard>

    <FluentCard v-if="selectedAppId">
      <template #header>
        <span style="font-size: var(--fontSizeBase300); font-weight: var(--fontWeightSemibold);">分发到组织（{{ distributions.length }}）</span>
      </template>

      <FluentTable v-if="orgs.length">
        <thead>
          <tr>
            <th>组织</th>
            <th>状态</th>
            <th>应用管理员</th>
            <th style="text-align: right;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="org in orgs" :key="org.id">
            <td>{{ org.name }}</td>
            <td>
              <FluentChip v-if="isDistributed(org.id)" color="success" small>已分发</FluentChip>
              <FluentChip v-else color="default" small variant="subtle">未分发</FluentChip>
            </td>
            <td>
              <template v-if="isDistributed(org.id)">
                <FluentChip
                  v-for="admin in adminsOf(org.id)"
                  :key="admin.userId"
                  small
                  closable
                  @close="removeAdmin(org.id, admin)"
                  style="margin-right: 4px; margin-bottom: 4px;"
                >
                  {{ admin.name }}{{ admin.username ? ` (${admin.username})` : '' }}
                </FluentChip>
                <FluentChip v-if="!adminsOf(org.id).length" variant="subtle" small style="margin-right: 4px;">无（仅服务商可管理）</FluentChip>
              </template>
              <span v-else style="color: var(--colorNeutralForeground3); font-size: var(--fontSizeBase100);">—</span>
            </td>
            <td style="text-align: right;">
              <fluent-button
                v-if="isDistributed(org.id)"
                appearance="subtle"
                size="small"
                @click="openAdminDialog(org)"
              >
                设管理员
              </fluent-button>
              <fluent-button
                v-if="isDistributed(org.id)"
                appearance="outline"
                size="small"
                @click="undistribute(org.id)"
                style="color: var(--colorPaletteRedForeground1);"
              >
                取消分发
              </fluent-button>
              <fluent-button v-else appearance="primary" size="small" @click="distribute(org.id)">
                分发
              </fluent-button>
            </td>
          </tr>
        </tbody>
      </FluentTable>
      <fluent-message-bar v-else intent="info">暂无组织，请先在「组织管理」中创建组织。</fluent-message-bar>
    </FluentCard>

    <!-- 设置管理员对话框 -->
    <fluent-dialog :open="adminDialog" @close="adminDialog = false" modal-type="modal" style="--dialog-width: 500px;">
      <fluent-dialog-body>
        <h3 slot="title" style="margin: 0; font-size: var(--fontSizeBase400);">设置应用管理员</h3>
        <p style="font-size: var(--fontSizeBase200); color: var(--colorNeutralForeground2); margin: var(--spacingVerticalM) 0;">
          组织：<strong>{{ adminDialogOrg?.name }}</strong> — 应用：<strong>{{ selectedAppName }}</strong>
        </p>
        <fluent-field label="选择组织成员">
          <fluent-dropdown
            :value="newAdminUserId ? String(newAdminUserId) : ''"
            @change="newAdminUserId = Number(($event.target as any).value)"
            :disabled="membersLoading"
            style="width: 100%;"
          >
            <fluent-option v-for="member in orgMembers" :key="member.userId" :value="String(member.userId)">
              {{ member.name }}
            </fluent-option>
          </fluent-dropdown>
        </fluent-field>
        <div style="display: flex; justify-content: flex-end; gap: var(--spacingHorizontalS); margin-top: var(--spacingVerticalL);">
          <fluent-button appearance="subtle" @click="adminDialog = false">取消</fluent-button>
          <fluent-button appearance="primary" :disabled="!newAdminUserId" @click="confirmAddAdmin">添加</fluent-button>
        </div>
      </fluent-dialog-body>
    </fluent-dialog>

    <ToastMessage />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listApps } from '../../api/application'
import { listOrgs } from '../../api/org'
import { listMembers, type Member } from '../../api/user'
import {
  listDistributions,
  distributeApp,
  undistributeApp,
  setAppAdmin,
  removeAppAdmin,
  type DistributionView,
} from '../../api/distribution'
import { useToast } from '../../composables/useToast'
import FluentCard from '../../components/FluentCard.vue'
import FluentTable from '../../components/FluentTable.vue'
import FluentChip from '../../components/FluentChip.vue'
import ToastMessage from '../../components/ToastMessage.vue'

interface OrgItem {
  id: number
  name: string
}

const { notify } = useToast()

const apps = ref<Array<{ id: string; name: string }>>([])
const appsLoading = ref(false)
const selectedAppId = ref('')
const orgs = ref<OrgItem[]>([])
const distributions = ref<DistributionView[]>([])

const adminDialog = ref(false)
const adminDialogOrg = ref<OrgItem | null>(null)
const orgMembers = ref<Member[]>([])
const membersLoading = ref(false)
const newAdminUserId = ref<number | null>(null)

const selectedAppName = computed(() => apps.value.find(a => a.id === selectedAppId.value)?.name || '')

function isDistributed(orgId: number) {
  return distributions.value.some(d => d.orgId === orgId)
}

function adminsOf(orgId: number) {
  return distributions.value.find(d => d.orgId === orgId)?.admins || []
}

async function loadApps() {
  appsLoading.value = true
  try {
    const resp = await listApps()
    apps.value = resp.data.apps
    if (apps.value.length && !selectedAppId.value) {
      selectedAppId.value = apps.value[0].id
      await loadDistributions()
    }
  } catch (e: any) {
    notify(e.response?.data?.error || '加载应用失败', 'error')
  } finally {
    appsLoading.value = false
  }
}

async function loadOrgs() {
  try {
    const resp = await listOrgs()
    // The provider org (id=1) cannot be a distribution target
    orgs.value = resp.data
      .filter((o: any) => o.id !== 1)
      .map((o: any) => ({ id: o.id, name: o.name }))
  } catch (e: any) {
    notify(e.response?.data?.error || '加载组织失败', 'error')
  }
}

async function loadDistributions() {
  if (!selectedAppId.value) return
  try {
    const resp = await listDistributions(selectedAppId.value)
    distributions.value = resp.data.distributions
  } catch (e: any) {
    notify(e.response?.data?.error || '加载分发信息失败', 'error')
  }
}

async function distribute(orgId: number) {
  try {
    await distributeApp(selectedAppId.value, orgId)
    notify('已分发')
    await loadDistributions()
  } catch (e: any) {
    notify(e.response?.data?.error || '分发失败', 'error')
  }
}

async function undistribute(orgId: number) {
  try {
    await undistributeApp(selectedAppId.value, orgId)
    notify('已取消分发')
    await loadDistributions()
  } catch (e: any) {
    notify(e.response?.data?.error || '取消分发失败', 'error')
  }
}

async function openAdminDialog(org: OrgItem) {
  adminDialogOrg.value = org
  newAdminUserId.value = null
  adminDialog.value = true
  membersLoading.value = true
  try {
    const resp = await listMembers(org.id)
    orgMembers.value = resp.data.filter(m => !adminsOf(org.id).some(a => a.userId === m.userId))
  } catch (e: any) {
    notify(e.response?.data?.error || '加载成员失败', 'error')
  } finally {
    membersLoading.value = false
  }
}

async function confirmAddAdmin() {
  if (!adminDialogOrg.value || !newAdminUserId.value) return
  try {
    await setAppAdmin(selectedAppId.value, adminDialogOrg.value.id, newAdminUserId.value)
    notify('管理员已添加')
    adminDialog.value = false
    await loadDistributions()
  } catch (e: any) {
    notify(e.response?.data?.error || '添加管理员失败', 'error')
  }
}

async function removeAdmin(orgId: number, admin: { userId: number }) {
  try {
    await removeAppAdmin(selectedAppId.value, orgId, admin.userId)
    notify('管理员已移除')
    await loadDistributions()
  } catch (e: any) {
    notify(e.response?.data?.error || '移除管理员失败', 'error')
  }
}

onMounted(async () => {
  await Promise.all([loadApps(), loadOrgs()])
})
</script>
