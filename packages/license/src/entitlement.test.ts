/**
 * 授权采信与处置的特性测试（跨 client.ts 与 guard.ts）。
 *
 * 这里锁的是安全语义，不是接口形状：
 * - 验签失败时**一律不采信**载荷里的 enforcement / features / notice（否则篡改者可自选处置强度）
 * - 到期在本地判定，不等心跳；时钟偏差用中心 serverTime 校正
 * - 处置强度四档各自的拦截范围，以及"非 active 必带强提醒"
 *
 * 测试自行用 node:crypto 签发（模拟中心），不依赖 ../homura-genuine 进程。
 */
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import {
  canonicalize,
  keyIdOf,
  type LicenseEntitlement,
  type RegisterResponse,
  type SignedEntitlement,
} from './contract.js'
import { LicenseClient } from './client.js'
import { LICENSE_STATUS_PATH, licenseGuard, requireFeature } from './guard.js'

const ISO = '2026-10-14T00:00:00.000Z'
const NOW = Date.parse(ISO)

function makeKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  return { pub, priv, keyId: keyIdOf(pub) }
}

const KEY = makeKey()
const OTHER = makeKey()

function entitlement(over: Partial<LicenseEntitlement> = {}): LicenseEntitlement {
  return {
    licenseId: 'lic-1',
    productId: 'p',
    appId: 'a',
    instanceKey: 'inst-1',
    status: 'active',
    expiresAt: null,
    enforcement: 'none',
    features: ['basic'],
    notice: null,
    issuedAt: ISO,
    serverTime: ISO,
    heartbeatIntervalSec: 300,
    graceSec: 60,
    ...over,
  }
}

function signWith(
  key: { priv: string; keyId: string },
  ent: LicenseEntitlement,
): SignedEntitlement {
  return {
    entitlement: ent,
    signature: cryptoSign(null, Buffer.from(canonicalize(ent)), key.priv).toString('base64url'),
    keyId: key.keyId,
  }
}

function registerResp(license: SignedEntitlement): RegisterResponse {
  return {
    licenseId: license.entitlement.licenseId,
    status: license.entitlement.status,
    heartbeatIntervalSec: 300,
    graceSec: 60,
    issuedAt: ISO,
    license,
  }
}

/** 造一个只会返回固定响应的 client（now 固定，避免宽限期干扰） */
function clientReturning(
  body: unknown,
  cfg: { publicKey?: string; onInvalidSignature?: 'suspend' | 'ignore' } = {},
) {
  const fetchImpl = (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
  return new LicenseClient({
    server: 'http://genuine.test',
    productId: 'p',
    appId: 'a',
    instanceKey: 'inst-1',
    fetchImpl,
    now: () => NOW,
    ...cfg,
  })
}

async function registered(client: LicenseClient) {
  await client.register()
  return client
}

function guardedApp(client: LicenseClient, opts?: Parameters<typeof licenseGuard>[1]) {
  const app = new Hono()
  app.use('*', licenseGuard(client, { healthzPath: '/healthz', ...opts }))
  app.get('/healthz', (c) => c.text('healthy'))
  app.get(LICENSE_STATUS_PATH, (c) => c.json({ status: client.getStatus() }))
  app.get('/api/todos', (c) => c.text('todos'))
  app.get('/api/export', requireFeature(client, 'export'), (c) => c.text('exported'))
  app.get('/', (c) => c.text('home'))
  return app
}

describe('LicenseClient — 验签采信', () => {
  it('签名有效 → active，功能范围可用，处置强度 none', async () => {
    const c = await registered(
      clientReturning(registerResp(signWith(KEY, entitlement())), { publicKey: KEY.pub }),
    )
    expect(c.getStatus()).toBe('active')
    expect(c.getSignatureState()).toEqual({ kind: 'verified' })
    expect(c.hasFeature('basic')).toBe(true)
    expect(c.getEnforcement()).toBe('none')
    expect(c.getNotice()).toBeNull()
  })

  it('载荷被篡改（加功能）→ suspended，且**不采信**载荷里的 enforcement/features', async () => {
    const signed = signWith(KEY, entitlement({ features: ['basic'], enforcement: 'none' }))
    const tampered: SignedEntitlement = {
      ...signed,
      entitlement: {
        ...signed.entitlement,
        features: ['basic', 'export', 'admin'],
        enforcement: 'none',
      },
    }
    const c = await registered(clientReturning(registerResp(tampered), { publicKey: KEY.pub }))
    expect(c.getStatus()).toBe('suspended')
    expect(c.getSignatureState().kind).toBe('invalid')
    // 关键：篡改者不能通过把 enforcement 写成 none 来让自己只被"提醒"
    expect(c.getEnforcement()).toBe('all')
    expect(c.hasFeature('export')).toBe(false)
    expect(c.getNotice()).toMatch(/校验失败/)
  })

  it('篡改到期日 → suspended（不可信授权一律最严处置）', async () => {
    const signed = signWith(KEY, entitlement({ expiresAt: '2026-01-01T00:00:00.000Z' }))
    const tampered: SignedEntitlement = {
      ...signed,
      entitlement: { ...signed.entitlement, expiresAt: '2099-01-01T00:00:00.000Z' },
    }
    const c = await registered(clientReturning(registerResp(tampered), { publicKey: KEY.pub }))
    expect(c.getStatus()).toBe('suspended')
    expect(c.getEnforcement()).toBe('all')
  })

  it('用别的私钥签（keyId 对不上）→ suspended，原因指向密钥轮换', async () => {
    const c = await registered(
      clientReturning(registerResp(signWith(OTHER, entitlement())), { publicKey: KEY.pub }),
    )
    expect(c.getStatus()).toBe('suspended')
    const sig = c.getSignatureState()
    expect(sig.kind).toBe('invalid')
    expect(sig.kind === 'invalid' && sig.reason).toMatch(/轮换/)
  })

  it('授权签给别的实例（instanceKey 不符）→ suspended，即使签名本身有效', async () => {
    const signed = signWith(KEY, entitlement({ instanceKey: 'inst-OTHER' }))
    const c = await registered(clientReturning(registerResp(signed), { publicKey: KEY.pub }))
    expect(c.getStatus()).toBe('suspended')
    const sig = c.getSignatureState()
    expect(sig.kind === 'invalid' && sig.reason).toMatch(/实例/)
  })

  it("onInvalidSignature='ignore'（调试档）→ 不改状态，但功能范围仍默认拒绝", async () => {
    const signed = signWith(KEY, entitlement({ features: ['basic', 'export'] }))
    // 手动破坏签名以模拟篡改
    const broken = { ...signed, signature: `${signed.signature}AA` }
    const c = await registered(
      clientReturning(registerResp(broken), { publicKey: KEY.pub, onInvalidSignature: 'ignore' }),
    )
    expect(c.getStatus()).not.toBe('suspended')
    expect(c.getSignatureState().kind).toBe('invalid') // 仍记录在案，可被健康检查暴露
    expect(c.hasFeature('export')).toBe(false) // 不可信载荷永不授权功能
    // ignore 的语义就是"不处置"：状态与处置强度按未验签的响应走，故为 none（生产禁用此档）
    expect(c.getEnforcement()).toBe('none')
  })

  it('未配公钥 → 不验签（unverified），退回标量状态但不采信功能范围', async () => {
    const c = await registered(clientReturning(registerResp(signWith(KEY, entitlement()))))
    expect(c.getSignatureState().kind).toBe('unverified')
    expect(c.getStatus()).toBe('active')
    expect(c.hasFeature('basic')).toBe(false) // 未验签 → 默认拒绝
  })

  it('旧版中心不下发 license 字段 → 向后兼容，用标量 status', async () => {
    const c = await registered(
      clientReturning({
        licenseId: 'lic-1',
        status: 'active',
        heartbeatIntervalSec: 300,
        graceSec: 60,
        issuedAt: ISO,
      }),
    )
    expect(c.getSignatureState()).toEqual({ kind: 'absent' })
    expect(c.getStatus()).toBe('active')
    expect(c.getEntitlement()).toBeNull()
  })
})

describe('LicenseClient — 到期本地判定（不等心跳）', () => {
  it('expiresAt 已过 → expired，处置强度取载荷值，notice 非空', async () => {
    const signed = signWith(
      KEY,
      entitlement({
        status: 'expired',
        expiresAt: '2026-10-13T00:00:00.000Z',
        enforcement: 'core',
        notice: '授权已到期，请续期',
      }),
    )
    const c = await registered(clientReturning(registerResp(signed), { publicKey: KEY.pub }))
    expect(c.getStatus()).toBe('expired')
    expect(c.getEnforcement()).toBe('core')
    expect(c.getNotice()).toBe('授权已到期，请续期')
  })

  it('中心说 active 但 expiresAt 已过（中心时钟与本地不一致）→ 本地判为 expired', async () => {
    const signed = signWith(
      KEY,
      entitlement({ status: 'active', expiresAt: '2026-10-13T00:00:00.000Z' }),
    )
    const c = await registered(clientReturning(registerResp(signed), { publicKey: KEY.pub }))
    expect(c.getStatus()).toBe('expired')
  })

  it('用户回拨系统时间也判过期（用 serverTime 校正偏差）', async () => {
    // 中心时间比本地"快"两天：本地时钟被回拨，偏差校正后仍判过期
    const localNow = NOW - 2 * 86_400_000
    const signed = signWith(
      KEY,
      entitlement({ serverTime: ISO, expiresAt: new Date(NOW - 86_400_000).toISOString() }),
    )
    const fetchImpl = (async () =>
      new Response(JSON.stringify(registerResp(signed)), {
        status: 200,
      })) as unknown as typeof fetch
    const c = new LicenseClient({
      server: 'http://g',
      productId: 'p',
      appId: 'a',
      instanceKey: 'inst-1',
      fetchImpl,
      now: () => localNow,
      publicKey: KEY.pub,
    })
    await c.register()
    expect(c.getStatus()).toBe('expired')
  })

  it('expiresAt=null → 永不过期', async () => {
    const signed = signWith(KEY, entitlement({ expiresAt: null }))
    const c = await registered(clientReturning(registerResp(signed), { publicKey: KEY.pub }))
    expect(c.getStatus()).toBe('active')
  })
})

describe('licenseGuard — 四档处置与强提醒', () => {
  async function clientWithStatus(over: Partial<LicenseEntitlement>) {
    const signed = signWith(KEY, entitlement(over))
    return registered(clientReturning(registerResp(signed), { publicKey: KEY.pub }))
  }

  it('all：全站 503（豁免路径除外），带 status 与 notice 头', async () => {
    const c = await clientWithStatus({
      status: 'expired',
      expiresAt: '2026-01-01T00:00:00.000Z',
      enforcement: 'all',
      notice: '已到期',
    })
    const app = guardedApp(c)
    const api = await app.request('/api/todos')
    expect(api.status).toBe(503)
    await expect(api.json()).resolves.toMatchObject({
      error: 'license_expired',
      enforcement: 'all',
    })
    expect(api.headers.get('X-Homura-License-Status')).toBe('expired')
    expect(decodeURI(api.headers.get('X-Homura-License-Notice') ?? '')).toBe('已到期')
    expect((await app.request('/')).status).toBe(503)
    expect((await app.request('/healthz')).status).toBe(200) // 豁免
  })

  it('core：核心路径 503，页面放行但仍带强提醒头', async () => {
    const c = await clientWithStatus({
      status: 'expired',
      expiresAt: '2026-01-01T00:00:00.000Z',
      enforcement: 'core',
      notice: '部分功能已停用',
    })
    const app = guardedApp(c)
    expect((await app.request('/api/todos')).status).toBe(503)
    const home = await app.request('/')
    expect(home.status).toBe(200)
    expect(decodeURI(home.headers.get('X-Homura-License-Notice') ?? '')).toBe('部分功能已停用')
  })

  it('core 的 corePaths 可配（自定义核心路径）', async () => {
    const c = await clientWithStatus({
      status: 'suspended',
      enforcement: 'core',
      notice: 'x',
    })
    const app = guardedApp(c, { corePaths: ['/'] })
    expect((await app.request('/')).status).toBe(503)
    expect((await app.request('/api/todos')).status).toBe(200)
  })

  it('notice：功能全开，但每个响应都带强提醒', async () => {
    const c = await clientWithStatus({
      status: 'expired',
      expiresAt: '2026-01-01T00:00:00.000Z',
      enforcement: 'notice',
      notice: '即将停用，请尽快续期',
    })
    const app = guardedApp(c)
    const api = await app.request('/api/todos')
    expect(api.status).toBe(200)
    expect(decodeURI(api.headers.get('X-Homura-License-Notice') ?? '')).toContain('续期')
    expect((await app.request('/')).headers.get('X-Homura-License-Status')).toBe('expired')
  })

  it('none：只记录，不拦也不提醒', async () => {
    const c = await clientWithStatus({ status: 'suspended', enforcement: 'none' })
    const app = guardedApp(c)
    const res = await app.request('/api/todos')
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Homura-License-Notice')).toBeNull()
  })

  it('active：无任何授权头', async () => {
    const c = await clientWithStatus({})
    const res = await guardedApp(c).request('/api/todos')
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Homura-License-Status')).toBeNull()
  })

  it('active + 中心显式预警文案 → 功能不受影响，但响应仍带 notice 头', async () => {
    const c = await clientWithStatus({ status: 'active', notice: '将于 3 天后到期，请续期' })
    const res = await guardedApp(c).request('/api/todos')
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Homura-License-Status')).toBe('active')
    expect(decodeURI(res.headers.get('X-Homura-License-Notice') ?? '')).toBe(
      '将于 3 天后到期，请续期',
    )
    expect(c.getEnforcement()).toBe('none')
  })

  it('验签失败时的提醒文案是安全告警，不采信载荷里的文案', async () => {
    const signed = signWith(KEY, entitlement({ notice: '一切正常，请放心使用' }))
    const broken = { ...signed, signature: `${signed.signature}AA` }
    const c = await registered(clientReturning(registerResp(broken), { publicKey: KEY.pub }))
    expect(c.getNotice()).toMatch(/校验失败/)
    expect(c.getNotice()).not.toContain('放心使用')
  })

  it('授权状态端点在 all 档下仍可读（否则前端无法解释为什么全站 503）', async () => {
    const c = await clientWithStatus({ status: 'suspended', enforcement: 'all', notice: 'n' })
    const res = await guardedApp(c).request(LICENSE_STATUS_PATH)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ status: 'suspended' })
  })

  it('notice 头对中文安全（HTTP 头只能承载 latin1，故 URI 编码传输）', async () => {
    const c = await clientWithStatus({
      status: 'suspended',
      enforcement: 'notice',
      notice: '授权已到期，请联系供应方',
    })
    const res = await guardedApp(c).request('/')
    const raw = res.headers.get('X-Homura-License-Notice') ?? ''
    expect(raw).not.toMatch(/[^\x20-\x7e]/)
    expect(decodeURI(raw)).toBe('授权已到期，请联系供应方')
  })
})

describe('requireFeature — 功能范围闸门', () => {
  it('授权含该功能 → 放行', async () => {
    const signed = signWith(KEY, entitlement({ features: ['basic', 'export'] }))
    const c = await registered(clientReturning(registerResp(signed), { publicKey: KEY.pub }))
    const res = await guardedApp(c).request('/api/export')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('exported')
  })

  it('授权不含该功能 → 403 feature_not_licensed', async () => {
    const signed = signWith(KEY, entitlement({ features: ['basic'] }))
    const c = await registered(clientReturning(registerResp(signed), { publicKey: KEY.pub }))
    const res = await guardedApp(c).request('/api/export')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: 'feature_not_licensed',
      feature: 'export',
    })
  })

  it('授权不可信（篡改）→ 默认拒绝，即使载荷里写了该功能', async () => {
    const signed = signWith(KEY, entitlement({ features: ['basic'] }))
    const tampered: SignedEntitlement = {
      ...signed,
      entitlement: { ...signed.entitlement, features: ['basic', 'export'] },
    }
    const c = await registered(clientReturning(registerResp(tampered), { publicKey: KEY.pub }))
    expect((await guardedApp(c, { enforcement: 'none' }).request('/api/export')).status).toBe(403)
  })
})
