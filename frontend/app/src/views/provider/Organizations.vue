<!-- 组织管理：列表（表格）+ 创建/编辑（共用对话框）+ 删除（禁止删除当前所属组织） -->
<template>
  <div>
    <div style="display: flex; align-items: center; margin-bottom: var(--spacingVerticalXL);">
      <h2 style="font-size: var(--fontSizeBase500); font-weight: var(--fontWeightSemibold); margin: 0;">组织管理</h2>
      <div style="flex: 1;"></div>
      <fluent-button appearance="primary" @click="openCreate">
        <i class="mdi mdi-plus" style="font-size: 16px; margin-right: 4px;"</i>
        创建组织
      </fluent-button>
    </div>

    <fluent-message-bar v-if="error" intent="error" style="margin-bottom: var(--spacingVerticalM);">
      {{ error }}
    </fluent-message-bar>

    <fluent-progress-bar v-if="loading && !orgs.length" style="margin-bottom: var(--spacingVerticalM);" />

    <!-- 空状态 -->
    <FluentCard v-if="!loading && !orgs.length" style="text-align: center; padding: var(--spacingVerticalXXXL);">
      <i class="mdi mdi-domain" style="font-size: 64px; color: var(--colorNeutralForeground3)"</i>
      <div style="font-size: var(--fontSizeBase400); font-weight: var(--fontWeightSemibold); margin-top: var(--spacingVerticalM); color: var(--colorNeutralForeground2);">还没有组织</div>
      <div style="font-size: var(--fontSizeBase200); color: var(--colorNeutralForeground3); margin-top: var(--spacingVerticalS);">点击右上角"创建组织"添加第一个组织</div>
    </FluentCard>

    <!-- 组织表格 -->
    <FluentCard v-if="orgs.length">
      <FluentTable>
        <thead>
          <tr>
            <th>ID</th>
            <th>名称</th>
            <th>描述</th>
            <th>创建时间</th>
            <th style="text-align: right;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="org in orgs" :key="org.id">
            <td class="text-muted">{{ org.id }}</td>
            <td style="font-weight: var(--fontWeightSemibold);">
              {{ org.name }}
              <FluentChip v-if="org.id === currentOrgId" color="brand" small variant="subtle" style="margin-left: 4px;">当前</FluentChip>
            </td>
            <td class="text-muted">{{ org.description || '—' }}</td>
            <td class="text-muted">{{ formatDate(org.createdAt) }}</td>
            <td style="text-align: right;">
              <fluent-button appearance="subtle" size="small" @click="onManage(org)">
                <i class="mdi mdi-cog" style="font-size: 14px"</i>
                管理
              </fluent-button>
              <fluent-button appearance="subtle" size="small" @click="openEdit(org)">
                <i class="mdi mdi-pencil" style="font-size: 14px"</i>
                编辑
              </fluent-button>
              <fluent-button
                appearance="subtle"
                size="small"
                :disabled="org.id === currentOrgId"
                @click="onDelete(org)"
                style="color: var(--colorPaletteRedForeground1);"
              >
                <i class="mdi mdi-delete" style="font-size: 14px"</i>
                删除
              </fluent-button>
            </td>
          </tr>
        </tbody>
      </FluentTable>
    </FluentCard>

    <!-- 创建/编辑对话框 -->
    <fluent-dialog :open="showDialog" @close="showDialog = false" modal-type="modal" style="--dialog-width: 500px;">
      <fluent-dialog-body>
        <h3 slot="title" style="margin: 0; font-size: var(--fontSizeBase400);">{{ editing ? '编辑组织' : '创建组织' }}</h3>
        <div style="display: flex; flex-direction: column; gap: var(--spacingVerticalM); margin-top: var(--spacingVerticalM);">
          <fluent-field label="组织名称">
            <fluent-text-input
              :value="form.name"
              @input="form.name = ($event.target as HTMLInputElement).value"
              placeholder="请输入组织名称"
            />
          </fluent-field>
          <fluent-field label="描述">
            <fluent-textarea
              :value="form.description"
              @input="form.description = ($event.target as HTMLTextAreaElement).value"
              :rows="2"
            />
          </fluent-field>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: var(--spacingHorizontalS); margin-top: var(--spacingVerticalL);">
          <fluent-button appearance="subtle" @click="showDialog = false">取消</fluent-button>
          <fluent-button appearance="primary" :disabled="saving" @click="onSave">{{ editing ? '保存' : '创建' }}</fluent-button>
        </div>
      </fluent-dialog-body>
    </fluent-dialog>

    <ToastMessage />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { listOrgs, createOrg, updateOrg, deleteOrg, type Org } from '../../api/org'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import FluentCard from '../../components/FluentCard.vue'
import FluentTable from '../../components/FluentTable.vue'
import FluentChip from '../../components/FluentChip.vue'
import ToastMessage from '../../components/ToastMessage.vue'

const router = useRouter()
const { notify } = useToast()

const authStore = useAuthStore()
const currentOrgId = authStore.user?.orgId

const orgs = ref<Org[]>([])
const loading = ref(false)
const error = ref('')

const showDialog = ref(false)
const saving = ref(false)
const editing = ref<Org | null>(null)
const form = ref({ name: '', description: '' })

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

async function fetchOrgs() {
  loading.value = true
  error.value = ''
  try {
    const r = await listOrgs()
    orgs.value = r.data
  } catch (e: any) {
    error.value = e.response?.data?.error || '加载组织列表失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  form.value = { name: '', description: '' }
  showDialog.value = true
}

function openEdit(org: Org) {
  editing.value = org
  form.value = { name: org.name, description: org.description }
  showDialog.value = true
}

async function onSave() {
  if (!form.value.name.trim()) return
  saving.value = true
  error.value = ''
  try {
    if (editing.value) {
      await updateOrg(editing.value.id, { name: form.value.name, description: form.value.description })
      notify(`已更新组织「${form.value.name}」`)
    } else {
      await createOrg({ name: form.value.name, description: form.value.description })
      notify(`已创建组织「${form.value.name}」`)
    }
    showDialog.value = false
    await fetchOrgs()
  } catch (e: any) {
    error.value = e.response?.data?.error || '保存组织失败'
  } finally {
    saving.value = false
  }
}

function onManage(org: Org) {
  router.push(`/provider/orgs/${org.id}`)
}

async function onDelete(org: Org) {
  if (!confirm(`确认删除组织「${org.name}」？此操作不可撤销。`)) return
  error.value = ''
  try {
    await deleteOrg(org.id)
    notify(`已删除组织「${org.name}」`)
    await fetchOrgs()
  } catch (e: any) {
    error.value = e.response?.data?.error || '删除组织失败'
  }
}

onMounted(fetchOrgs)
</script>

<style scoped>
.text-muted {
  color: var(--colorNeutralForeground3);
}
</style>
