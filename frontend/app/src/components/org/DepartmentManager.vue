<!-- 组织部门树形管理组件 -->
<template>
  <div>
    <div style="display: flex; align-items: center; gap: var(--spacingHorizontalM); margin-bottom: var(--spacingVerticalM);">
      <fluent-button appearance="primary" size="small" @click="openCreateDialog">
        <i class="mdi mdi-plus" style="font-size: 14px; margin-right: 4px;"</i>
        新建部门
      </fluent-button>
      <div style="flex: 1;"></div>
      <fluent-progress-bar v-if="loading" style="max-width: 200px;" />
    </div>

    <fluent-message-bar v-if="error" intent="error" style="margin-bottom: var(--spacingVerticalM);">{{ error }}</fluent-message-bar>

    <FluentCard v-if="!loading && tree.length === 0" style="text-align: center; padding: var(--spacingVerticalXXXL);">
      <i class="mdi mdi-folder" style="font-size: 64px; color: var(--colorNeutralForeground3)"</i>
      <div style="font-size: var(--fontSizeBase400); font-weight: var(--fontWeightSemibold); margin-top: var(--spacingVerticalM); color: var(--colorNeutralForeground2);">还没有部门</div>
      <div style="font-size: var(--fontSizeBase200); color: var(--colorNeutralForeground3); margin-top: var(--spacingVerticalS);">点击「新建部门」添加第一个部门</div>
    </FluentCard>

    <FluentCard v-if="tree.length > 0">
      <DepartmentTreeNode
        v-for="node in tree"
        :key="node.id"
        :node="node"
        :members="members"
        :all-flat="allFlat"
        :depth="0"
        @edit="openEditDialog"
        @delete="onDelete"
        @set-manager="openManagerDialog"
      />
    </FluentCard>

    <!-- 新建/编辑部门对话框 -->
    <fluent-dialog :open="showFormDialog" @close="showFormDialog = false" modal-type="modal" style="--dialog-width: 500px;">
      <fluent-dialog-body>
        <h3 slot="title" style="margin: 0; font-size: var(--fontSizeBase400);">{{ editing ? '编辑部门' : '新建部门' }}</h3>
        <div style="display: flex; flex-direction: column; gap: var(--spacingVerticalM); margin-top: var(--spacingVerticalM);">
          <fluent-field label="部门名称">
            <fluent-text-input
              :value="form.name"
              @input="form.name = ($event.target as HTMLInputElement).value"
              placeholder="请输入部门名称"
            />
          </fluent-field>
          <fluent-field label="上级部门">
            <fluent-dropdown
              :value="form.parentId !== null ? String(form.parentId) : ''"
              @change="form.parentId = ($event.target as any).value ? Number(($event.target as any).value) : null"
              style="width: 100%;"
            >
              <fluent-option value="">无（根部门）</fluent-option>
              <fluent-option v-for="opt in parentOptions.filter(o => o.value !== null)" :key="opt.value!" :value="String(opt.value)">
                {{ opt.title }}
              </fluent-option>
            </fluent-dropdown>
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
          <fluent-button appearance="subtle" @click="showFormDialog = false">取消</fluent-button>
          <fluent-button appearance="primary" :disabled="saving" @click="onSave">{{ editing ? '保存' : '创建' }}</fluent-button>
        </div>
      </fluent-dialog-body>
    </fluent-dialog>

    <!-- 设置负责人对话框 -->
    <fluent-dialog :open="showManagerDialog" @close="showManagerDialog = false" modal-type="modal" style="--dialog-width: 400px;">
      <fluent-dialog-body>
        <h3 slot="title" style="margin: 0; font-size: var(--fontSizeBase400);">设置部门负责人</h3>
        <div style="font-size: var(--fontSizeBase200); margin: var(--spacingVerticalM) 0;">部门：{{ managerTarget?.name }}</div>
        <fluent-field label="选择成员">
          <fluent-dropdown
            :value="managerUserId !== null ? String(managerUserId) : ''"
            @change="managerUserId = ($event.target as any).value ? Number(($event.target as any).value) : null"
            style="width: 100%;"
          >
            <fluent-option value="">清空（取消负责人）</fluent-option>
            <fluent-option v-for="m in members" :key="m.userId" :value="String(m.userId)">
              {{ m.name }}
            </fluent-option>
          </fluent-dropdown>
        </fluent-field>
        <div style="display: flex; justify-content: flex-end; gap: var(--spacingHorizontalS); margin-top: var(--spacingVerticalL);">
          <fluent-button appearance="subtle" @click="showManagerDialog = false">取消</fluent-button>
          <fluent-button appearance="primary" :disabled="settingManager" @click="onSetManager">确定</fluent-button>
        </div>
      </fluent-dialog-body>
    </fluent-dialog>

    <ToastMessage />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  getDepartmentTree,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  setDepartmentManager,
  type DepartmentNode,
  type Department,
} from '../../api/department'
import { listMembers, type Member } from '../../api/user'
import { useToast } from '../../composables/useToast'
import DepartmentTreeNode from './DepartmentTreeNode.vue'
import FluentCard from '../FluentCard.vue'
import ToastMessage from '../ToastMessage.vue'

const props = defineProps<{ orgId: number }>()
const { notify } = useToast()

const tree = ref<DepartmentNode[]>([])
const members = ref<Member[]>([])
const allFlat = ref<Department[]>([])
const loading = ref(false)
const error = ref('')

const showFormDialog = ref(false)
const saving = ref(false)
const editing = ref<Department | null>(null)
const form = ref({ name: '', parentId: null as number | null, description: '' })

const showManagerDialog = ref(false)
const settingManager = ref(false)
const managerTarget = ref<Department | null>(null)
const managerUserId = ref<number | null>(null)

const parentOptions = computed(() => {
  const flat = allFlat.value
    .filter(d => !editing.value || d.id !== editing.value.id)
    .map(d => ({ title: d.name, value: d.id }))
  return [{ title: '无（根部门）', value: null }, ...flat]
})

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const [deptRes, memberRes] = await Promise.all([
      getDepartmentTree(props.orgId),
      listMembers(props.orgId),
    ])
    tree.value = deptRes.data
    members.value = memberRes.data
    flattenTree(tree.value)
  } catch (e: any) {
    error.value = e.response?.data?.error || '加载部门数据失败'
  } finally {
    loading.value = false
  }
}

function flattenTree(nodes: DepartmentNode[]) {
  const flat: Department[] = []
  function walk(ns: DepartmentNode[]) {
    for (const n of ns) {
      flat.push(n)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  allFlat.value = flat
}

function openCreateDialog() {
  editing.value = null
  form.value = { name: '', parentId: null, description: '' }
  showFormDialog.value = true
}

function openEditDialog(dept: Department) {
  editing.value = dept
  form.value = { name: dept.name, parentId: dept.parentId, description: dept.description }
  showFormDialog.value = true
}

async function onSave() {
  if (!form.value.name.trim()) return
  saving.value = true
  error.value = ''
  try {
    const payload: Record<string, unknown> = { name: form.value.name.trim() }
    if (form.value.parentId !== null) payload.parentId = form.value.parentId
    else payload.parentId = null
    if (form.value.description) payload.description = form.value.description

    if (editing.value) {
      await updateDepartment(props.orgId, editing.value.id, payload as { name: string; parentId?: number | null; description?: string })
      notify(`已更新部门「${form.value.name}」`)
    } else {
      await createDepartment(props.orgId, payload as { name: string; parentId?: number | null; description?: string })
      notify(`已创建部门「${form.value.name}」`)
    }
    showFormDialog.value = false
    await loadData()
  } catch (e: any) {
    error.value = e.response?.data?.error || '保存部门失败'
  } finally {
    saving.value = false
  }
}

async function onDelete(dept: Department) {
  if (!confirm(`确认删除部门「${dept.name}」？子部门将一并删除。`)) return
  error.value = ''
  try {
    await deleteDepartment(props.orgId, dept.id)
    notify(`已删除部门「${dept.name}」`)
    await loadData()
  } catch (e: any) {
    error.value = e.response?.data?.error || '删除部门失败'
  }
}

function openManagerDialog(dept: Department) {
  managerTarget.value = dept
  managerUserId.value = dept.managerUserId
  showManagerDialog.value = true
}

async function onSetManager() {
  if (!managerTarget.value) return
  settingManager.value = true
  error.value = ''
  try {
    if (managerUserId.value != null) {
      await setDepartmentManager(props.orgId, managerTarget.value.id, managerUserId.value)
      notify(`已设置部门负责人`)
    } else {
      await setDepartmentManager(props.orgId, managerTarget.value.id, 0)
      notify(`已取消部门负责人`)
    }
    showManagerDialog.value = false
    await loadData()
  } catch (e: any) {
    error.value = e.response?.data?.error || '设置负责人失败'
  } finally {
    settingManager.value = false
  }
}

onMounted(loadData)
</script>
