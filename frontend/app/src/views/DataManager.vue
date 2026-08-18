<!-- frontend/app/src/views/DataManager.vue -->
<template>
  <div>
    <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="router.back()" class="mb-2">返回</v-btn>
    <h2 class="text-h5 mb-4">数据管理</h2>

    <v-row>
      <v-col cols="12" md="4">
        <v-card>
          <v-card-text>
            <v-select
              v-if="isProvider"
              v-model="orgId"
              :items="orgs"
              item-title="name"
              item-value="id"
              label="组织"
              variant="outlined"
              density="compact"
              :loading="orgsLoading"
              @update:model-value="loadTables"
            />
            <v-alert v-else type="info" variant="tonal" density="compact" class="mb-3">
              当前组织：{{ orgName }}
            </v-alert>

            <v-progress-linear v-if="tablesLoading" indeterminate class="my-2" />
            <v-list v-else-if="tables.length" density="compact">
              <v-list-item
                v-for="t in tables"
                :key="t.tableName"
                :active="selectedTable === t.tableName"
                @click="selectTable(t.tableName)"
              >
                <v-list-item-title>{{ t.tableName }}</v-list-item-title>
                <v-list-item-subtitle>{{ (t.columns || []).map(c => c.name).join(', ') }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
            <v-alert v-else-if="!tablesLoading" type="info" variant="tonal">
              该应用暂无数据表。数据表由应用运行时自动创建。
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="8">
        <v-card v-if="selectedTable">
          <v-toolbar density="compact" color="primary" dark>
            <v-toolbar-title>{{ selectedTable }}</v-toolbar-title>
            <v-spacer />
            <v-btn density="compact" variant="text" @click="openInsertDialog">新增行</v-btn>
          </v-toolbar>

          <v-card-text>
            <v-progress-linear v-if="rowsLoading" indeterminate />
            <template v-else>
              <v-table density="compact">
                <thead>
                  <tr>
                    <th v-for="col in tableColumns" :key="col">{{ col }}</th>
                    <th class="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in rows" :key="i">
                    <td v-for="col in tableColumns" :key="col" class="text-body-2">{{ formatCell(row[col]) }}</td>
                    <td class="text-right">
                      <v-btn size="x-small" variant="text" icon="mdi-pencil" @click="openEditDialog(row)" />
                      <v-btn size="x-small" variant="text" icon="mdi-delete" color="error" @click="removeRow(row)" />
                    </td>
                  </tr>
                </tbody>
              </v-table>
              <div v-if="!rows.length" class="text-center text-grey pa-4">暂无数据</div>

              <div class="d-flex align-center justify-end mt-3">
                <span class="text-caption text-grey mr-3">共 {{ totalCount }} 条</span>
                <v-btn size="small" variant="text" :disabled="offset === 0" @click="changePage(offset - limit)">上一页</v-btn>
                <v-btn size="small" variant="text" :disabled="offset + limit >= totalCount" @click="changePage(offset + limit)">下一页</v-btn>
              </div>
            </template>
          </v-card-text>
        </v-card>
        <v-alert v-else type="info" variant="tonal">从左侧选择一张表查看数据。</v-alert>
      </v-col>
    </v-row>

    <!-- Insert / Edit dialog -->
    <v-dialog v-model="editor.show" max-width="640">
      <v-card>
        <v-card-title>{{ editor.row ? '编辑行' : '新增行' }} #{{ editor.rowId || '' }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-for="col in editableColumns"
            :key="col.name"
            v-model="editor.values[col.name]"
            :label="col.name"
            :type="col.type === 'integer' || col.type === 'numeric' ? 'number' : col.type === 'boolean' ? 'checkbox' : 'text'"
            :hint="col.type"
            persistent-hint
            density="compact"
            class="mb-2"
          />
          <p v-if="!editableColumns.length" class="text-grey">该表没有可编辑字段。</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="editor.show = false">取消</v-btn>
          <v-btn color="primary" @click="saveRow">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000">
      {{ snackbar.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { listOrgs } from '../api/org'
import { listTables, listRows, insertRow, updateRow, deleteRow, type TableInfo, type DataColumn } from '../api/data'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

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

const snackbar = ref({ show: false, text: '', color: 'success' })

function notify(text: string, color = 'success') {
  snackbar.value = { show: true, text, color }
}

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