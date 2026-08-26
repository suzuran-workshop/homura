<template>
  <div class="oobe-page">
    <div class="oobe-card">
      <div class="oobe-header">
        <i class="mdi mdi-cloud-plus" style="font-size: 28px; color: var(--colorBrandForeground1)"</i>
        <h1 class="oobe-title">Suzuran Cloud 初始化</h1>
      </div>
      <p class="oobe-description">
        欢迎使用 Suzuran Cloud！系统首次运行需要初始化配置。
      </p>

      <!-- Custom Stepper -->
      <div class="stepper">
        <div class="stepper-steps">
          <div
            v-for="s in 3"
            :key="s"
            class="stepper-step"
            :class="{ active: step === s, completed: step > s }"
          >
            <div class="step-circle">
              <i v-if="step > s" class="mdi mdi-check" style="font-size: 14px"></i>
              <span v-else>{{ s }}</span>
            </div>
            <span class="step-label">{{ stepLabels[s - 1] }}</span>
          </div>
          <div class="stepper-line">
            <fluent-progress-bar :value="((step - 1) / 2) * 100" />
          </div>
        </div>
      </div>

      <!-- Step 1: Create first admin user -->
      <div v-if="step === 1" class="step-content">
        <form @submit.prevent="createAdmin">
          <fluent-field class="oobe-field">
            <fluent-label>管理员姓名</fluent-label>
            <fluent-text-input
              :value="adminName"
              @input="adminName = ($event.target as HTMLInputElement).value"
              placeholder="请输入姓名"
              required
            />
            <span v-if="fieldErrors.adminName" class="field-error">{{ fieldErrors.adminName }}</span>
          </fluent-field>

          <fluent-field class="oobe-field">
            <fluent-label>邮箱地址</fluent-label>
            <fluent-text-input
              :value="adminEmail"
              @input="adminEmail = ($event.target as HTMLInputElement).value"
              placeholder="admin@example.com"
              type="email"
              required
            />
            <span v-if="fieldErrors.adminEmail" class="field-error">{{ fieldErrors.adminEmail }}</span>
          </fluent-field>

          <fluent-field class="oobe-field">
            <fluent-label>管理员用户名</fluent-label>
            <fluent-text-input
              :value="adminUsername"
              @input="adminUsername = ($event.target as HTMLInputElement).value"
              placeholder="admin-user"
              autocapitalize="off"
              required
            />
            <span v-if="fieldErrors.adminUsername" class="field-error">{{ fieldErrors.adminUsername }}</span>
          </fluent-field>

          <fluent-field class="oobe-field">
            <fluent-label>管理员密码</fluent-label>
            <div class="password-wrapper">
              <fluent-text-input
                :value="adminPassword"
                @input="adminPassword = ($event.target as HTMLInputElement).value"
                :type="showPwd ? 'text' : 'password'"
                placeholder="至少 6 位"
                required
                class="password-input"
              />
              <fluent-button
                appearance="transparent"
                size="small"
                @click="showPwd = !showPwd"
                class="password-toggle"
              >
                <i :class="['mdi', showPwd ? 'mdi-eye-off' : 'mdi-eye']" style="font-size: 18px"></i>
              </fluent-button>
            </div>
            <span v-if="fieldErrors.adminPassword" class="field-error">{{ fieldErrors.adminPassword }}</span>
          </fluent-field>

          <fluent-field class="oobe-field">
            <fluent-label>组织名称</fluent-label>
            <fluent-text-input
              :value="orgName"
              @input="orgName = ($event.target as HTMLInputElement).value"
              placeholder="我的公司"
              required
            />
            <span v-if="fieldErrors.orgName" class="field-error">{{ fieldErrors.orgName }}</span>
          </fluent-field>

          <fluent-button
            appearance="accent"
            size="large"
            type="submit"
            :disabled="loading"
            class="oobe-btn"
          >
            <fluent-spinner v-if="loading" size="small" />
            <span v-else>下一步</span>
          </fluent-button>
        </form>
      </div>

      <!-- Step 2: Register Passkey (optional) -->
      <div v-if="step === 2" class="step-content">
        <p class="step-text">
          管理员 <strong>{{ adminName }}</strong> 已创建成功，可以使用密码登录。
        </p>
        <p class="step-subtext">
          你也可以注册 Passkey（安全密钥）来增强安全性。
        </p>
        <p class="step-hint">
          Passkey 支持生物识别（指纹、面容）或硬件安全密钥，可作为密码的补充登录方式。
        </p>

        <fluent-button
          appearance="accent"
          size="large"
          :disabled="loading"
          class="oobe-btn"
          @click="registerPasskey"
        >
          <i class="mdi mdi-key mdi-18px btn-icon"></i>
          <fluent-spinner v-if="loading" size="small" />
          <span v-else>注册 Passkey（可选）</span>
        </fluent-button>

        <fluent-button
          appearance="outline"
          size="large"
          :disabled="loading"
          class="oobe-btn"
          @click="step = 3"
        >
          跳过，使用密码登录
        </fluent-button>

        <fluent-button
          appearance="subtle"
          size="large"
          :disabled="loading"
          class="oobe-btn"
          @click="step = 1"
        >
          <i class="mdi mdi-arrow-left mdi-18px btn-icon"></i>
          返回修改信息
        </fluent-button>
      </div>

      <!-- Step 3: Complete -->
      <div v-if="step === 3" class="step-content step-complete">
        <i class="mdi mdi-check-circle" style="font-size: 64px; color: var(--colorPaletteGreenForeground1)"</i>
        <h2 class="complete-title">初始化完成！</h2>
        <p class="step-text">
          管理员账户已创建，系统已准备就绪。
        </p>
        <fluent-button
          appearance="accent"
          size="large"
          class="oobe-btn"
          @click="goToLogin"
        >
          前往登录
        </fluent-button>
      </div>

      <fluent-message-bar
        v-if="errorMessage"
        intent="error"
        class="oobe-alert"
      >
        {{ errorMessage }}
      </fluent-message-bar>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import apiClient from '../api/client'
const router = useRouter()
const step = ref(1)
const loading = ref(false)
const errorMessage = ref('')
const showPwd = ref(false)
const fieldErrors = ref<Record<string, string>>({})

const stepLabels = ['创建管理员', '注册 Passkey', '完成']

// Step 1 fields
const adminName = ref('')
const adminEmail = ref('')
const adminUsername = ref('')
const adminPassword = ref('')
const orgName = ref('')

// Step 2 fields (stored after step 1)
let userId = 0

function validateStep1(): boolean {
  const errors: Record<string, string> = {}

  if (!adminName.value) errors.adminName = '姓名不能为空'

  if (!adminEmail.value) {
    errors.adminEmail = '邮箱不能为空'
  } else if (!/.+@.+\..+/.test(adminEmail.value)) {
    errors.adminEmail = '邮箱格式不正确'
  }

  if (!adminUsername.value) {
    errors.adminUsername = '用户名不能为空'
  } else if (!/^[a-z][a-z-]{2,49}$/.test(adminUsername.value)) {
    errors.adminUsername = '3-50位小写字母和连字符，以字母开头'
  }

  if (!adminPassword.value) {
    errors.adminPassword = '密码不能为空'
  } else if (adminPassword.value.length < 6) {
    errors.adminPassword = '密码至少 6 位'
  }

  if (!orgName.value) errors.orgName = '组织名称不能为空'

  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

async function createAdmin() {
  if (!validateStep1()) return

  loading.value = true
  errorMessage.value = ''

  try {
    // Call backend to create admin user and organization
    const resp = await apiClient.post('/oobe/setup', {
      adminName: adminName.value,
      adminEmail: adminEmail.value,
      adminUsername: adminUsername.value,
      adminPassword: adminPassword.value,
      orgName: orgName.value,
    })

    userId = resp.data.userId
    // orgId is returned but not needed for OOBE flow

    step.value = 2
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || error.message || '创建管理员失败'
  } finally {
    loading.value = false
  }
}

async function registerPasskey() {
  loading.value = true
  errorMessage.value = ''

  try {
    // Begin WebAuthn registration
    const beginResp = await apiClient.post('/oauth/webauthn/register/begin', {
      userId,
      name: adminName.value,
      email: adminEmail.value,
    })

    const rawOptions = beginResp.data.options.publicKey || beginResp.data.options

    // Decode base64url fields
    const options: PublicKeyCredentialCreationOptions = {
      challenge: base64UrlToBuffer(rawOptions.challenge) as BufferSource,
      rp: rawOptions.rp,
      user: {
        ...rawOptions.user,
        id: base64UrlToBuffer(rawOptions.user.id),
      },
      pubKeyCredParams: rawOptions.pubKeyCredParams,
      timeout: rawOptions.timeout,
      attestation: rawOptions.attestation,
      authenticatorSelection: rawOptions.authenticatorSelection,
      excludeCredentials: rawOptions.excludeCredentials?.map((c: any) => ({
        ...c,
        id: base64UrlToBuffer(c.id) as BufferSource,
      })),
      extensions: rawOptions.extensions,
    }

    // Create credential via browser
    const credential = await navigator.credentials.create({
      publicKey: options,
    }) as PublicKeyCredential

    if (!credential) {
      throw new Error('Passkey 创建已取消')
    }

    // Serialize and send finish
    const response = credential.response as AuthenticatorAttestationResponse
    const serialized = {
      id: credential.id,
      rawId: arrayBufferToBase64Url(credential.rawId),
      type: credential.type,
      response: {
        attestationObject: arrayBufferToBase64Url(response.attestationObject),
        clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      },
      clientExtensionResults: {},
    }

    await apiClient.post('/oauth/webauthn/register/finish', {
      sessionId: beginResp.data.sessionId,
      response: serialized,
    })

    step.value = 3
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || error.message || 'Passkey 注册失败'
  } finally {
    loading.value = false
  }
}

function goToLogin() {
  router.push('/login')
}

// Helper functions for base64url encoding/decoding
function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const base64 = btoa(bin)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/\//g, '/')
  const pad = base64.length % 4
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
</script>

<style scoped>
.oobe-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f6cbd 0%, #115ea3 50%, #0c3b5e 100%);
  padding: 1rem;
}

.oobe-card {
  width: 100%;
  max-width: 480px;
  background: var(--colorNeutralBackground1);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: var(--shadow16);
}

.oobe-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.oobe-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
  color: var(--colorNeutralForeground1);
}

.oobe-description {
  text-align: center;
  margin: 0 0 1.5rem 0;
  color: var(--colorNeutralForeground3);
  font-size: 0.875rem;
}

/* Stepper */
.stepper {
  margin-bottom: 1.5rem;
}

.stepper-steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  padding: 0 1rem;
}

.stepper-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 1;
}

.step-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 600;
  background: var(--colorNeutralBackground3);
  color: var(--colorNeutralForeground3);
  transition: all 0.2s;
}

.stepper-step.active .step-circle {
  background: var(--colorBrandBackground);
  color: var(--colorNeutralForegroundOnBrand);
}

.stepper-step.completed .step-circle {
  background: var(--colorPaletteGreenBackground3);
  color: var(--colorNeutralForegroundInverted);
}

.step-label {
  font-size: 0.75rem;
  color: var(--colorNeutralForeground3);
  white-space: nowrap;
}

.stepper-step.active .step-label {
  color: var(--colorBrandForeground1);
  font-weight: 600;
}

.stepper-line {
  position: absolute;
  top: 16px;
  left: 3rem;
  right: 3rem;
  z-index: 0;
}

/* Step content */
.step-content {
  padding: 0.5rem 0;
}

.step-complete {
  text-align: center;
}

.complete-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 1rem 0;
  color: var(--colorNeutralForeground1);
}

.step-text {
  font-size: 0.9375rem;
  margin: 0 0 0.5rem 0;
  color: var(--colorNeutralForeground1);
}

.step-subtext {
  font-size: 0.875rem;
  margin: 0 0 0.25rem 0;
  color: var(--colorNeutralForeground2);
}

.step-hint {
  font-size: 0.8125rem;
  margin: 0 0 1.5rem 0;
  color: var(--colorNeutralForeground3);
}

.oobe-field {
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

.oobe-btn {
  width: 100%;
  margin-bottom: 0.75rem;
  min-height: 40px;
}

.oobe-alert {
  margin-top: 1rem;
}

.btn-icon {
  margin-right: 8px;
}
</style>
