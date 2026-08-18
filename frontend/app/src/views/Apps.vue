<template>
  <div>
    <!-- 页头 -->
    <div class="d-flex align-center mb-6">
      <h1 class="text-h4 font-weight-bold">
        <v-icon class="mr-2" color="primary">mdi-apps</v-icon>
        应用启动台
      </h1>
      <v-spacer />
      <v-btn
        color="primary"
        variant="text"
        prepend-icon="mdi-refresh"
        :loading="appStore.loading"
        @click="appStore.fetchApps()"
      >
        刷新
      </v-btn>
    </div>

    <!-- 错误提示 -->
    <v-alert
      v-if="appStore.error"
      type="error"
      class="mb-4"
      closable
    >
      {{ appStore.error }}
    </v-alert>

    <!-- 加载中 -->
    <div v-if="appStore.loading" class="text-center py-12">
      <v-progress-circular indeterminate color="primary" size="64" />
      <p class="text-body-1 mt-4 text-grey">正在加载应用列表...</p>
    </div>

    <!-- 空状态 -->
    <v-card
      v-else-if="appStore.apps.length === 0"
      class="text-center pa-12"
      variant="outlined"
    >
      <v-icon size="80" color="grey-lighten-1">mdi-store-outline</v-icon>
      <p class="text-h6 mt-4 text-grey-darken-1">还没有可用应用</p>
      <p class="text-body-2 text-grey">
        服务商可以在管理端部署应用，部署后将出现在这里
      </p>
    </v-card>

    <!-- 应用卡片网格 -->
    <template v-else>
      <!-- 运行中应用 -->
      <div v-if="appStore.runningApps.length > 0" class="mb-8">
        <h2 class="text-subtitle-1 font-weight-bold mb-3">
          <v-icon class="mr-1" color="success">mdi-circle-medium</v-icon>
          运行中 ({{ appStore.runningApps.length }})
        </h2>
        <v-row>
          <v-col
            v-for="app in appStore.runningApps"
            :key="app.id"
            cols="12"
            sm="6"
            md="4"
            lg="3"
          >
            <AppCard
              :app="app"
              :show-details="isProvider"
              :show-data="!!app.isAdmin"
              @open="openApp"
              @details="showDetails"
              @data="openData"
            />
          </v-col>
        </v-row>
      </div>

      <!-- 已停止应用 -->
      <div v-if="appStore.stoppedApps.length > 0">
        <h2 class="text-subtitle-1 font-weight-bold mb-3">
          <v-icon class="mr-1" color="grey">mdi-circle-medium</v-icon>
          未运行 ({{ appStore.stoppedApps.length }})
        </h2>
        <v-row>
          <v-col
            v-for="app in appStore.stoppedApps"
            :key="app.id"
            cols="12"
            sm="6"
            md="4"
            lg="3"
          >
            <AppCard
              :app="app"
              disabled
              :show-details="isProvider"
              :show-data="!!app.isAdmin"
              @details="showDetails"
              @data="openData"
            />
          </v-col>
        </v-row>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApplicationStore } from '../stores/application'
import { useAuthStore } from '../stores/auth'
import AppCard from '../components/AppCard.vue'
import type { Application } from '../api/application'

const appStore = useApplicationStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

// Provider portal shows a "details" link to AppDetail; tenant/user portals don't.
const isProvider = computed(() => route.path.startsWith('/provider'))

onMounted(() => {
  appStore.fetchApps()
})

function openApp(app: Application) {
  // Navigate to the app container via the proxy route
  // The backend's AppRouter will proxy requests to /apps/:appId/*
  window.open(`/apps/${app.id}/`, '_blank')
}

function showDetails(app: Application) {
  router.push(`/provider/apps/${app.id}`)
}

function openData(app: Application) {
  const orgId = authStore.user?.orgId
  router.push({ path: `/user/data/${app.id}`, query: orgId ? { orgId } : {} })
}
</script>
