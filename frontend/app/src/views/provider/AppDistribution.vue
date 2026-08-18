<!-- frontend/app/src/views/provider/AppDistribution.vue -->
<template>
  <div>
    <h2 class="text-h5 mb-4">应用分发</h2>
    <p class="text-body-2 text-grey mb-4">
      将应用分发给组织后，该组织成员即可在启动台看到此应用。每个组织可单独设置应用管理员（对应用数据拥有全部读写权限）。服务商天然是任何应用的管理员。
    </p>

    <v-card class="mb-4">
      <v-card-text>
        <v-select
          v-model="selectedAppId"
          :items="apps"
          item-title="name"
          item-value="id"
          label="选择应用"
          variant="outlined"
          density="compact"
          :loading="appsLoading"
          @update:model-value="loadDistributions"
        />
      </v-card-text>
    </v-card>

    <v-card v-if="selectedAppId">
      <v-toolbar density="compact" color="primary" dark>
        <v-toolbar-title>分发到组织（{{ distributions.length }}）</v-toolbar-title>
      </v-toolbar>

      <v-card-text>
        <v-table v-if="orgs.length">
          <thead>
            <tr>
              <th>组织</th>
              <th>状态</th>
              <th>应用管理员</th>
              <th class="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="org in orgs" :key="org.id">
              <td>{{ org.name }}</td>
              <td>
                <v-chip v-if="isDistributed(org.id)" size="small" color="success" variant="tonal">已分发</v-chip>
                <v-chip v-else size="small" color="grey" variant="tonal">未分发</v-chip>
              </td>
              <td>
                <template v-if="isDistributed(org.id)">
                  <v-chip
                    v-for="admin in adminsOf(org.id)"
                    :key="admin.userId"
                    size="small"
                    class="mr-1 mb-1"
                    closable
                    @click:close="removeAdmin(org.id, admin)"
                  >
                    {{ admin.name }}{{ admin.username ? ` (${admin.username})` : '' }}
                  </v-chip>
                  <v-chip v-if="!adminsOf(org.id).length" size="small" variant="tonal" class="mr-1">无（仅服务商可管理）</v-chip>
                </template>
                <span v-else class="text-grey text-caption">—</span>
              </td>
              <td class="text-right">
                <v-btn
                  v-if="isDistributed(org.id)"
                  size="small"
                  variant="text"
                  @click="openAdminDialog(org)"
                >
                  设管理员
                </v-btn>
                <v-btn
                  v-if="isDistributed(org.id)"
                  size="small"
                  variant="tonal"
                  color="error"
                  @click="undistribute(org.id)"
                >
                  取消分发
                </v-btn>
                <v-btn v-else size="small" color="primary" @click="distribute(org.id)">
                  分发
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
        <v-alert v-else type="info" variant="tonal">暂无组织，请先在「组织管理」中创建组织。</v-alert>
      </v-card-text>
    </v-card>

    <v-dialog v-model="adminDialog" max-width="500">
      <v-card>
        <v-card-title>设置应用管理员</v-card-title>
        <v-card-text>
          <p class="text-body-2 text-grey mb-2">
            组织：<strong>{{ adminDialogOrg?.name }}</strong> — 应用：<strong>{{ selectedAppName }}</strong>
          </p>
          <v-select
            v-model="newAdminUserId"
            :items="orgMembers"
            item-title="name"
            item-value="userId"
            label="选择组织成员"
            variant="outlined"
            density="compact"
            :loading="membersLoading"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="adminDialog = false">取消</v-btn>
          <v-btn color="primary" :disabled="!newAdminUserId" @click="confirmAddAdmin">添加</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000">
      {{ snackbar.text }}
    </v-snackbar>
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

interface OrgItem {
  id: number
  name: string
}

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

const snackbar = ref({ show: false, text: '', color: 'success' })

const selectedAppName = computed(() => apps.value.find(a => a.id === selectedAppId.value)?.name || '')

function isDistributed(orgId: number) {
  return distributions.value.some(d => d.orgId === orgId)
}

function adminsOf(orgId: number) {
  return distributions.value.find(d => d.orgId === orgId)?.admins || []
}

function notify(text: string, color = 'success') {
  snackbar.value = { show: true, text, color }
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