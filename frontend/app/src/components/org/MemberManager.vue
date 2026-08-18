<!-- 组织成员管理组件 -->
<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn color="primary" size="small" prepend-icon="mdi-plus" @click="openCreateDialog">添加成员</v-btn>
      <v-spacer />
      <v-progress-linear v-if="loading" indeterminate color="primary" style="max-width: 200px" />
    </div>

    <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>

    <v-card v-if="!loading && members.length === 0" class="text-center pa-8">
      <v-icon size="64" color="grey-lighten-1">mdi-account-group</v-icon>
      <div class="text-h6 mt-4 text-grey-darken-1">还没有成员</div>
      <div class="text-body-2 text-grey mt-2">点击「添加成员」邀请第一个成员</div>
    </v-card>

    <v-card v-if="members.length > 0">
      <v-table>
        <thead>
          <tr>
            <th class="text-left">姓名</th>
            <th class="text-left">用户名</th>
            <th class="text-left">手机</th>
            <th class="text-left">部门</th>
            <th class="text-left">职位</th>
            <th class="text-left">角色</th>
            <th class="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in members" :key="m.userId">
            <td class="font-weight-medium">{{ m.name }}</td>
            <td>{{ m.username || '—' }}</td>
            <td>{{ m.phone }}</td>
            <td>{{ deptName(m.departmentId) }}</td>
            <td>{{ m.position || '—' }}</td>
            <td>
              <v-chip v-if="m.isAdmin" size="x-small" color="primary" variant="tonal" class="mr-1">管理员</v-chip>
              <v-chip v-if="m.isDepartmentManager" size="x-small" color="success" variant="tonal">部门经理</v-chip>
              <span v-if="!m.isAdmin && !m.isDepartmentManager" class="text-grey text-caption">普通</span>
            </td>
            <td class="text-right">
              <v-btn size="small" variant="text" color="primary" prepend-icon="mdi-pencil" @click="openEditDialog(m)">编辑</v-btn>
              <v-btn size="small" variant="text" color="warning" prepend-icon="mdi-lock-reset" @click="openResetPasswordDialog(m)">重置密码</v-btn>
              <v-btn size="small" variant="text" color="error" prepend-icon="mdi-delete" @click="onRemove(m)">移除</v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- 添加/编辑成员对话框 -->
    <v-dialog v-model="showFormDialog" max-width="560">
      <v-card>
        <v-card-title class="text-h5">{{ editing ? '编辑成员' : '添加成员' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.phone" label="手机号" variant="outlined" :disabled="!!editing" :rules="[v => !!v?.trim() || '请输入手机号']" class="mb-3" />
          <v-text-field v-model="form.name" label="姓名" variant="outlined" :rules="[v => !!v?.trim() || '请输入姓名']" class="mb-3" />
          <v-text-field v-model="form.username" label="用户名" variant="outlined" :disabled="!!editing" placeholder="user-name" prepend-inner-icon="mdi-account" :rules="[v => !!v?.trim() || '请输入用户名', v => /^[a-z][a-z-]{2,49}$/.test(v) || '3-50位小写字母和连字符，以字母开头']" autocapitalize="off" class="mb-3" />
          <v-text-field v-model="form.password" :label="editing ? '密码（留空不改）' : '密码'" variant="outlined" :type="showPwd ? 'text' : 'password'" :append-inner-icon="showPwd ? 'mdi-eye' : 'mdi-eye-off'" @click:append-inner="showPwd = !showPwd" :rules="editing ? [] : [v => !!v || '请输入密码', v => v.length >= 6 || '密码至少6位']" class="mb-3" />
          <v-text-field v-model="form.email" label="邮箱" variant="outlined" class="mb-3" />
          <v-text-field v-model="form.position" label="职位" variant="outlined" class="mb-3" />
          <v-select v-model="form.departmentId" :items="deptOptions" item-title="title" item-value="value" label="部门" variant="outlined" clearable class="mb-3" />
          <div class="d-flex">
            <v-switch v-model="form.isAdmin" label="管理员" color="primary" hide-details class="mr-4" />
            <v-switch v-model="form.isDepartmentManager" label="部门经理" color="success" hide-details />
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showFormDialog = false">取消</v-btn>
          <v-btn color="primary" :loading="saving" @click="onSave">{{ editing ? '保存' : '添加' }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 重置密码对话框 -->
    <v-dialog v-model="showResetPasswordDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h5">重置密码</v-card-title>
        <v-card-text>
          <p class="mb-4">为成员 <strong>{{ resetPasswordMember?.name }}</strong> 设置新密码：</p>
          <v-text-field
            v-model="newPassword"
            label="新密码"
            variant="outlined"
            :type="showResetPwd ? 'text' : 'password'"
            :append-inner-icon="showResetPwd ? 'mdi-eye' : 'mdi-eye-off'"
            @click:append-inner="showResetPwd = !showResetPwd"
            :rules="[v => !!v || '请输入新密码', v => v.length >= 6 || '密码至少6位']"
            autofocus
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showResetPasswordDialog = false">取消</v-btn>
          <v-btn color="primary" :loading="resettingPassword" @click="onResetPassword">确认重置</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :timeout="2000" color="success">{{ snackbarMsg }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { listDepartments, type Department } from '../../api/department'
import { listMembers, createMember, updateMember, removeMember, resetPassword, type Member, type MemberRequest } from '../../api/user'

const props = defineProps<{ orgId: number }>()

const members = ref<Member[]>([])
const departments = ref<Department[]>([])
const loading = ref(false)
const error = ref('')
const snackbar = ref(false)
const snackbarMsg = ref('')

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

function showSnack(msg: string) {
  snackbarMsg.value = msg
  snackbar.value = true
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
    phone: '',
    name: '',
    username: '',
    password: '',
    email: '',
    position: '',
    departmentId: null,
    isAdmin: false,
    isDepartmentManager: false,
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
    phone: m.phone,
    name: m.name,
    username: m.username || '',
    password: '',
    email: m.email || '',
    position: m.position || '',
    departmentId: m.departmentId,
    isAdmin: m.isAdmin,
    isDepartmentManager: m.isDepartmentManager,
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
  if (newPassword.value.length < 6) {
    error.value = '密码至少6位'
    return
  }

  resettingPassword.value = true
  error.value = ''
  try {
    await resetPassword(props.orgId, resetPasswordMember.value.userId, newPassword.value)
    showSnack(`已重置「${resetPasswordMember.value.name}」的密码`)
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
      showSnack('已更新成员')
    } else {
      await createMember(props.orgId, {
        phone: form.value.phone.trim(),
        name: form.value.name.trim(),
        username: form.value.username.trim(),
        password: form.value.password,
        email: form.value.email || undefined,
        position: form.value.position || undefined,
        departmentId: form.value.departmentId ?? undefined,
        isAdmin: form.value.isAdmin,
        isDepartmentManager: form.value.isDepartmentManager,
      })
      showSnack('已添加成员')
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
    showSnack(`已移除成员「${m.name}」`)
    await loadData()
  } catch (e: any) {
    error.value = e.response?.data?.error || '移除成员失败'
  }
}

onMounted(loadData)
</script>
