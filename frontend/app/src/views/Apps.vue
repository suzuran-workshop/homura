<template>
  <div>
    <!-- 页头 -->
    <div class="page-header">
      <div class="page-header-left">
        <i class="mdi mdi-apps mdi-24px" style="color: var(--colorBrandForeground1)"></i>
        <h1 class="page-title">应用启动台</h1>
      </div>
      <div class="page-header-right">
        <fluent-button
          v-if="isProvider"
          appearance="filled"
          :disabled="importing"
          @click="importDialog = true"
        >
          <i class="mdi mdi-upload" style="font-size: 14px"</i>
          导入应用
        </fluent-button>
        <fluent-button
          appearance="subtle"
          :disabled="appStore.loading"
          @click="appStore.fetchApps()"
        >
          <i class="mdi mdi-autorenew" style="font-size: 14px"</i>
          刷新
        </fluent-button>
      </div>
    </div>

    <!-- 导入应用对话框 -->
    <fluent-dialog :open="importDialog" @close="importDialog = false">
      <div class="dialog-header">
        <i class="mdi mdi-archive-outline" style="font-size: 20px; color: var(--colorBrandForeground1)"</i>
        <span class="dialog-title">导入应用</span>
      </div>
      <fluent-dialog-body>
        <p class="dialog-hint">
          上传应用代码 zip 包（根目录须含 app.json 清单）。导入后代码存储于平台，
          不依赖本地目录，清库后可通过重新导入恢复。
        </p>
        <div class="file-pick-row">
          <input
            ref="fileInputRef"
            type="file"
            accept=".zip,application/zip"
            style="display: none"
            @change="onFilePicked"
          />
          <fluent-button appearance="outlined" @click="fileInputRef?.click()">
            <i class="mdi mdi-folder" style="font-size: 14px"</i>
            {{ importFile ? importFile.name : '选择 zip 包' }}
          </fluent-button>
          <span v-if="importFile" class="file-name">{{ (importFile.size / 1024).toFixed(1) }} KB</span>
        </div>
        <fluent-message-bar v-if="importError" intent="error" class="mt-m">
          {{ importError }}
        </fluent-message-bar>
      </fluent-dialog-body>
      <div class="dialog-actions">
        <fluent-button appearance="subtle" @click="importDialog = false">取消</fluent-button>
        <fluent-button
          appearance="filled"
          :disabled="!importFile || importing"
          @click="doImport"
        >
          <fluent-spinner v-if="importing" size="small" />
          导入
        </fluent-button>
      </div>
    </fluent-dialog>

    <!-- 错误提示 -->
    <fluent-message-bar v-if="appStore.error" intent="error" class="mb-l">
      {{ appStore.error }}
    </fluent-message-bar>

    <!-- 加载中 -->
    <div v-if="appStore.loading" class="loading-state">
      <fluent-spinner size="large" />
      <p class="loading-text">正在加载应用列表...</p>
    </div>

    <!-- 空状态 -->
    <FluentCard v-else-if="appStore.apps.length === 0" outlined class="empty-state">
      <i class="mdi mdi-store" style="font-size: 80px; color: var(--colorNeutralForeground3)"</i>
      <h2 class="empty-title">还没有可用应用</h2>
      <p class="empty-hint">服务商可以在管理端部署应用，部署后将出现在这里</p>
    </FluentCard>

    <!-- 应用卡片网格 -->
    <template v-else>
      <!-- 运行中应用 -->
      <div v-if="appStore.runningApps.length > 0" class="section">
        <h2 class="section-title">
          <i class="mdi mdi-circle-medium" style="font-size: 12px; color: var(--colorPaletteGreenForeground1)"></i>
          运行中 ({{ appStore.runningApps.length }})
        </h2>
        <div class="app-grid">
          <AppCard
            v-for="app in appStore.runningApps"
            :key="app.id"
            :app="app"
            :show-details="isProvider"
            :show-data="!!app.isAdmin"
            @open="openApp"
            @details="showDetails"
            @data="openData"
          />
        </div>
      </div>

      <!-- 已停止应用 -->
      <div v-if="appStore.stoppedApps.length > 0" class="section">
        <h2 class="section-title">
          <i class="mdi mdi-circle-medium" style="font-size: 12px; color: var(--colorNeutralForeground3)"</i>
          未运行 ({{ appStore.stoppedApps.length }})
        </h2>
        <div class="app-grid">
          <AppCard
            v-for="app in appStore.stoppedApps"
            :key="app.id"
            :app="app"
            disabled
            :show-details="isProvider"
            :show-data="!!app.isAdmin"
            @details="showDetails"
            @data="openData"
          />
        </div>
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
import FluentCard from '../components/FluentCard.vue'
import { importApp, type Application } from '../api/application'

const appStore = useApplicationStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const importDialog = ref(false)
const importFile = ref<File | null>(null)
const importing = ref(false)
const importError = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const isProvider = computed(() => route.path.startsWith('/provider'))

onMounted(() => {
  appStore.fetchApps()
})

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  importFile.value = input.files?.[0] || null
}

function openApp(app: Application) {
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

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacingVerticalXL);
  flex-wrap: wrap;
  gap: var(--spacingVerticalM);
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalS);
}

.page-title {
  font-size: var(--fontSizeHero700);
  font-weight: var(--fontWeightBold);
  color: var(--colorNeutralForeground1);
  margin: 0;
}

.page-header-right {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalS);
}

/* Dialog */
.dialog-header {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalS);
  padding: var(--spacingVerticalL) var(--spacingHorizontalXL);
  border-bottom: 1px solid var(--colorNeutralStroke2);
}

.dialog-title {
  font-size: var(--fontSizeBase500);
  font-weight: var(--fontWeightSemibold);
}

.dialog-hint {
  font-size: var(--fontSizeBase200);
  color: var(--colorNeutralForeground2);
  margin: 0 0 var(--spacingVerticalM) 0;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacingHorizontalS);
  padding: var(--spacingVerticalM) var(--spacingHorizontalXL);
  border-top: 1px solid var(--colorNeutralStroke2);
}

.file-pick-row {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalM);
}

.file-name {
  font-size: var(--fontSizeBase200);
  color: var(--colorNeutralForeground2);
}

.mt-m { margin-top: var(--spacingVerticalM); }
.mb-l { margin-bottom: var(--spacingVerticalL); }

/* Loading */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacingVerticalXXXL) 0;
}

.loading-text {
  margin-top: var(--spacingVerticalL);
  font-size: var(--fontSizeBase300);
  color: var(--colorNeutralForeground2);
}

/* Empty */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacingVerticalXXXL) var(--spacingHorizontalXL);
  text-align: center;
}

.empty-title {
  font-size: var(--fontSizeBase500);
  font-weight: var(--fontWeightSemibold);
  margin: var(--spacingVerticalL) 0 var(--spacingVerticalS);
  color: var(--colorNeutralForeground1);
}

.empty-hint {
  font-size: var(--fontSizeBase200);
  color: var(--colorNeutralForeground2);
  margin: 0;
}

/* Sections */
.section {
  margin-bottom: var(--spacingVerticalXL);
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--spacingHorizontalXS);
  font-size: var(--fontSizeBase400);
  font-weight: var(--fontWeightSemibold);
  color: var(--colorNeutralForeground1);
  margin: 0 0 var(--spacingVerticalM) 0;
}

/* Grid */
.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--spacingHorizontalL);
}

/* Spinner animation */
.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
