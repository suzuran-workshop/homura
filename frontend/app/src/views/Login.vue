<template>
  <v-app>
    <v-main class="login-bg">
      <v-container>
        <v-row justify="center" align="center" style="height: 100vh">
          <v-col cols="12" sm="8" md="6" lg="4">
            <v-card elevation="8" class="pa-2">
              <v-card-title class="text-h4 font-weight-bold text-center mt-6">
                Suzuran Cloud
              </v-card-title>
              <v-card-subtitle class="text-center mb-4">
                AI 原生多租户应用平台
              </v-card-subtitle>

              <v-card-text>
                <v-alert v-if="errorMessage" type="error" class="mb-4" closable>
                  {{ errorMessage }}
                </v-alert>
                <v-alert v-if="successMessage" type="success" class="mb-4" closable>
                  {{ successMessage }}
                </v-alert>

                <!-- 用户名/密码登录（主要方式） -->
                <v-form ref="form" @submit.prevent="handlePasswordLogin">
                  <v-text-field
                    v-model="username"
                    label="用户名"
                    prepend-inner-icon="mdi-account"
                    required
                    :rules="[rules.required]"
                    autocomplete="username"
                    autocapitalize="off"
                    class="mb-3"
                  />

                  <v-text-field
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    label="密码"
                    prepend-inner-icon="mdi-lock"
                    :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                    required
                    :rules="[rules.required, rules.minLength]"
                    autocomplete="current-password"
                    class="mb-4"
                    @click:append-inner="showPassword = !showPassword"
                  />

                  <v-btn
                    type="submit"
                    color="primary"
                    size="x-large"
                    block
                    :loading="loading"
                  >
                    登录
                  </v-btn>
                </v-form>

                <v-divider class="my-6">或使用其他方式登录</v-divider>

                <!-- WebAuthn 登录 -->
                <v-btn
                  color="secondary"
                  size="large"
                  block
                  variant="outlined"
                  :loading="passkeyLoading"
                  prepend-icon="mdi-fingerprint"
                  class="mb-3"
                  @click="handlePasskeyLogin"
                >
                  使用 Passkey 登录
                </v-btn>

                <!-- 钉钉 OAuth 登录 -->
                <v-btn
                  color="info"
                  size="large"
                  block
                  variant="outlined"
                  :loading="dingtalkLoading"
                  prepend-icon="mdi-account-tie"
                  @click="handleDingTalkLogin"
                >
                  钉钉登录
                </v-btn>

              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const form = ref()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const passkeyLoading = ref(false)
const dingtalkLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

// 验证规则
const rules = {
  required: (v: string) => !!v || '必填',
  minLength: (v: string) => v.length >= 6 || '密码至少 6 位',
}

// 用户名/密码登录
const handlePasswordLogin = async () => {
  const { valid } = await form.value.validate()
  if (!valid) return

  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    // Step 1: 使用用户名/密码登录，获取 sessionId + availableOrgs
    const result = await authStore.loginWithUsernamePassword(username.value, password.value)

    // Step 2: 如果有可用组织，选择第一个并换取 token
    if (result.availableOrgs.length > 0) {
      const org = result.availableOrgs[0]
      await authStore.completeLoginWithToken(result.sessionId, org.orgId)
      successMessage.value = `已登录组织：${org.orgName}`
    }

    // Step 3: 根据角色路由
    const role = authStore.userRole
    if (role === 'provider') {
      router.push('/provider/dashboard')
    } else {
      router.push('/user')
    }
  } catch (error: any) {
    console.error('Password login failed:', error)
    errorMessage.value = error.response?.data?.error || error.message || '用户名或密码错误'
  } finally {
    loading.value = false
  }
}

// WebAuthn 登录流程：begin（空 identifier = discoverable）→ 浏览器弹窗 → finish → 拿 sessionId → 选组织 → 拿 token
const handlePasskeyLogin = async () => {
  passkeyLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    // Step 1: Complete WebAuthn ceremony, get sessionId + availableOrgs
    const result = await authStore.loginWithPasskey()

    // Step 2: If user has available orgs, select the first one and exchange for tokens
    if (result.availableOrgs.length > 0) {
      const org = result.availableOrgs[0]
      await authStore.completeLoginWithToken(result.sessionId, org.orgId)
      successMessage.value = `已登录组织：${org.orgName}`
    }

    // Step 3: Route based on role
    const role = authStore.userRole
    if (role === 'provider') {
      router.push('/provider/dashboard')
    } else {
      router.push('/user')
    }
  } catch (error: any) {
    console.error('Passkey login failed:', error)
    errorMessage.value = error.response?.data?.error || error.message || 'Passkey 登录失败'
  } finally {
    passkeyLoading.value = false
  }
}

const handleDingTalkLogin = async () => {
  dingtalkLoading.value = true
  errorMessage.value = ''
  try {
    // Redirect to DingTalk OAuth; the callback will be handled by Callback.vue
    const redirectURI = `${window.location.origin}/oauth/dingtalk/callback`
    await authStore.redirectToDingTalk(redirectURI)
  } catch (error: any) {
    console.error('DingTalk login failed:', error)
    errorMessage.value = error.response?.data?.error || '钉钉登录跳转失败'
    dingtalkLoading.value = false
  }
}
</script>

<style scoped>
.login-bg {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}
</style>
