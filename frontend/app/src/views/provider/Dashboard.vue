<!-- frontend/app/src/views/provider/Dashboard.vue -->
<template>
  <div>
    <h2 style="font-size: var(--fontSizeBase500); font-weight: var(--fontWeightSemibold); margin-bottom: var(--spacingVerticalL);">仪表盘</h2>

    <!-- System Monitoring Section -->
    <h3 style="font-size: var(--fontSizeBase400); font-weight: var(--fontWeightSemibold); margin-bottom: var(--spacingVerticalM);">服务端运行情况</h3>

    <div class="metrics-grid">
      <!-- Memory Usage Card -->
      <FluentCard>
        <div style="display: flex; align-items: center; gap: var(--spacingHorizontalS); margin-bottom: var(--spacingVerticalS);">
          <i class="mdi mdi-memory" style="font-size: 28px; color: var(--colorBrandForeground1)"</i>
          <span style="font-size: var(--fontSizeBase400); font-weight: var(--fontWeightSemibold);">内存使用</span>
        </div>
        <fluent-progress-bar
          :value="memoryUsagePercent"
          :max="100"
          style="margin-bottom: var(--spacingVerticalS);"
        />
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>{{ Math.round(memoryUsagePercent) }}%</strong>
        </div>
        <div class="text-caption">
          {{ formatBytes(systemMetrics.memoryUsage) }} / {{ formatBytes(systemMetrics.memoryTotal) }}
        </div>
      </FluentCard>

      <!-- Disk Usage Card -->
      <FluentCard>
        <div style="display: flex; align-items: center; gap: var(--spacingHorizontalS); margin-bottom: var(--spacingVerticalS);">
          <i class="mdi mdi-harddisk" style="font-size: 28px; color: var(--colorPalettePurpleForeground1)"</i>
          <span style="font-size: var(--fontSizeBase400); font-weight: var(--fontWeightSemibold);">磁盘使用</span>
        </div>
        <fluent-progress-bar
          :value="diskUsagePercent"
          :max="100"
          style="margin-bottom: var(--spacingVerticalS);"
        />
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>{{ Math.round(diskUsagePercent) }}%</strong>
        </div>
        <div class="text-caption">
          {{ formatBytes(systemMetrics.diskUsage) }} / {{ formatBytes(systemMetrics.diskTotal) }}
        </div>
      </FluentCard>

      <!-- Database Pressure Card -->
      <FluentCard>
        <div style="display: flex; align-items: center; gap: var(--spacingHorizontalS); margin-bottom: var(--spacingVerticalS);">
          <i class="mdi mdi-database" style="font-size: 28px; color: var(--colorPaletteBlueForeground1)"</i>
          <span style="font-size: var(--fontSizeBase400); font-weight: var(--fontWeightSemibold);">数据库连接</span>
        </div>
        <fluent-progress-bar
          :value="dbConnectionPercent"
          :max="100"
          style="margin-bottom: var(--spacingVerticalS);"
        />
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong v-if="dbMetrics.maxOpenConns > 0">{{ dbMetrics.inUse }} / {{ dbMetrics.maxOpenConns }}</strong>
          <strong v-else>{{ dbMetrics.inUse }} (无限制)</strong>
        </div>
        <div class="text-caption">
          活跃: {{ dbMetrics.activeConnections }}, 空闲: {{ dbMetrics.idleConnections }}
        </div>
      </FluentCard>
    </div>

    <!-- Additional System Info -->
    <div class="info-grid" style="margin-top: var(--spacingVerticalXL);">
      <FluentCard>
        <div class="info-list">
          <div class="info-row">
            <i class="mdi mdi-memory mdi-18px" style="color: var(--colorBrandForeground1)"></i>
            <span class="info-label">CPU 核心数</span>
            <FluentChip color="brand" small>{{ systemMetrics.cpuCores }}</FluentChip>
          </div>
          <div class="info-row">
            <i class="mdi mdi-apps mdi-18px" style="color: var(--colorPaletteGreenForeground1)"></i>
            <span class="info-label">Goroutine 数量</span>
            <FluentChip color="success" small>{{ systemMetrics.goroutineCount }}</FluentChip>
          </div>
          <div class="info-row">
            <i class="mdi mdi-clock-outline mdi-18px" style="color: var(--colorPaletteYellowForeground1)"></i>
            <span class="info-label">运行时间</span>
            <FluentChip color="warning" small>{{ systemMetrics.uptime || 'N/A' }}</FluentChip>
          </div>
        </div>
      </FluentCard>

      <FluentCard>
        <div class="info-list">
          <div class="info-row">
            <i class="mdi mdi-database mdi-18px" style="color: var(--colorPaletteBlueForeground1)"></i>
            <span class="info-label">最大连接数</span>
            <FluentChip color="info" small>{{ dbMetrics.maxOpenConns > 0 ? dbMetrics.maxOpenConns : '无限制' }}</FluentChip>
          </div>
          <div class="info-row">
            <i class="mdi mdi-timer-sand mdi-18px" style="color: var(--colorPaletteRedForeground1)"></i>
            <span class="info-label">等待次数</span>
            <FluentChip color="danger" small>{{ dbMetrics.waitCount || 0 }}</FluentChip>
          </div>
          <div class="info-row">
            <i class="mdi mdi-autorenew mdi-18px" style="color: var(--colorPalettePurpleForeground1)"></i>
            <span class="info-label">最后更新</span>
            <FluentChip color="default" small>{{ lastUpdateTime }}</FluentChip>
          </div>
        </div>
      </FluentCard>
    </div>

    <!-- Backend Logs Section -->
    <div style="margin-top: var(--spacingVerticalXL);">
      <div style="display: flex; align-items: center; gap: var(--spacingHorizontalM); margin-bottom: var(--spacingVerticalM);">
        <h3 style="font-size: var(--fontSizeBase400); font-weight: var(--fontWeightSemibold); margin: 0;">后端运行日志</h3>
        <div style="flex: 1;"></div>
        <fluent-dropdown
          :value="logLevelFilter"
          @change="logLevelFilter = ($event.target as any).value"
          style="width: 130px;"
        >
          <fluent-option value="DEBUG">DEBUG</fluent-option>
          <fluent-option value="INFO">INFO</fluent-option>
          <fluent-option value="WARN">WARN</fluent-option>
          <fluent-option value="ERROR">ERROR</fluent-option>
        </fluent-dropdown>
        <fluent-dropdown
          :value="String(logLimit)"
          @change="logLimit = Number(($event.target as any).value); fetchLogs()"
          style="width: 130px;"
        >
          <fluent-option value="100">100 条</fluent-option>
          <fluent-option value="200">200 条</fluent-option>
          <fluent-option value="500">500 条</fluent-option>
        </fluent-dropdown>
      </div>
      <div class="terminal-container">
        <div class="terminal-output" ref="terminalRef">
          <div v-for="(log, index) in filteredLogs" :key="index" class="terminal-line">
            <span class="terminal-time">{{ formatTerminalTime(log.timestamp) }}</span>
            <span :class="getTerminalLevelClass(log.level)" class="terminal-level">{{ log.level.toUpperCase() }}</span>
            <span class="terminal-message">{{ log.message }}</span>
          </div>
          <div v-if="filteredLogs.length === 0" class="terminal-empty">
            暂无符合条件的日志
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import axios from 'axios'
import FluentCard from '../../components/FluentCard.vue'
import FluentChip from '../../components/FluentChip.vue'

interface SystemMetrics {
  memoryUsage: number
  memoryTotal: number
  diskUsage: number
  diskTotal: number
  cpuCores: number
  goroutineCount: number
  uptime: string
  timestamp: string
}

interface DatabaseMetrics {
  activeConnections: number
  idleConnections: number
  maxOpenConns: number
  openConnections: number
  inUse: number
  idle: number
  waitCount: number
  waitDuration: string
  maxIdleClosed: number
  maxLifetimeClosed: number
}

interface LogEntry {
  timestamp: string
  level: string
  message: string
  context?: string
}

const systemMetrics = ref<SystemMetrics>({
  memoryUsage: 0,
  memoryTotal: 0,
  diskUsage: 0,
  diskTotal: 0,
  cpuCores: 0,
  goroutineCount: 0,
  uptime: '',
  timestamp: ''
})

const dbMetrics = ref<DatabaseMetrics>({
  activeConnections: 0,
  idleConnections: 0,
  maxOpenConns: 0,
  openConnections: 0,
  inUse: 0,
  idle: 0,
  waitCount: 0,
  waitDuration: '',
  maxIdleClosed: 0,
  maxLifetimeClosed: 0
})

const recentLogs = ref<LogEntry[]>([])
const loadingLogs = ref(false)
const lastUpdateTime = ref('')
const logLimit = ref(100)
const logLevelFilter = ref('INFO')
const terminalRef = ref<HTMLDivElement | null>(null)
let metricsInterval: number | null = null
let logsInterval: number | null = null

// Filter logs by level (hierarchical: DEBUG < INFO < WARN < ERROR)
const filteredLogs = computed(() => {
  const levelOrder: Record<string, number> = { 'DEBUG': 0, 'INFO': 1, 'WARN': 2, 'ERROR': 3 }

  const filterLevel = levelOrder[logLevelFilter.value] ?? 1
  return recentLogs.value.filter(log => {
    const logLevel = levelOrder[log.level.toUpperCase()] ?? 0
    return logLevel >= filterLevel
  })
})

const memoryUsagePercent = ref(0)
const diskUsagePercent = ref(0)
const dbConnectionPercent = ref(0)

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

const formatTerminalTime = (timestamp: string) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const getTerminalLevelClass = (level: string) => {
  switch (level.toLowerCase()) {
    case 'error': return 'terminal-error'
    case 'warn': return 'terminal-warn'
    case 'info': return 'terminal-info'
    default: return 'terminal-debug'
  }
}

const fetchSystemMetrics = async () => {
  try {
    const token = localStorage.getItem('token')
    console.log('[Dashboard] Fetching system metrics with token:', token ? 'exists' : 'missing')
    const url = '/api/system/metrics'
    console.log('[Dashboard] Request URL:', url)
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
    console.log('[Dashboard] System metrics response status:', response.status)
    console.log('[Dashboard] System metrics response data:', response.data)
    systemMetrics.value = response.data

    // Calculate percentages
    if (systemMetrics.value.memoryTotal > 0) {
      memoryUsagePercent.value = (systemMetrics.value.memoryUsage / systemMetrics.value.memoryTotal) * 100
      console.log('[Dashboard] Memory usage percent:', memoryUsagePercent.value)
    }
    if (systemMetrics.value.diskTotal > 0) {
      diskUsagePercent.value = (systemMetrics.value.diskUsage / systemMetrics.value.diskTotal) * 100
      console.log('[Dashboard] Disk usage percent:', diskUsagePercent.value)
    }

    lastUpdateTime.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (error: any) {
    console.error('[Dashboard] Failed to fetch system metrics:', error.response?.data || error.message)
    console.error('[Dashboard] Error status:', error.response?.status)
    console.error('[Dashboard] Error config:', error.config)
  }
}

const fetchDatabaseMetrics = async () => {
  try {
    const token = localStorage.getItem('token')
    const response = await axios.get('/api/system/database/metrics', {
      headers: { Authorization: `Bearer ${token}` }
    })
    console.log('[Dashboard] Database metrics response:', response.data)
    dbMetrics.value = response.data

    // Calculate DB connection percentage
    if (dbMetrics.value.maxOpenConns > 0) {
      dbConnectionPercent.value = (dbMetrics.value.inUse / dbMetrics.value.maxOpenConns) * 100
      console.log('[Dashboard] DB connection percent:', dbConnectionPercent.value)
    }
  } catch (error: any) {
    console.error('[Dashboard] Failed to fetch database metrics:', error.response?.data || error.message)
  }
}

const fetchLogs = async () => {
  loadingLogs.value = true
  try {
    const token = localStorage.getItem('token')
    const response = await axios.get(`/api/system/logs?limit=${logLimit.value}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    recentLogs.value = response.data.logs || []

    // Auto scroll to bottom when new logs arrive
    if (terminalRef.value) {
      terminalRef.value.scrollTop = terminalRef.value.scrollHeight
    }
  } catch (error) {
    console.error('Failed to fetch logs:', error)
  } finally {
    loadingLogs.value = false
  }
}

onMounted(() => {
  // Initial fetch
  fetchSystemMetrics()
  fetchDatabaseMetrics()
  fetchLogs()

  // Set up periodic refresh
  metricsInterval = window.setInterval(() => {
    fetchSystemMetrics()
    fetchDatabaseMetrics()
  }, 5000) as unknown as number

  logsInterval = window.setInterval(() => {
    fetchLogs()
  }, 3000) as unknown as number
})

onUnmounted(() => {
  if (metricsInterval) {
    clearInterval(metricsInterval)
  }
  if (logsInterval) {
    clearInterval(logsInterval)
  }
})
</script>

<style scoped>
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacingHorizontalM);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacingHorizontalM);
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacingVerticalM);
}

.info-row {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalS);
}

.info-label {
  flex: 1;
  color: var(--colorNeutralForeground2);
  font-size: var(--fontSizeBase200);
}

.text-caption {
  font-size: var(--fontSizeBase100);
  color: var(--colorNeutralForeground3);
}

/* Terminal style */
.terminal-container {
  background-color: #1e1e1e;
  border-radius: var(--borderRadiusMedium);
  padding: 12px;
  max-height: 400px;
  overflow: hidden;
}

.terminal-output {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #d4d4d4;
  max-height: 376px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.terminal-output::-webkit-scrollbar {
  width: 8px;
}

.terminal-output::-webkit-scrollbar-track {
  background: #2d2d2d;
  border-radius: 4px;
}

.terminal-output::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.terminal-output::-webkit-scrollbar-thumb:hover {
  background: #666;
}

.terminal-line {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}

.terminal-time {
  color: #6a9955;
  min-width: 120px;
  flex-shrink: 0;
}

.terminal-level {
  min-width: 50px;
  font-weight: bold;
  flex-shrink: 0;
}

.terminal-error {
  color: #f44747;
}

.terminal-warn {
  color: #cc7832;
}

.terminal-info {
  color: #4ec9b0;
}

.terminal-debug {
  color: #9cdcfe;
}

.terminal-message {
  color: #d4d4d4;
  flex: 1;
}

.terminal-empty {
  text-align: center;
  padding: 20px;
  font-style: italic;
  color: #808080;
}

@media (max-width: 768px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }
  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
