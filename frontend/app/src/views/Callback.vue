<template>
  <v-app>
    <v-main class="callback-bg">
      <v-container>
        <v-row justify="center" align="center" style="height: 100vh">
          <v-col cols="12" sm="8" md="6" lg="4">
            <v-card elevation="8" class="pa-6">
              <v-card-title class="text-h4 font-weight-bold text-center">
                钉钉登录中...
              </v-card-title>

              <v-card-text>
                <v-alert v-if="errorMessage" type="error" class="mb-4">
                  {{ errorMessage }}
                </v-alert>

                <div v-if="!errorMessage" class="text-center">
                  <v-progress-circular
                    indeterminate
                    color="primary"
                    size="64"
                    class="mb-4"
                  />
                  <p class="text-body-1 text-grey-darken-1">
                    正在处理钉钉授权，请稍候...
                  </p>
                </div>

                <!-- 组织选择（如果用户有多个组织） -->
                <div v-if="showOrgSelector">
                  <v-divider class="my-4" />
                  <h3 class="text-subtitle-1 font-weight-bold mb-2">选择登录组织</h3>
                  <v-list>
                    <v-list-item
                      v-for="org in availableOrgs"
                      :key="org.orgId"
                      @click="selectOrg(org.orgId)"
                    >
                      <v-list-item-title>{{ org.orgName }}</v-list-item-title>
                      <v-list-item-subtitle>
                        {{ org.isAdmin ? '管理员' : '普通成员' }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-list>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
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
.callback-bg {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}
</style>
