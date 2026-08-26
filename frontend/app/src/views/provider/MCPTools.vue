<template>
  <div>
    <div style="display: flex; align-items: center; gap: var(--spacingHorizontalS); margin-bottom: var(--spacingVerticalXL);">
      <h2 style="font-size: var(--fontSizeBase500); font-weight: var(--fontWeightBold); margin: 0; display: flex; align-items: center; gap: var(--spacingHorizontalS);">
        <i class="mdi mdi-tools mdi-24px" style="color: var(--colorBrandForeground1)"></i>
        MCP 工具
      </h2>
      <div style="flex: 1;"></div>
      <fluent-button appearance="subtle" :disabled="loading" @click="fetchTools">
        <i class="mdi mdi-autorenew" style="font-size: 16px; margin-right: 4px;"</i>
        刷新
      </fluent-button>
    </div>

    <fluent-message-bar v-if="error" intent="error" style="margin-bottom: var(--spacingVerticalM);">{{ error }}</fluent-message-bar>

    <div v-if="loading" style="text-align: center; padding: var(--spacingVerticalXXXL);">
      <fluent-spinner size="large" />
    </div>

    <FluentCard v-else-if="tools.length === 0" outlined style="text-align: center; padding: var(--spacingVerticalXXXL);">
      <i class="mdi mdi-tools" style="font-size: 64px; color: var(--colorNeutralForeground3)"</i>
      <p style="font-size: var(--fontSizeBase400); margin-top: var(--spacingVerticalM); color: var(--colorNeutralForeground2);">没有可用的 MCP 工具</p>
    </FluentCard>

    <div v-else class="tools-grid">
      <FluentCard
        v-for="tool in tools"
        :key="tool.name"
        outlined
      >
        <template #header>
          <span style="font-size: var(--fontSizeBase300); font-weight: var(--fontWeightSemibold); font-family: 'Consolas', 'Monaco', monospace;">
            {{ tool.name }}
          </span>
        </template>

        <p style="font-size: var(--fontSizeBase200); color: var(--colorNeutralForeground2); margin-bottom: var(--spacingVerticalM);">
          {{ tool.description || '无描述' }}
        </p>

        <fluent-divider style="margin: var(--spacingVerticalM) 0;" />

        <div v-if="schemaProperties(tool)">
          <div style="font-size: var(--fontSizeBase100); color: var(--colorNeutralForeground3); margin-bottom: var(--spacingVerticalXS);">输入参数</div>
          <FluentTable dense>
            <tbody>
              <tr v-for="(prop, key) in schemaProperties(tool)" :key="key">
                <td style="font-family: 'Consolas', 'Monaco', monospace;">{{ key }}</td>
                <td>
                  <FluentChip color="brand" small>
                    {{ propType(prop) }}
                  </FluentChip>
                  <i class="mdi mdi-star" style="font-size: 14px; color: var(--colorPaletteRedForeground1); margin-left: 4px;" v-if="isRequired(tool, key)"</i>
                </td>
                <td style="color: var(--colorNeutralForeground3);">{{ propDesc(prop) }}</td>
              </tr>
            </tbody>
          </FluentTable>
        </div>
        <div v-else style="color: var(--colorNeutralForeground3);">
          无输入参数
        </div>
      </FluentCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { MCPTool } from '../../api/mcp'
import FluentCard from '../../components/FluentCard.vue'
import FluentTable from '../../components/FluentTable.vue'
import FluentChip from '../../components/FluentChip.vue'

const tools = ref<MCPTool[]>([])
const loading = ref(false)
const error = ref('')

async function fetchTools() {
  loading.value = true
  error.value = ''
  try {
    // The /mcp/tools endpoint returns a JSON-RPC envelope.
    const resp = await fetch('/mcp/tools', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
      },
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const envelope = await resp.json()
    // JSON-RPC: { result: { tools: [...] } }
    tools.value = envelope?.result?.tools || envelope?.tools || []
  } catch (e: any) {
    error.value = e.message || '获取 MCP 工具失败'
  } finally {
    loading.value = false
  }
}

function schemaProperties(tool: MCPTool): Record<string, any> | null {
  const props = tool.inputSchema?.properties
  if (!props || Object.keys(props).length === 0) return null
  return props as Record<string, any>
}

function propType(prop: any): string {
  if (!prop) return '—'
  return prop.type || '—'
}

function propDesc(prop: any): string {
  if (!prop) return ''
  return prop.description || ''
}

function isRequired(tool: MCPTool, key: string): boolean {
  const req = tool.inputSchema?.required || []
  return req.includes(key)
}

onMounted(fetchTools)
</script>

<style scoped>
.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--spacingHorizontalL);
}
</style>
