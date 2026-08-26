<template>
  <div>
    <div class="toolbar">
      <fluent-button appearance="primary" size="small" @click="openCreateDialog">添加成员</fluent-button>
      <div class="spacer"></div>
      <fluent-progress-bar v-if="loading" style="max-width: 200px"></fluent-progress-bar>
    </div>

    <fluent-message-bar v-if="error" intent="error" class="mb-m">{{ error }}</fluent-message-bar>

    <FluentCard v-if="!loading && members.length === 0" class="empty-state">
      <i class="mdi mdi-account-multiple" style="font-size: 64px; color: var(--colorNeutralForeground3)"</i>
      <p class="text-500 font-semibold mt-3">还没有成员</p>
      <p class="text-200 text-fg3 mt-1">点击「添加成员」邀请第一个成员</p>
    </FluentCard>

    <FluentCard v-if="members.length > 0">
      <FluentTable>
        <table>
          <thead>
            <tr>
              <th>姓名</th>
              <th>用户名</th>
              <th>手机</th>
              <th>部门</th>
              <th>职位</th>
              <th>角色</th>
              <th style="text-align:right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in members" :key="m.userId">
              <td class="font-medium">{{ m.name }}</td>
              <td>{{ m.username || '—' }}</td>
              <td>{{ m.phone }}</td>
              <td>{{ deptName(m.departmentId) }}</td>
              <td>{{ m.position || '—' }}</td>
              <td>
                <FluentChip v-if="m.isAdmin" small color="brand">管理员</FluentChip>
                <FluentChip v-if="m.isDepartmentManager" small color="success">部门经理</FluentChip>
                <span v-if="!m.isAdmin && !m.isDepartmentManager" class="text-fg3 text-100">普通</span>
              </td>
              <td style="text-align:right">
                <fluent-button appearance="subtle" size="small" @click="openEditDialog(m)">编辑</fluent-button>
                <fluent-button appearance="subtle" size="small" @click="openResetPasswordDialog(m)">重置密码</fluent-button>
                <fluent-button appearance="subtle" size="small" @click="onRemove(m)">移除</fluent-button>
              </td>
            </tr>
          </tbody>
        </table>
      </FluentTable>
    </FluentCard>

    <!-- 添加/编辑成员对话框 -->
    <fluent-dialog :open="showFormDialog" @cancel="showFormDialog = false" modal>
      <fluent-dialog-body>
        <h2 class="text-500 font-semibold mb-3">{{ editing ? '编辑成员' : '添加成员' }}</h2>
        <fluent-field class="mb-3">
          <fluent-label>手机号</fluent-label>
          <fluent-text-input :value="form.phone" @input="form.phone = ($event.target as HTMLInputElement).value" :disabled="!!editing" />
        </fluent-field>
        <fluent-field class="mb-3">
          <fluent-label>姓名</fluent-label>
          <fluent-text-input :value="form.name" @input="form.name = ($event.target as HTMLInputElement).value" />
        </fluent-field>
        <fluent-field class="mb-3">
          <fluent-label>用户名</fluent-label>
          <fluent-text-input :value="form.username" @input="form.username = ($event.target as HTMLInputElement).value" :disabled="!!editing" autocapitalize="off" placeholder="user-name" />
        </fluent-field>
        <fluent-field class="mb-3">
          <fluent-label>{{ editing ? '密码（留空不改）' : '密码' }}</fluent-label>
          <fluent-text-input :value="form.password" @input="form.password = ($event.target as HTMLInputElement).value" :type="showPwd ? 'text' : 'password'" />
          <fluent-button appearance="subtle" size="small" @click="showPwd = !showPwd">{{ showPwd ? '隐藏' : '显示' }}</fluent-button>
        </fluent-field>
        <fluent-field class="mb-3">
          <fluent-label>邮箱</fluent-label>
          <fluent-text-input :value="form.email" @input="form.email = ($event.target as HTMLInputElement).value" />
        </fluent-field>
        <fluent-field class="mb-3">
          <fluent-label>职位</fluent-label>
          <fluent-text-input :value="form.position" @input="form.position = ($event.target as HTMLInputElement).value" />
        </fluent-field>
        <fluent-field class="mb-3">
          <fluent-label>部门</fluent-label>
          <fluent-dropdown :value="form.departmentId?.toString() || ''" @change="form.departmentId = ($event.target as any).value ? Number(($event.target as any).value) : null">
            <fluent-option value="">未分配</fluent-option>
            <fluent-option v-for="opt in deptOptions" :key="opt.value" :value="opt.value.toString()">{{ opt.title }}</fluent-option>
          </fluent-dropdown>
        </fluent-field>
        <div class="flex gap-4 mb-3">
          <fluent-switch :checked="form.isAdmin" @change="form.isAdmin = ($event.target as any).checked">管理员</fluent-switch>
          <fluent-switch :checked="form.isDepartmentManager" @change="form.isDepartmentManager = ($event.target as any).checked">部门经理</fluent-switch>
        </div>
        <div class="flex justify-end gap-2 mt-3">
          <fluent-button appearance="subtle" @click="showFormDialog = false">取消</fluent-button>
          <fluent-button appearance="primary" :disabled="saving" @click="onSave">{{ editing ? '保存' : '添加' }}</fluent-button>
        </div>
      </fluent-dialog-body>
    </fluent-dialog>

    <!-- 重置密码对话框 -->
    <fluent-dialog :open="showResetPasswordDialog" @cancel="showResetPasswordDialog = false" modal>
      <fluent-dialog-body>
        <h2 class="text-500 font-semibold mb-3">重置密码</h2>
        <p class="text-200 text-fg3 mb-3">为成员 <strong>{{ resetPasswordMember?.name }}</strong> 设置新密码：</p>
        <fluent-field class="mb-3">
          <fluent-label>新密码</fluent-label>
          <fluent-text-input :value="newPassword" @input="newPassword = ($event.target as HTMLInputElement).value" :type="showResetPwd ? 'text' : 'password'" />
          <fluent-button appearance="subtle" size="small" @click="showResetPwd = !showResetPwd">{{ showResetPwd ? '隐藏' : '显示' }}</fluent-button>
        </fluent-field>
        <div class="flex justify-end gap-2 mt-3">
          <fluent-button appearance="subtle" @click="showResetPasswordDialog = false">取消</fluent-button>
          <fluent-button appearance="primary" :disabled="resettingPassword" @click="onResetPassword">确认重置</fluent-button>
        </div>
      </fluent-dialog-body>
    </fluent-dialog>

    <ToastMessage />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { listDepartments, type Department } from '../../api/department'
import { listMembers, createMember, updateMember, removeMember, resetPassword, type Member, type MemberRequest } from '../../api/user'
import { useToast } from '../../composables/useToast'
import FluentCard from '../FluentCard.vue'
import FluentTable from '../FluentTable.vue'
import FluentChip from '../FluentChip.vue'
import ToastMessage from '../ToastMessage.vue'

const props = defineProps<{ orgId: number }>()
const { notify } = useToast()

const members = ref<Member[]>([])
const departments = ref<Department[]>([])
const loading = ref(false)
const error = ref('')

const showFormDialog = ref(false)
const saving = ref(false)
const editing = ref<Member | null>(null)
const showPwd = ref(false)
const form = ref({
  phone: '',
  name: '',
  username: '',
  password: '',
  email: '',
  position: '',
  departmentId: null as number | null,
  isAdmin: false,
  isDepartmentManager: false,
})

const showResetPasswordDialog = ref(false)
const resettingPassword = ref(false)
const resetPasswordMember = ref<Member | null>(null)
const newPassword = ref('')
const showResetPwd = ref(false)

const deptOptions = computed(() =>
  departments.value.map(d => ({ title: d.name, value: d.id }))
)

function deptName(deptId: number | null): string {
  if (deptId == null) return '—'
  return departments.value.find(d => d.id === deptId)?.name || '—'
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const [memberRes, deptRes] = await Promise.all([
      listMembers(props.orgId),
      listDepartments(props.orgId),
    ])
    members.value = memberRes.data
    departments.value = deptRes.data
  } catch (e: any) {
    error.value = e.response?.data?.error || '加载成员数据失败'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = {
    phone: '', name: '', username: '', password: '',
    email: '', position: '', departmentId: null,
    isAdmin: false, isDepartmentManager: false,
  }
}

function openCreateDialog() {
  editing.value = null
  resetForm()
  showPwd.value = false
  showFormDialog.value = true
}

function openEditDialog(m: Member) {
  editing.value = m
  form.value = {
    phone: m.phone, name: m.name, username: m.username || '',
    password: '', email: m.email || '', position: m.position || '',
    departmentId: m.departmentId, isAdmin: m.isAdmin, isDepartmentManager: m.isDepartmentManager,
  }
  showPwd.value = false
  showFormDialog.value = true
}

function openResetPasswordDialog(m: Member) {
  resetPasswordMember.value = m
  newPassword.value = ''
  showResetPwd.value = false
  showResetPasswordDialog.value = true
}

async function onResetPassword() {
  if (!resetPasswordMember.value || !newPassword.value) return
  if (newPassword.value.length < 6) { error.value = '密码至少6位'; return }
  resettingPassword.value = true
  error.value = ''
  try {
    await resetPassword(props.orgId, resetPasswordMember.value.userId, newPassword.value)
    notify(`已重置「${resetPasswordMember.value.name}」的密码`)
    showResetPasswordDialog.value = false
  } catch (e: any) {
    error.value = e.response?.data?.error || '重置密码失败'
  } finally {
    resettingPassword.value = false
  }
}

async function onSave() {
  if (!form.value.name.trim() || (!editing.value && !form.value.phone.trim())) return
  saving.value = true
  error.value = ''
  try {
    if (editing.value) {
      const payload: Partial<MemberRequest> = { name: form.value.name.trim() }
      if (form.value.password) payload.password = form.value.password
      if (form.value.email) payload.email = form.value.email
      if (form.value.position) payload.position = form.value.position
      payload.departmentId = form.value.departmentId
      payload.isAdmin = form.value.isAdmin
      payload.isDepartmentManager = form.value.isDepartmentManager
      await updateMember(props.orgId, editing.value.userId, payload)
      notify('已更新成员')
    } else {
      await createMember(props.orgId, {
        phone: form.value.phone.trim(), name: form.value.name.trim(),
        username: form.value.username.trim(), password: form.value.password,
        email: form.value.email || undefined, position: form.value.position || undefined,
        departmentId: form.value.departmentId ?? undefined,
        isAdmin: form.value.isAdmin, isDepartmentManager: form.value.isDepartmentManager,
      })
      notify('已添加成员')
    }
    showFormDialog.value = false
    await loadData()
  } catch (e: any) {
    error.value = e.response?.data?.error || '保存成员失败'
  } finally {
    saving.value = false
  }
}

async function onRemove(m: Member) {
  if (!confirm(`确认移除成员「${m.name}」？`)) return
  error.value = ''
  try {
    await removeMember(props.orgId, m.userId)
    notify(`已移除成员「${m.name}」`)
    await loadData()
  } catch (e: any) {
    error.value = e.response?.data?.error || '移除成员失败'
  }
}

onMounted(loadData)
</script>

<style scoped>
.toolbar { display: flex; align-items: center; gap: var(--spacingHorizontalM); margin-bottom: var(--spacingVerticalM); }
.spacer { flex: 1; }
.empty-state { text-align: center; padding: var(--spacingVerticalXXL); }
.mb-m { margin-bottom: var(--spacingVerticalM); }
.mb-3 { margin-bottom: var(--spacingVerticalM); }
.mt-1 { margin-top: var(--spacingVerticalXS); }
.mt-3 { margin-top: var(--spacingVerticalM); }
.gap-2 { gap: var(--spacingHorizontalS); }
.gap-4 { gap: var(--spacingHorizontalL); }
</style>
