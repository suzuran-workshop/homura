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
        v-if="isProvider"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-upload"
        class="mr-2"
        :loading="importing"
        @click="importDialog = true"
      >
        导入应用
      </v-btn>
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

    <!-- 导入应用对话框 -->
    <v-dialog v-model="importDialog" max-width="560">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2" color="primary">mdi-package-variant-closed</v-icon>
          导入应用
        </v-card-title>
        <v-card-text>
          <p class="text-body-2 text-grey-darken-1 mb-4">
            上传应用代码 zip 包（根目录须含 app.json 清单）。导入后代码存储于平台，
            不依赖本地目录，清库后可通过重新导入恢复。
          </p>
          <v-file-input
            v-model="importFile"
            label="选择 zip 包"
            accept=".zip,application/zip"
            prepend-icon="mdi-package-variant"
            :loading="importing"
          />
          <v-alert v-if="importError" type="error" closable class="mt-2">
            {{ importError }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="importDialog = false">取消</v-btn>
          <v-btn
            color="primary"
            :disabled="!importFile || importing"
            :loading="importing"
            @click="doImport"
          >
            导入
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
import { onMounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApplicationStore } from '../stores/application'
import { useAuthStore } from '../stores/auth'
import AppCard from '../components/AppCard.vue'
import { importApp, type Application } from '../api/application'

const appStore = useApplicationStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const importDialog = ref(false)
const importFile = ref<File | null>(null)
const importing = ref(false)
const importError = ref('')

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

async function doImport() {
  if (!importFile.value) return
  importing.value = true
  importError.value = ''
  try {
    const app = await importApp(importFile.value)
    importDialog.value = false
    importFile.value = null
    appStore.fetchApps()
    router.push(`/provider/apps/${app.data.id}`)
  } catch (e: any) {
    importError.value = e.response?.data?.error || '导入失败，请检查 zip 包格式'
  } finally {
    importing.value = false
  }
}
</script>
