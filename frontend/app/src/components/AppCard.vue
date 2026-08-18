<template>
  <v-card
    :class="['app-card', { 'app-card--disabled': disabled }]"
    :elevation="disabled ? 1 : 3"
    :ripple="!disabled"
    @click="!disabled ? $emit('open', app) : null"
  >
    <!-- 状态指示条 -->
    <div :class="['status-bar', statusColor]" />

    <v-card-text class="pa-5">
      <!-- 图标 + 名称 -->
      <div class="d-flex align-center mb-3">
        <v-avatar :color="iconBgColor" size="48" class="mr-3">
          <v-icon :color="iconColor" size="28">{{ runtimeIcon }}</v-icon>
        </v-avatar>
        <div class="flex-grow-1 overflow-hidden">
          <div class="text-subtitle-1 font-weight-bold text-truncate">
            {{ app.name }}
          </div>
          <div class="text-caption text-grey">v{{ app.version || '0.0.0' }}</div>
        </div>
      </div>

      <!-- 状态标签 -->
      <div class="d-flex align-center mb-3">
        <v-chip
          :color="statusColor"
          size="small"
          variant="flat"
          label
        >
          <v-icon start size="small">{{ statusIcon }}</v-icon>
          {{ statusLabel }}
        </v-chip>
        <v-spacer />
        <span class="text-caption text-grey">{{ app.runtime || 'unknown' }}</span>
      </div>

      <!-- 资源信息 -->
      <div class="text-body-2 text-grey-darken-1">
        <v-icon size="small" class="mr-1">mdi-cpu-64-bit</v-icon>
        {{ app.cpuQuota || '无限制' }} CPU
        <v-icon size="small" class="ml-3 mr-1">mdi-memory</v-icon>
        {{ app.memoryQuota || '无限制' }}
      </div>
    </v-card-text>

    <v-card-actions v-if="!disabled" class="px-5 pb-4">
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        @click.stop="$emit('open', app)"
      >
        进入应用
        <v-icon end>mdi-arrow-right</v-icon>
      </v-btn>
      <v-spacer />
      <v-btn
        v-if="showDetails"
        size="small"
        variant="text"
        @click.stop="$emit('details', app)"
      >
        详情
        <v-icon end>mdi-chevron-right</v-icon>
      </v-btn>
      <v-btn
        v-if="showData"
        size="small"
        variant="text"
        @click.stop="$emit('data', app)"
      >
        数据管理
        <v-icon end>mdi-database</v-icon>
      </v-btn>
    </v-card-actions>
    <v-card-actions v-else class="px-5 pb-4">
      <v-btn disabled size="small" block variant="outlined">
        应用未运行
      </v-btn>
      <v-btn
        v-if="showData"
        size="small"
        variant="text"
        @click.stop="$emit('data', app)"
      >
        数据管理
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Application } from '../api/application'

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

const statusColor = computed(() => {
  switch (props.app.status) {
    case 'running':
      return 'success'
    case 'stopped':
      return 'grey'
    case 'created':
      return 'info'
    case 'error':
      return 'error'
    case 'building':
    case 'deploying':
      return 'warning'
    default:
      return 'grey'
  }
})

const statusIcon = computed(() => {
  switch (props.app.status) {
    case 'running':
      return 'mdi-play-circle'
    case 'stopped':
      return 'mdi-pause-circle'
    case 'created':
      return 'mdi-plus-circle'
    case 'error':
      return 'mdi-alert-circle'
    case 'building':
    case 'deploying':
      return 'mdi-sync'
    default:
      return 'mdi-help-circle'
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

const runtimeIcon = computed(() => {
  const rt = (props.app.runtime || '').toLowerCase()
  if (rt.includes('node')) return 'mdi-nodejs'
  if (rt.includes('python')) return 'mdi-language-python'
  if (rt.includes('go')) return 'mdi-language-go'
  return 'mdi-application'
})

const iconBgColor = computed(() => {
  if (props.app.status === 'running') return 'success-lighten-4'
  return 'grey-lighten-3'
})

const iconColor = computed(() => {
  if (props.app.status === 'running') return 'success'
  return 'grey'
})
</script>

<style scoped>
.app-card {
  height: 100%;
  transition: all 0.2s ease;
  cursor: pointer;
}

.app-card:hover:not(.app-card--disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
}

.app-card--disabled {
  opacity: 0.7;
  cursor: default;
}

.status-bar {
  height: 4px;
  width: 100%;
  border-radius: 4px 4px 0 0;
}
</style>
