<template>
  <FluentCard
    :class="['app-card', { 'app-card--disabled': disabled }]"
    :interactive="!disabled"
    @click="!disabled ? $emit('open', app) : null"
  >
    <!-- 状态指示条 -->
    <div :class="['status-bar', `status-bar--${statusColor}`]" />

    <div class="card-content">
      <!-- 图标 + 名称 -->
      <div class="app-header-row">
        <div :class="['runtime-avatar', `runtime-avatar--${iconBgTone}`]">
          <i :class="['mdi', runtimeMdiIcon]" :style="`font-size: 28px; color: ${iconColor}`"></i>
        </div>
        <div class="app-name-block">
          <div class="app-name">{{ app.name }}</div>
          <div class="app-version">v{{ app.version || '0.0.0' }}</div>
        </div>
      </div>

      <!-- 状态标签 -->
      <div class="status-row">
        <FluentChip :color="statusColor" :icon="statusMdiIcon" small>
          {{ statusLabel }}
        </FluentChip>
        <span class="runtime-label">{{ app.runtime || 'unknown' }}</span>
      </div>

      <!-- 资源信息 -->
      <div class="resource-info">
        <i class="mdi mdi-memory" style="font-size: 14px"></i>
        <span>{{ app.cpuQuota || '无限制' }} CPU</span>
        <i class="mdi mdi-code-tags resource-spacer" style="font-size: 14px"></i>
        <span>{{ app.memoryQuota || '无限制' }}</span>
      </div>
    </div>

    <template #actions>
      <template v-if="!disabled">
        <fluent-button appearance="filled" size="small" @click.stop="$emit('open', app)">
          进入应用
          <i class="mdi mdi-arrow-right" style="font-size: 14px"></i>
        </fluent-button>
        <div class="spacer" />
        <fluent-button v-if="showDetails" appearance="subtle" size="small" @click.stop="$emit('details', app)">
          详情
          <i class="mdi mdi-chevron-right" style="font-size: 14px"></i>
        </fluent-button>
        <fluent-button v-if="showData" appearance="subtle" size="small" @click.stop="$emit('data', app)">
          数据管理
          <i class="mdi mdi-database" style="font-size: 14px"></i>
        </fluent-button>
      </template>
      <template v-else>
        <fluent-button disabled style="flex: 1">应用未运行</fluent-button>
        <fluent-button v-if="showData" appearance="subtle" size="small" @click.stop="$emit('data', app)">
          数据管理
        </fluent-button>
      </template>
    </template>
  </FluentCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Application } from '../api/application'
import FluentCard from '../components/FluentCard.vue'
import FluentChip from '../components/FluentChip.vue'
const props = defineProps<{
  app: Application
  disabled?: boolean
  showDetails?: boolean
  showData?: boolean
}>()

defineEmits<{
  open: [app: Application]
  details: [app: Application]
  data: [app: Application]
}>()

const statusColor = computed<'success' | 'default' | 'info' | 'danger' | 'warning'>(() => {
  switch (props.app.status) {
    case 'running': return 'success'
    case 'stopped': return 'default'
    case 'created': return 'info'
    case 'error': return 'danger'
    case 'building':
    case 'deploying': return 'warning'
    default: return 'default'
  }
})

const statusMdiIcon = computed(() => {
  switch (props.app.status) {
    case 'running': return 'mdi-play-circle-outline'
    case 'stopped': return 'mdi-pause-circle-outline'
    case 'created': return 'mdi-plus-circle-outline'
    case 'error': return 'mdi-alert-circle'
    case 'building':
    case 'deploying': return 'mdi-autorenew'
    default: return 'mdi-help-circle-outline'
  }
})

const statusLabel = computed(() => {
  const labels: Record<string, string> = {
    created: '待部署',
    building: '构建中',
    deploying: '部署中',
    running: '运行中',
    stopped: '已停止',
    error: '异常',
    deleted: '已删除',
  }
  return labels[props.app.status] || props.app.status
})

const runtimeMdiIcon = computed(() => {
  const rt = (props.app.runtime || '').toLowerCase()
  if (rt.includes('node')) return 'mdi-nodejs'
  if (rt.includes('python')) return 'mdi-language-python'
  if (rt.includes('go')) return 'mdi-language-go'
  return 'mdi-apps'
})

const iconBgTone = computed(() => (props.app.status === 'running' ? 'active' : 'inactive'))

const iconColor = computed(() => {
  if (props.app.status === 'running') return 'var(--colorPaletteGreenForeground1)'
  return 'var(--colorNeutralForeground3)'
})
</script>

<style scoped>
.app-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.app-card--disabled {
  opacity: 0.65;
  pointer-events: none;
}

.status-bar {
  height: 4px;
  width: 100%;
  border-radius: 4px 4px 0 0;
}
.status-bar--success { background: var(--colorPaletteGreenBackground3); }
.status-bar--default { background: var(--colorNeutralStroke1); }
.status-bar--info { background: var(--colorPaletteBlueBackground3); }
.status-bar--danger { background: var(--colorPaletteRedBackground3); }
.status-bar--warning { background: var(--colorPaletteYellowBackground3); }

.card-content {
  padding: var(--spacingVerticalL) var(--spacingHorizontalL);
  display: flex;
  flex-direction: column;
  gap: var(--spacingVerticalM);
}

.app-header-row {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalM);
}

.runtime-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--borderRadiusMedium);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.runtime-avatar--active { background: var(--colorPaletteGreenBackground2); }
.runtime-avatar--inactive { background: var(--colorNeutralBackground3); }

.app-name-block {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.app-name {
  font-size: var(--fontSizeBase400);
  font-weight: var(--fontWeightSemibold);
  color: var(--colorNeutralForeground1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-version {
  font-size: var(--fontSizeBase100);
  color: var(--colorNeutralForeground3);
}

.status-row {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalS);
}

.runtime-label {
  margin-left: auto;
  font-size: var(--fontSizeBase100);
  color: var(--colorNeutralForeground3);
}

.resource-info {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalXS);
  font-size: var(--fontSizeBase200);
  color: var(--colorNeutralForeground2);
}

.resource-spacer {
  margin-left: var(--spacingHorizontalM);
}

.spacer {
  flex: 1;
}
</style>
