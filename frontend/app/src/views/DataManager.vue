<!-- frontend/app/src/views/DataManager.vue -->
<template>
  <div>
    <fluent-button appearance="subtle" @click="router.back()" style="margin-bottom: var(--spacingVerticalS);">
      <i class="mdi mdi-arrow-left" style="font-size: 16px; margin-right: 4px;"</i>
      返回
    </fluent-button>
    <h2 style="font-size: var(--fontSizeBase400); font-weight: var(--fontWeightSemibold); margin-bottom: var(--spacingVerticalM);">数据管理</h2>

    <div class="data-manager-grid">
      <FluentCard>
        <fluent-field v-if="isProvider" label="组织">
          <fluent-dropdown
            :value="orgId ? String(orgId) : ''"
            @change="orgId = Number(($event.target as any).value); loadTables()"
            :disabled="orgsLoading"
            style="width: 100%;"
          >
            <fluent-option v-for="o in orgs" :key="o.id" :value="String(o.id)">
              {{ o.name }}
            </fluent-option>
          </fluent-dropdown>
        </fluent-field>
        <fluent-message-bar v-else intent="info" style="margin-bottom: var(--spacingVerticalM);">
          当前组织：{{ orgName }}
        </fluent-message-bar>

        <fluent-progress-bar v-if="tablesLoading" style="margin: var(--spacingVerticalS) 0;" />
        <div v-else-if="tables.length" class="table-list">
          <div
            v-for="t in tables"
            :key="t.tableName"
            :class="['table-list-item', { 'selected': selectedTable === t.tableName }]"
            @click="selectTable(t.tableName)"
          >
            <div style="font-weight: var(--fontWeightSemibold);">{{ t.tableName }}</div>
            <div style="font-size: var(--fontSizeBase100); color: var(--colorNeutralForeground3);">
              {{ (t.columns || []).map(c => c.name).join(', ') }}
            </div>
          </div>
        </div>
        <fluent-message-bar v-else-if="!tablesLoading" intent="info">
          该应用暂无数据表。数据表由应用运行时自动创建。
        </fluent-message-bar>
      </FluentCard>

      <FluentCard v-if="selectedTable">
        <template #header>
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <span style="font-size: var(--fontSizeBase300); font-weight: var(--fontWeightSemibold);">{{ selectedTable }}</span>
            <fluent-button appearance="subtle" size="small" @click="openInsertDialog">
              <i class="mdi mdi-plus" style="font-size: 14px; margin-right: 4px;"</i>
              新增行
            </fluent-button>
          </div>
        </template>

        <fluent-progress-bar v-if="rowsLoading" style="margin-bottom: var(--spacingVerticalM);" />
        <template v-else>
          <FluentTable dense>
            <thead>
              <tr>
                <th v-for="col in tableColumns" :key="col">{{ col }}</th>
                <th style="text-align: right;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in rows" :key="i">
                <td v-for="col in tableColumns" :key="col" style="font-size: var(--fontSizeBase200);">{{ formatCell(row[col]) }}</td>
                <td style="text-align: right;">
                  <fluent-button appearance="subtle" size="small" @click="openEditDialog(row)">
                    <i class="mdi mdi-pencil" style="font-size: 14px"</i>
                  </fluent-button>
                  <fluent-button appearance="subtle" size="small" @click="removeRow(row)" style="color: var(--colorPaletteRedForeground1);">
                    <i class="mdi mdi-delete" style="font-size: 14px"</i>
                  </fluent-button>
                </td>
              </tr>
            </tbody>
          </FluentTable>
          <div v-if="!rows.length" style="text-align: center; color: var(--colorNeutralForeground3); padding: var(--spacingVerticalM);">暂无数据</div>

          <div style="display: flex; align-items: center; justify-content: flex-end; gap: var(--spacingHorizontalS); margin-top: var(--spacingVerticalM);">
            <span style="font-size: var(--fontSizeBase100); color: var(--colorNeutralForeground3);">共 {{ totalCount }} 条</span>
            <fluent-button appearance="subtle" size="small" :disabled="offset === 0" @click="changePage(offset - limit)">上一页</fluent-button>
            <fluent-button appearance="subtle" size="small" :disabled="offset + limit >= totalCount" @click="changePage(offset + limit)">下一页</fluent-button>
          </div>
        </template>
      </FluentCard>
      <fluent-message-bar v-else intent="info">从左侧选择一张表查看数据。</fluent-message-bar>
    </div>

    <!-- Insert / Edit dialog -->
    <fluent-dialog :open="editor.show" @close="editor.show = false" modal-type="modal" style="--dialog-width: 640px;">
      <fluent-dialog-body>
        <h3 slot="title" style="margin: 0; font-size: var(--fontSizeBase400);">{{ editor.row ? '编辑行' : '新增行' }} #{{ editor.rowId || '' }}</h3>
        <div style="display: flex; flex-direction: column; gap: var(--spacingVerticalM); margin-top: var(--spacingVerticalM);">
          <fluent-field v-for="col in editableColumns" :key="col.name" :label="col.name">
            <fluent-text-input
              :value="editor.values[col.name]"
              @input="editor.values[col.name] = ($event.target as HTMLInputElement).value"
              :type="col.type === 'integer' || col.type === 'numeric' ? 'number' : 'text'"
            />
            <div slot="hint" style="font-size: var(--fontSizeBase100); color: var(--colorNeutralForeground3);">{{ col.type }}</div>
          </fluent-field>
          <p v-if="!editableColumns.length" style="color: var(--colorNeutralForeground3);">该表没有可编辑字段。</p>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: var(--spacingHorizontalS); margin-top: var(--spacingVerticalL);">
          <fluent-button appearance="subtle" @click="editor.show = false">取消</fluent-button>
          <fluent-button appearance="primary" @click="saveRow">保存</fluent-button>
        </div>
      </fluent-dialog-body>
    </fluent-dialog>

    <ToastMessage />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { listOrgs } from '../api/org'
import { listTables, listRows, insertRow, updateRow, deleteRow, type TableInfo, type DataColumn } from '../api/data'
import { useToast } from '../composables/useToast'
import FluentCard from '../components/FluentCard.vue'
import FluentTable from '../components/FluentTable.vue'
import ToastMessage from '../components/ToastMessage.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { notify } = useToast()

const appId = route.params.appId as string
const isProvider = computed(() => authStore.userRole === 'provider')

const orgId = ref<number | null>(null)
const orgName = ref('')
const orgs = ref<Array<{ id: number; name: string }>>([])
const orgsLoading = ref(false)

const tables = ref<TableInfo[]>([])
const tablesLoading = ref(false)
const selectedTable = ref('')
const tableColumns = computed<string[]>(() => {
  const t = tables.value.find(t => t.tableName === selectedTable.value)
  if (!t) return []
  return ['id', 'org_id', 'created_at', 'updated_at', ...(t.columns || []).map(c => c.name)]
})

const editableColumns = computed<DataColumn[]>(() => {
  const t = tables.value.find(t => t.tableName === selectedTable.value)
  return (t?.columns || []).filter(c => !['id', 'org_id', 'created_at', 'updated_at'].includes(c.name))
})

const rows = ref<Record<string, unknown>[]>([])
const rowsLoading = ref(false)
const totalCount = ref(0)
const limit = 50
const offset = ref(0)

const editor = reactive({
  show: false,
  row: null as Record<string, unknown> | null,
  rowId: 0,
  values: {} as Record<string, string>,
})

function formatCell(v: unknown) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

async function loadOrgs() {
  if (!isProvider.value) return
  orgsLoading.value = true
  try {
    const resp = await listOrgs()
    orgs.value = resp.data.map((o: any) => ({ id: o.id, name: o.name }))
  } catch (e: any) {
    notify(e.response?.data?.error || '加载组织失败', 'error')
  } finally {
    orgsLoading.value = false
  }
}

async function initOrg() {
  if (isProvider.value) {
    if (!orgs.value.length) return
    const queryOrg = Number(route.query.orgId)
    orgId.value = orgs.value.some(o => o.id === queryOrg) ? queryOrg : orgs.value[0].id
    orgName.value = orgs.value.find(o => o.id === orgId.value)?.name || ''
  } else {
    orgId.value = authStore.user?.orgId || null
    orgName.value = authStore.availableOrgs.find(o => o.orgId === orgId.value)?.orgName || ''
  }
  await loadTables()
}

async function loadTables() {
  if (!orgId.value) return
  tablesLoading.value = true
  try {
    const resp = await listTables(orgId.value, appId)
    tables.value = resp.data.tables
    if (tables.value.length && !tables.value.some(t => t.tableName === selectedTable.value)) {
      await selectTable(tables.value[0].tableName)
    }
  } catch (e: any) {
    notify(e.response?.data?.error || '加载数据表失败', 'error')
  } finally {
    tablesLoading.value = false
  }
}

async function selectTable(name: string) {
  selectedTable.value = name
  offset.value = 0
  await loadRows()
}

async function loadRows() {
  if (!orgId.value || !selectedTable.value) return
  rowsLoading.value = true
  try {
    const resp = await listRows(orgId.value, appId, selectedTable.value, limit, offset.value)
    rows.value = resp.data.rows
    totalCount.value = resp.data.count
  } catch (e: any) {
    notify(e.response?.data?.error || '加载数据失败', 'error')
  } finally {
    rowsLoading.value = false
  }
}

async function changePage(newOffset: number) {
  offset.value = newOffset
  await loadRows()
}

function openInsertDialog() {
  editor.row = null
  editor.rowId = 0
  editor.values = {}
  editor.show = true
}

function openEditDialog(row: Record<string, unknown>) {
  editor.row = row
  editor.rowId = Number(row.id) || 0
  editor.values = {}
  for (const col of editableColumns.value) {
    const v = row[col.name]
    editor.values[col.name] = v === null || v === undefined ? '' : String(v)
  }
  editor.show = true
}

function parseValue(col: DataColumn, raw: string): unknown {
  if (raw === '') return null
  switch (col.type) {
    case 'integer':
    case 'int':
      return parseInt(raw, 10)
    case 'numeric':
    case 'decimal':
    case 'float':
      return parseFloat(raw)
    case 'boolean':
    case 'bool':
      return raw === 'true' || raw === '1'
    case 'jsonb':
    case 'json':
      try {
        return JSON.parse(raw)
      } catch {
        return raw
      }
    default:
      return raw
  }
}

async function saveRow() {
  if (!orgId.value || !selectedTable.value) return
  const data: Record<string, unknown> = {}
  for (const col of editableColumns.value) {
    const raw = editor.values[col.name]
    if (raw !== undefined && raw !== '') {
      data[col.name] = parseValue(col, raw)
    }
  }
  try {
    if (editor.row) {
      await updateRow(orgId.value, appId, selectedTable.value, editor.rowId, data)
      notify('已更新')
    } else {
      await insertRow(orgId.value, appId, selectedTable.value, data)
      notify('已新增')
    }
    editor.show = false
    await loadRows()
  } catch (e: any) {
    notify(e.response?.data?.error || '保存失败', 'error')
  }
}

async function removeRow(row: Record<string, unknown>) {
  if (!orgId.value || !selectedTable.value) return
  if (!confirm(`确认删除第 ${row.id} 行？`)) return
  try {
    await deleteRow(orgId.value, appId, selectedTable.value, Number(row.id))
    notify('已删除')
    await loadRows()
  } catch (e: any) {
    notify(e.response?.data?.error || '删除失败', 'error')
  }
}

onMounted(async () => {
  await loadOrgs()
  await initOrg()
})
</script>

<style scoped>
.data-manager-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: var(--spacingHorizontalL);
}

.table-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacingVerticalXS);
}

.table-list-item {
  padding: var(--spacingVerticalS) var(--spacingHorizontalM);
  border-radius: var(--borderRadiusMedium);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.table-list-item:hover {
  background: var(--colorNeutralBackground1Hover);
}

.table-list-item.selected {
  background: var(--colorNeutralBackground1Selected);
  border-left: 3px solid var(--colorBrandForeground1);
}

@media (max-width: 768px) {
  .data-manager-grid {
    grid-template-columns: 1fr;
  }
}
</style>
