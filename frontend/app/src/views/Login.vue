<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">Suzuran Cloud</h1>
      <p class="login-subtitle">AI 原生多租户应用平台</p>

      <fluent-message-bar v-if="errorMessage" intent="error" class="login-alert">
        {{ errorMessage }}
      </fluent-message-bar>
      <fluent-message-bar v-if="successMessage" intent="success" class="login-alert">
        {{ successMessage }}
      </fluent-message-bar>

      <!-- 用户名/密码登录（主要方式） -->
      <form @submit.prevent="handlePasswordLogin">
        <fluent-field class="login-field">
          <fluent-label>用户名</fluent-label>
          <fluent-text-input
            :value="username"
            @input="username = ($event.target as HTMLInputElement).value"
            placeholder="请输入用户名"
            required
            autocomplete="username"
            autocapitalize="off"
          />
          <span v-if="fieldErrors.username" class="field-error">{{ fieldErrors.username }}</span>
        </fluent-field>

        <fluent-field class="login-field">
          <fluent-label>密码</fluent-label>
          <div class="password-wrapper">
            <fluent-text-input
              :value="password"
              @input="password = ($event.target as HTMLInputElement).value"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              required
              autocomplete="current-password"
              class="password-input"
            />
            <fluent-button
              appearance="transparent"
              size="small"
              @click="showPassword = !showPassword"
              class="password-toggle"
            >
              <i :class="['mdi', showPassword ? 'mdi-eye-off' : 'mdi-eye']" style="font-size: 18px"></i>
            </fluent-button>
          </div>
          <span v-if="fieldErrors.password" class="field-error">{{ fieldErrors.password }}</span>
        </fluent-field>

        <fluent-button
          appearance="accent"
          size="large"
          type="submit"
          :disabled="loading"
          class="login-btn"
        >
          <fluent-spinner v-if="loading" size="small" />
          <span v-else>登录</span>
        </fluent-button>
      </form>

      <fluent-divider class="login-divider">或使用其他方式登录</fluent-divider>

      <!-- WebAuthn 登录 -->
      <fluent-button
        appearance="outline"
        size="large"
        :disabled="passkeyLoading"
        class="login-btn-secondary"
        @click="handlePasskeyLogin"
      >
        <i class="mdi mdi-fingerprint mdi-18px btn-icon"></i>
        <fluent-spinner v-if="passkeyLoading" size="small" />
        <span v-else>使用 Passkey 登录</span>
      </fluent-button>

      <!-- 钉钉 OAuth 登录 -->
      <fluent-button
        appearance="outline"
        size="large"
        :disabled="dingtalkLoading"
        class="login-btn-secondary"
        @click="handleDingTalkLogin"
      >
        <i class="mdi mdi-account-tie mdi-18px btn-icon"></i>
        <fluent-spinner v-if="dingtalkLoading" size="small" />
        <span v-else>钉钉登录</span>
      </fluent-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const passkeyLoading = ref(false)
const dingtalkLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const fieldErrors = ref<Record<string, string>>({})

// 验证规则
const rules = {
  required: (v: string, label: string) => !!v || `${label}为必填`,
  minLength: (v: string, min: number, label: string) => v.length >= min || `${label}至少 ${min} 位`,
}

function validateForm(): boolean {
  const errors: Record<string, string> = {}

  const usernameErr = rules.required(username.value, '用户名')
  if (usernameErr !== true) errors.username = usernameErr

  const passwordRequiredErr = rules.required(password.value, '密码')
  if (passwordRequiredErr !== true) {
    errors.password = passwordRequiredErr
  } else {
    const passwordMinErr = rules.minLength(password.value, 6, '密码')
    if (passwordMinErr !== true) errors.password = passwordMinErr
  }

  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

// 用户名/密码登录
const handlePasswordLogin = async () => {
  if (!validateForm()) return

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
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f6cbd 0%, #115ea3 50%, #0c3b5e 100%);
  padding: 1rem;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: var(--colorNeutralBackground1);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: var(--shadow16);
}

.login-title {
  font-size: 1.75rem;
  font-weight: 700;
  text-align: center;
  margin: 0 0 0.25rem 0;
  color: var(--colorNeutralForeground1);
}

.login-subtitle {
  text-align: center;
  margin: 0 0 1.5rem 0;
  color: var(--colorNeutralForeground3);
  font-size: 0.875rem;
}

.login-alert {
  margin-bottom: 1rem;
}

.login-field {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-error {
  font-size: 0.75rem;
  color: var(--colorPaletteRedForeground1);
  margin-top: 2px;
}

.password-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.password-input {
  flex: 1;
}

.password-toggle {
  flex-shrink: 0;
}

.login-btn {
  width: 100%;
  margin-top: 0.5rem;
  min-height: 44px;
  font-size: 1rem;
}

.login-divider {
  margin: 1.5rem 0;
}

.login-btn-secondary {
  width: 100%;
  margin-bottom: 0.75rem;
  min-height: 40px;
}

.btn-icon {
  margin-right: 8px;
}
</style>
