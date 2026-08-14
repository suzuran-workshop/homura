<template>
  <v-app>
    <v-main class="oobe-bg">
      <v-container class="fill-height" fluid>
        <v-row align="center" justify="center">
          <v-col cols="12" sm="8" md="6" lg="4">
            <v-card class="elevation-8 rounded-lg">
              <v-card-title class="text-h5 text-center py-6">
                <v-icon size="large" color="primary" class="mr-2">mdi-cloud-plus</v-icon>
                Suzuran Cloud 初始化
              </v-card-title>
              <v-card-text>
                <p class="text-body-1 text-center mb-6">
                  欢迎使用 Suzuran Cloud！系统首次运行需要初始化配置。
                </p>

                <v-stepper v-model="step" class="elevation-0">
                  <v-stepper-header>
                    <v-stepper-item :value="1" title="创建管理员" />
                    <v-divider />
                    <v-stepper-item :value="2" title="注册 Passkey" />
                    <v-divider />
                    <v-stepper-item :value="3" title="完成" />
                  </v-stepper-header>

                  <v-stepper-window>
                    <!-- Step 1: Create first admin user -->
                    <v-stepper-window-item :value="1">
                      <v-form @submit.prevent="createAdmin" class="pa-4">
                        <v-text-field
                          v-model="adminName"
                          label="管理员姓名"
                          placeholder="请输入姓名"
                          :rules="[v => !!v || '姓名不能为空']"
                          required
                          class="mb-4"
                        />
                        <v-text-field
                          v-model="adminEmail"
                          label="邮箱地址"
                          placeholder="admin@example.com"
                          type="email"
                          :rules="[v => !!v || '邮箱不能为空', v => /.+@.+\..+/.test(v) || '邮箱格式不正确']"
                          required
                          class="mb-4"
                        />
                        <v-text-field
                          v-model="orgName"
                          label="组织名称"
                          placeholder="我的公司"
                          :rules="[v => !!v || '组织名称不能为空']"
                          required
                          class="mb-4"
                        />
                        <v-btn
                          type="submit"
                          color="primary"
                          block
                          :loading="loading"
                          :disabled="loading"
                        >
                          下一步
                        </v-btn>
                      </v-form>
                    </v-stepper-window-item>

                    <!-- Step 2: Register Passkey -->
                    <v-stepper-window-item :value="2">
                      <div class="pa-4">
                        <p class="text-body-1 mb-4">
                          现在为管理员 <strong>{{ adminName }}</strong> 注册 Passkey（安全密钥）。
                        </p>
                        <p class="text-body-2 text-grey-darken-1 mb-6">
                          Passkey 用于无密码登录，支持生物识别（指纹、面容）或硬件安全密钥。
                        </p>
                        <v-btn
                          color="primary"
                          block
                          :loading="loading"
                          :disabled="loading"
                          @click="registerPasskey"
                        >
                          <v-icon start>mdi-key</v-icon>
                          注册 Passkey
                        </v-btn>
                        <v-btn
                          variant="text"
                          block
                          class="mt-3"
                          :disabled="loading"
                          @click="step = 1"
                        >
                          <v-icon start>mdi-arrow-left</v-icon>
                          返回修改信息
                        </v-btn>
                      </div>
                    </v-stepper-window-item>

                    <!-- Step 3: Complete -->
                    <v-stepper-window-item :value="3">
                      <div class="pa-4 text-center">
                        <v-icon size="64" color="success" class="mb-4">mdi-check-circle</v-icon>
                        <h3 class="text-h6 mb-4">初始化完成！</h3>
                        <p class="text-body-1 mb-6">
                          管理员账户已创建，系统已准备就绪。
                        </p>
                        <v-btn
                          color="primary"
                          block
                          @click="goToLogin"
                        >
                          前往登录
                        </v-btn>
                      </div>
                    </v-stepper-window-item>
                  </v-stepper-window>
                </v-stepper>

                <v-alert
                  v-if="errorMessage"
                  type="error"
                  class="mt-4"
                  closable
                  @click:close="errorMessage = ''"
                >
                  {{ errorMessage }}
                </v-alert>
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
import apiClient from '../api/client'

const router = useRouter()
const step = ref(1)
const loading = ref(false)
const errorMessage = ref('')

// Step 1 fields
const adminName = ref('')
const adminEmail = ref('')
const orgName = ref('')

// Step 2 fields (stored after step 1)
let userId = 0

async function createAdmin() {
  loading.value = true
  errorMessage.value = ''

  try {
    // Call backend to create admin user and organization
    const resp = await apiClient.post('/oobe/setup', {
      adminName: adminName.value,
      adminEmail: adminEmail.value,
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
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
</script>

<style scoped>
.oobe-bg {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
</style>
