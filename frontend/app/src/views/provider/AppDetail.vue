<template>
  <div>
    <!-- 页头 -->
    <div style="display: flex; align-items: center; gap: var(--spacingHorizontalS); margin-bottom: var(--spacingVerticalXL);">
      <fluent-button appearance="subtle" @click="router.push('/provider/apps')">
        <i class="mdi mdi-arrow-left" style="font-size: 16px"</i>
        返回
      </fluent-button>
      <h2 style="font-size: var(--fontSizeBase400); font-weight: var(--fontWeightBold); margin: 0; display: flex; align-items: center; gap: var(--spacingHorizontalS);">
        <i class="mdi mdi-cog" style="font-size: 20px; color: var(--colorBrandForeground1)"</i>
        {{ app?.name || '应用详情' }}
      </h2>
      <FluentChip
        v-if="app"
        :color="statusColor"
        small
      >
        {{ statusLabel }}
      </FluentChip>
      <div style="flex: 1;"></div>
      <fluent-button
        v-if="app"
        appearance="outline"
        :disabled="actionLoading"
        @click="refresh"
      >
        <i class="mdi mdi-autorenew" style="font-size: 16px; margin-right: 4px;"</i>
        刷新
      </fluent-button>
    </div>

    <!-- 错误 -->
    <fluent-message-bar v-if="error" intent="error" style="margin-bottom: var(--spacingVerticalM);">
      {{ error }}
    </fluent-message-bar>

    <!-- 加载 -->
    <div v-if="loading && !app" style="text-align: center; padding: var(--spacingVerticalXXXL);">
      <fluent-spinner size="large" />
    </div>

    <template v-if="app">
      <div class="app-detail-grid">
        <!-- 左：元信息 + 操作 -->
        <FluentCard outlined>
          <template #header>
            <span style="font-size: var(--fontSizeBase300); font-weight: var(--fontWeightSemibold);">应用信息</span>
          </template>

          <div class="info-list">
            <div class="info-item">
              <span class="info-label">ID</span>
              <span class="info-value font-monospace">{{ app.id }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">版本</span>
              <span class="info-value">v{{ app.version || '0.0.0' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">运行时</span>
              <span class="info-value">{{ app.runtime || '—' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">入口</span>
              <span class="info-value font-monospace">{{ app.entrypoint || '—' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">端口</span>
              <span class="info-value">{{ app.port || '—' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">资源配额</span>
              <span class="info-value">
                {{ app.cpuQuota || '无限制' }} CPU · {{ app.memoryQuota || '无限制' }} · {{ app.dbConnQuota }} 连接
              </span>
            </div>
            <div v-if="app.containerId" class="info-item">
              <span class="info-label">容器 ID</span>
              <span class="info-value font-monospace text-truncate">{{ app.containerId }}</span>
            </div>
          </div>

          <fluent-divider style="margin: var(--spacingVerticalM) 0;" />

          <div class="action-buttons">
            <fluent-button
              appearance="primary"
              :disabled="actionLoading"
              @click="callAction('deploy')"
            >
              <i class="mdi mdi-rocket-launch-outline" style="font-size: 16px; margin-right: 4px;"</i>
              部署
            </fluent-button>
            <fluent-button
              v-if="app.status === 'stopped' || app.status === 'created'"
              appearance="primary"
              :disabled="actionLoading"
              @click="callAction('start')"
            >
              <i class="mdi mdi-play" style="font-size: 16px; margin-right: 4px;"</i>
              启动
            </fluent-button>
            <fluent-button
              v-if="app.status === 'running'"
              appearance="outline"
              :disabled="actionLoading"
              @click="callAction('stop')"
            >
              <i class="mdi mdi-stop" style="font-size: 16px; margin-right: 4px;"</i>
              停止
            </fluent-button>
            <fluent-button
              appearance="outline"
              :disabled="actionLoading"
              @click="callAction('restart')"
            >
              <i class="mdi mdi-autorenew" style="font-size: 16px; margin-right: 4px;"</i>
              重启
            </fluent-button>
            <fluent-button
              appearance="subtle"
              :disabled="app.status !== 'running'"
              @click="openApp"
            >
              <i class="mdi mdi-open-in-new" style="font-size: 16px; margin-right: 4px;"</i>
              进入应用
            </fluent-button>
          </div>
        </FluentCard>

        <!-- 右：日志 -->
        <FluentCard outlined>
          <template #header>
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
              <span style="font-size: var(--fontSizeBase300); font-weight: var(--fontWeightSemibold);">运行日志</span>
              <fluent-button
                appearance="subtle"
                size="small"
                :disabled="logsLoading"
                @click="fetchLogs"
              >
                <i class="mdi mdi-autorenew" style="font-size: 14px; margin-right: 4px;"</i>
                刷新
              </fluent-button>
            </div>
          </template>

          <div class="terminal-output">
            <pre v-if="logs" class="terminal-text">{{ logs }}</pre>
            <div v-else style="color: var(--colorNeutralForeground3); text-align: center; padding: var(--spacingVerticalXL);">暂无日志</div>
          </div>
        </FluentCard>
      </div>

      <!-- 部署历史 -->
      <FluentCard outlined style="margin-top: var(--spacingVerticalL);">
        <template #header>
          <div style="display: flex; align-items: center; gap: var(--spacingHorizontalS);">
            <i class="mdi mdi-history mdi-18px"</i>
            <span style="font-size: var(--fontSizeBase300); font-weight: var(--fontWeightSemibold);">部署历史</span>
          </div>
        </template>

        <div v-if="deploymentsLoading" style="text-align: center; padding: var(--spacingVerticalXL);">
          <fluent-spinner />
        </div>
        <FluentTable v-else-if="deployments.length > 0" dense>
          <thead>
            <tr>
              <th>版本</th>
              <th>镜像</th>
              <th>状态</th>
              <th>容器 ID</th>
              <th>创建时间</th>
              <th>完成时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in deployments" :key="d.id">
              <td>v{{ d.version || '—' }}</td>
              <td class="font-monospace">{{ d.imageTag || '—' }}</td>
              <td>
                <FluentChip :color="deploymentStatusColor(d.status)" small>
                  {{ d.status }}
                </FluentChip>
              </td>
              <td class="font-monospace text-truncate" style="max-width: 200px">
                {{ d.containerId || '—' }}
              </td>
              <td>{{ formatDate(d.createdAt) }}</td>
              <td>{{ d.completedAt ? formatDate(d.completedAt) : '—' }}</td>
            </tr>
          </tbody>
        </FluentTable>
        <div v-else style="color: var(--colorNeutralForeground3); text-align: center; padding: var(--spacingVerticalXL);">还没有部署记录</div>
      </FluentCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getApp,
  getDeployments,
  getAppLogs,
  deployApp,
  startApp,
  stopApp,
  restartApp,
  type Application,
  type Deployment,
} from '../../api/application'
import FluentCard from '../../components/FluentCard.vue'
import FluentTable from '../../components/FluentTable.vue'
import FluentChip from '../../components/FluentChip.vue'

const route = useRoute()
const router = useRouter()
const appId = computed(() => String(route.params.appId))

const app = ref<Application | null>(null)
const loading = ref(false)
const error = ref('')
const actionLoading = ref(false)

const logs = ref('')
const logsLoading = ref(false)

const deployments = ref<Deployment[]>([])
const deploymentsLoading = ref(false)

const statusColor = computed(() => {
  if (!app.value) return 'default' as const
  const map: Record<string, 'success' | 'default' | 'info' | 'danger' | 'warning'> = {
    running: 'success',
    stopped: 'default',
    created: 'info',
    error: 'danger',
    building: 'warning',
    deploying: 'warning',
  }
  return map[app.value.status] || 'default'
})

const statusLabel = computed(() => {
  if (!app.value) return ''
  const labels: Record<string, string> = {
    created: '待部署',
    building: '构建中',
    deploying: '部署中',
    running: '运行中',
    stopped: '已停止',
    error: '异常',
    deleted: '已删除',
  }
  return labels[app.value.status] || app.value.status
})

function deploymentStatusColor(status: string): 'success' | 'default' | 'info' | 'danger' | 'warning' {
  const map: Record<string, 'success' | 'default' | 'info' | 'danger' | 'warning'> = {
    deployed: 'success',
    building: 'warning',
    failed: 'danger',
    stopped: 'default',
  }
  return map[status] || 'default'
}

function formatDate(s: string) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('zh-CN')
  } catch {
    return s
  }
}

async function fetchApp() {
  loading.value = true
  error.value = ''
  try {
    const resp = await getApp(appId.value)
    app.value = resp.data
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || '获取应用失败'
  } finally {
    loading.value = false
  }
}

async function fetchLogs() {
  logsLoading.value = true
  try {
    const resp = await getAppLogs(appId.value, 200)
    logs.value = resp.data.logs || ''
  } catch (e: any) {
    logs.value = `获取日志失败: ${e.response?.data?.error || e.message}`
  } finally {
    logsLoading.value = false
  }
}

async function fetchDeployments() {
  deploymentsLoading.value = true
  try {
    const resp = await getDeployments(appId.value)
    deployments.value = resp.data.deployments || []
  } catch (e: any) {
    // deployments may not exist yet; non-fatal
    deployments.value = []
  } finally {
    deploymentsLoading.value = false
  }
}

async function refresh() {
  await Promise.all([fetchApp(), fetchLogs(), fetchDeployments()])
}

async function callAction(action: 'deploy' | 'start' | 'stop' | 'restart') {
  actionLoading.value = true
  error.value = ''
  try {
    const fns = { deploy: deployApp, start: startApp, stop: stopApp, restart: restartApp }
    await fns[action](appId.value)
    await refresh()
  } catch (e: any) {
    error.value = e.response?.data?.error || e.message || '操作失败'
  } finally {
    actionLoading.value = false
  }
}

function openApp() {
  window.open(`/apps/${appId.value}/`, '_blank')
}

onMounted(() => {
  refresh()
})
</script>

<style scoped>
.app-detail-grid {
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: var(--spacingHorizontalL);
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacingVerticalM);
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacingHorizontalM);
}

.info-label {
  color: var(--colorNeutralForeground3);
  font-size: var(--fontSizeBase200);
  flex-shrink: 0;
}

.info-value {
  font-size: var(--fontSizeBase200);
  color: var(--colorNeutralForeground1);
  text-align: right;
}

.font-monospace {
  font-family: 'Consolas', 'Monaco', monospace;
}

.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacingHorizontalS);
}

.terminal-output {
  background: #1e1e1e;
  border-radius: var(--borderRadiusMedium);
  min-height: 200px;
  max-height: 400px;
  overflow: auto;
  padding: var(--spacingVerticalM);
}

.terminal-text {
  color: #d4d4d4;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

@media (max-width: 768px) {
  .app-detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
