<template>
  <div>
    <div style="display: flex; align-items: center; gap: var(--spacingHorizontalS); margin-bottom: var(--spacingVerticalXL);">
      <h2 style="font-size: var(--fontSizeBase500); font-weight: var(--fontWeightBold); margin: 0; display: flex; align-items: center; gap: var(--spacingHorizontalS);">
        <i class="mdi mdi-script-text-outline mdi-24px" style="color: var(--colorBrandForeground1)"></i>
        MCP 调用日志
      </h2>
      <div style="flex: 1;"></div>
      <fluent-button appearance="subtle" :disabled="loading" @click="fetchLogs">
        <i class="mdi mdi-autorenew" style="font-size: 16px; margin-right: 4px;"</i>
        刷新
      </fluent-button>
    </div>

    <fluent-message-bar v-if="error" intent="error" style="margin-bottom: var(--spacingVerticalM);">{{ error }}</fluent-message-bar>

    <div v-if="loading && logs.length === 0" style="text-align: center; padding: var(--spacingVerticalXXXL);">
      <fluent-spinner size="large" />
    </div>

    <FluentCard v-else-if="logs.length === 0" outlined style="text-align: center; padding: var(--spacingVerticalXXXL);">
      <i class="mdi mdi-script-text-outline" style="font-size: 64px; color: var(--colorNeutralForeground3)"</i>
      <p style="font-size: var(--fontSizeBase400); margin-top: var(--spacingVerticalM); color: var(--colorNeutralForeground2);">还没有 MCP 调用记录</p>
      <p style="font-size: var(--fontSizeBase200); color: var(--colorNeutralForeground3);">应用通过 MCP 访问数据时，调用记录会出现在这里</p>
    </FluentCard>

    <FluentCard v-else outlined>
      <FluentTable>
        <thead>
          <tr>
            <th>时间</th>
            <th>用户</th>
            <th>组织</th>
            <th>工具 / 操作</th>
            <th>状态</th>
            <th>请求参数</th>
            <th>来源 IP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td style="white-space: nowrap;">{{ formatDate(log.createdAt) }}</td>
            <td>{{ log.userId ?? '—' }}</td>
            <td>{{ log.orgId ?? '—' }}</td>
            <td style="font-family: 'Consolas', 'Monaco', monospace;">{{ extractTool(log) }}</td>
            <td>
              <FluentChip
                v-if="log.responseStatus"
                :color="log.responseStatus < 400 ? 'success' : 'danger'"
                small
              >
                {{ log.responseStatus }}
              </FluentChip>
              <span v-else style="color: var(--colorNeutralForeground3);">—</span>
            </td>
            <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="font-size: var(--fontSizeBase100); color: var(--colorNeutralForeground2); font-family: 'Consolas', 'Monaco', monospace;">
                {{ formatRequestData(log) }}
              </span>
            </td>
            <td style="font-size: var(--fontSizeBase100);">{{ log.ipAddress || '—' }}</td>
          </tr>
        </tbody>
      </FluentTable>
    </FluentCard>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { listAuditLogs, type AuditLogEntry } from '../../api/mcp'
import FluentCard from '../../components/FluentCard.vue'
import FluentTable from '../../components/FluentTable.vue'
import FluentChip from '../../components/FluentChip.vue'

const logs = ref<AuditLogEntry[]>([])
const loading = ref(false)
const error = ref('')

async function fetchLogs() {
  loading.value = true
  error.value = ''
  try {
    // Filter to MCP tool calls only.
    const resp = await listAuditLogs({ action: 'mcp_tool_call', limit: 200 })
    logs.value = resp.data.logs || []
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || '获取调用日志失败'
  } finally {
    loading.value = false
  }
}

function extractTool(log: AuditLogEntry): string {
  const rd = log.requestData as Record<string, any> | undefined
  if (!rd) return log.resourceType || log.action
  return rd.tool || rd.name || log.resourceType || log.action
}

function formatRequestData(log: AuditLogEntry): string {
  const rd = log.requestData as Record<string, any> | undefined
  if (!rd) return '—'
  const { tool, name, arguments: args, ...rest } = rd
  const preview = args || rest
  try {
    const json = JSON.stringify(preview)
    return json.length > 120 ? json.slice(0, 120) + '…' : json
  } catch {
    return '—'
  }
}

function formatDate(s: string) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('zh-CN')
  } catch {
    return s
  }
}

onMounted(fetchLogs)
</script>

<style scoped>
.font-monospace {
  font-family: 'Consolas', 'Monaco', monospace;
}
</style>
