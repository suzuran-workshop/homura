<template>
  <div class="callback-page">
    <div class="callback-card">
      <h1 class="callback-title">钉钉登录中...</h1>

      <fluent-message-bar v-if="errorMessage" intent="error" class="callback-alert">
        {{ errorMessage }}
      </fluent-message-bar>

      <div v-if="!errorMessage" class="callback-loading">
        <fluent-spinner size="large" />
        <p class="callback-text">
          正在处理钉钉授权，请稍候...
        </p>
      </div>

      <!-- 组织选择（如果用户有多个组织） -->
      <div v-if="showOrgSelector" class="org-selector">
        <fluent-divider class="selector-divider" />
        <h3 class="selector-title">选择登录组织</h3>
        <div class="org-list">
          <div
            v-for="org in availableOrgs"
            :key="org.orgId"
            class="org-item"
            @click="selectOrg(org.orgId)"
          >
            <span class="org-name">{{ org.orgName }}</span>
            <span class="org-role">{{ org.isAdmin ? '管理员' : '普通成员' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import apiClient from '../api/client'

const router = useRouter()
const authStore = useAuthStore()

const errorMessage = ref('')
const showOrgSelector = ref(false)
const availableOrgs = ref<any[]>([])
const loginSessionId = ref('')

onMounted(async () => {
  // Extract code and state from URL query params
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')

  if (!code) {
    errorMessage.value = '缺少钉钉授权码'
    return
  }

  try {
    // Call backend DingTalk callback endpoint
    const resp = await apiClient.get('/oauth/dingtalk/callback', {
      params: { code, state },
    })

    const data = resp.data
    loginSessionId.value = data.sessionId
    availableOrgs.value = data.availableOrgs || []

    if (availableOrgs.value.length === 0) {
      errorMessage.value = '您尚未加入任何组织，请联系管理员'
    } else if (availableOrgs.value.length === 1) {
      // Auto-select the only org
      await selectOrg(availableOrgs.value[0].orgId)
    } else {
      // Multiple orgs: show selector
      showOrgSelector.value = true
    }
  } catch (error: any) {
    console.error('DingTalk callback failed:', error)
    errorMessage.value = error.response?.data?.error || '钉钉登录失败'
  }
})

async function selectOrg(orgId: number) {
  try {
    await authStore.completeLoginWithToken(loginSessionId.value, orgId)

    const role = authStore.userRole
    if (role === 'provider') {
      router.push('/provider/dashboard')
    } else {
      router.push('/user')
    }
  } catch (error: any) {
    console.error('Token exchange failed:', error)
    errorMessage.value = error.response?.data?.error || '获取登录令牌失败'
  }
}
</script>

<style scoped>
.callback-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f6cbd 0%, #115ea3 50%, #0c3b5e 100%);
  padding: 1rem;
}

.callback-card {
  width: 100%;
  max-width: 420px;
  background: var(--colorNeutralBackground1);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: var(--shadow16);
}

.callback-title {
  font-size: 1.5rem;
  font-weight: 700;
  text-align: center;
  margin: 0 0 1.5rem 0;
  color: var(--colorNeutralForeground1);
}

.callback-alert {
  margin-bottom: 1rem;
}

.callback-loading {
  text-align: center;
  padding: 1rem 0;
}

.callback-text {
  color: var(--colorNeutralForeground3);
  font-size: 0.9375rem;
  margin-top: 1rem;
}

.org-selector {
  margin-top: 0.5rem;
}

.selector-divider {
  margin: 1rem 0;
}

.selector-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.75rem 0;
  color: var(--colorNeutralForeground1);
}

.org-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.org-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.org-item:hover {
  background: var(--colorNeutralBackground1Hover);
}

.org-name {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--colorNeutralForeground1);
}

.org-role {
  font-size: 0.8125rem;
  color: var(--colorNeutralForeground3);
}
</style>
