import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { LicenseBanner, type LicenseState } from './LicenseBanner'
import type { Todo } from '../shared/types'

type Me = { sub: string; nickname?: string; avatarUrl?: string } | null

export default function App() {
  const [me, setMe] = useState<Me>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')
  const [caps, setCaps] = useState<string[] | null>(null)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [notice, setNotice] = useState<string>('')
  const [license, setLicense] = useState<LicenseState | null>(null)
  const [demoMsg, setDemoMsg] = useState<string>('')
  // 密码登录/注册表单（层级 2：TextPassword，演示 api.passwordLogin/passwordRegister）
  const [pwUser, setPwUser] = useState('')
  const [pwPass, setPwPass] = useState('')
  const [pwMsg, setPwMsg] = useState('')

  const refresh = useCallback(async () => {
    const [{ user }, { todos: list }] = await Promise.all([api.me(), api.listTodos()])
    setMe(user)
    setTodos(list)
    const cap = await api.capabilities()
    setCaps(cap?.capabilities ?? null)
    // 读授权状态（未启用 license 时 /_license 404，静默跳过）
    const lic = await fetch('/_license').then((r) => (r.ok ? (r.json() as Promise<LicenseState>) : null)).catch(() => null)
    setLicense(lic)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addTodo = async () => {
    if (!title.trim()) return
    await api.createTodo(title.trim())
    setTitle('')
    await refresh()
  }

  const onUpload = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = (await res.json()) as { url: string }
    setUploadUrl(data.url)
  }

  // 大文件上传（活文档示例）：直传 /api/upload（multipart），服务端转存 FileStorage 后端
  const onLargeUpload = async (file: File) => {
    setUploadUrl(null)
    setUploadProgress('上传中…')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { url: string }
      setUploadUrl(data.url)
      setUploadProgress(`完成（${file.size} B）`)
    } catch (e) {
      setUploadProgress(`失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const sendNotify = async () => {
    if (!me) return
    const r = await fetch('/api/platform/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: [me.sub], title: '来自模板', text: '# 你好 👋' }),
    })
    setNotice(r.ok ? '已发送' : `失败 ${r.status}`)
  }

  // 密码认证（活文档）：SDK 只给 JSON 路由（/auth/password/*），登录 UI 由 App 自绘。
  // 登录/注册成功后后端已 Set-Cookie，刷新即可拿到 /api/me 身份。
  const passwordAuth = async (mode: 'login' | 'register') => {
    setPwMsg('')
    if (!pwUser || !pwPass) {
      setPwMsg('需要用户名和密码')
      return
    }
    try {
      if (mode === 'register') await api.passwordRegister(pwUser, pwPass)
      else await api.passwordLogin(pwUser, pwPass)
      setPwPass('')
      await refresh()
    } catch (e) {
      setPwMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1>homura 模板</h1>

      {/* ── 中央激活强提醒（层级 5：license）──
          必须放在最顶部且不可关闭：产品硬要求"每次使用强提醒、无差别提示所有用户"。
          未启用 license（/_license 404）时组件自身返回 null，不打扰。 */}
      <LicenseBanner />

      {/* ── 认证（层级 2）── */}
      <section>
        {me ? (
          <p>
            {me.avatarUrl && <img src={me.avatarUrl} alt="" width={24} style={{ verticalAlign: 'middle' }} />}{' '}
            已登录：{me.nickname ?? me.sub}{' '}
            <button onClick={() => void api.logout().then(refresh)}>退出</button>
          </p>
        ) : (
          <div>
            <p>
              未登录 <a href="/auth/oauth2/authorize">钉钉登录</a>（匿名可操作公共 todos）
            </p>
            {/* 密码登录/注册：演示 TextPassword 能力（AUTH_PASSWORD_ENABLED，缺省开）。
                SDK 不渲染页面，故表单由 App 自绘，调 /auth/password/* JSON 路由。 */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <input
                value={pwUser}
                onChange={(e) => setPwUser(e.target.value)}
                placeholder="用户名"
                style={{ padding: 6, width: 120 }}
              />
              <input
                type="password"
                value={pwPass}
                onChange={(e) => setPwPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void passwordAuth('login')}
                placeholder="密码（≥8 位）"
                style={{ padding: 6, width: 140 }}
              />
              <button onClick={() => void passwordAuth('login')}>密码登录</button>
              <button onClick={() => void passwordAuth('register')}>注册</button>
              {pwMsg && <span style={{ color: '#c00' }}>{pwMsg}</span>}
            </div>
          </div>
        )}
      </section>

      {/* ── todos CRUD（层级 1：db）── */}
      <section>
        <h2>待办</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addTodo()}
            placeholder="新待办…"
            style={{ flex: 1, padding: 8 }}
          />
          <button onClick={() => void addTodo()}>添加</button>
        </div>
        <ul>
          {todos.map((t) => (
            <li key={t.id}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => void api.toggleTodo(t.id).then(refresh)} />{' '}
                <span style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
              </label>{' '}
              <button onClick={() => void api.deleteTodo(t.id).then(refresh)}>删</button>
            </li>
          ))}
          {todos.length === 0 && <li style={{ color: '#999' }}>（空）</li>}
        </ul>
      </section>

      {/* ── 上传（层级 4：storage）── */}
      <section>
        <h2>上传</h2>
        <p style={{ fontSize: 13, color: '#666' }}>
          整文件上传（小文件，<code>POST /api/upload</code>）：
          <input type="file" onChange={(e) => e.target.files?.[0] && void onUpload(e.target.files[0])} />
          {uploadUrl && (
            <>
              已上传：<a href={uploadUrl}>{uploadUrl}</a>
            </>
          )}
        </p>
        {/* 大文件上传（活文档）：直传 /api/upload，服务端转存 FileStorage（local/s3/supabase） */}
        <p style={{ fontSize: 13, color: '#666' }}>
          大文件上传（直传 /api/upload）：
          <input type="file" onChange={(e) => e.target.files?.[0] && void onLargeUpload(e.target.files[0])} />
          {uploadProgress && <span style={{ marginLeft: 8 }}>{uploadProgress}</span>}
          {uploadUrl && (
            <>
              {' '}
              <a href={uploadUrl}>{uploadUrl}</a>
            </>
          )}
        </p>
      </section>

      {/* ── 平台能力（层级 3：3p 能力协商）── */}
      <section>
        <h2>平台能力</h2>
        {caps === null ? (
          <p style={{ color: '#999' }}>未配置第三方平台</p>
        ) : (
          <>
            <p>可用：{caps.join(', ')}</p>
            {caps.includes('message') && me && (
              <button onClick={() => void sendNotify()}>给我发钉钉通知</button>
            )}
            {notice && <span style={{ marginLeft: 8 }}>{notice}</span>}
          </>
        )}
      </section>

      {/* ── 中央激活（层级 5：license 功能范围闸门）──
          示范 requireFeature 的逐路由闸门：同一份产物散给多人，按 features 分权。
          中心给谁签了 export/beta，谁就能访问对应端点；没签就 403 feature_not_licensed。
          配了 GENUINE_SERVER 才渲染（未启用 license 时 /_license 404，license 为 null）。 */}
      {license && (
        <section>
          <h2>中央激活</h2>
          <p style={{ fontSize: 13, color: '#666' }}>
            状态：<code>{license.status}</code> · 处置：<code>{license.enforcement ?? '—'}</code> ·
            验签：<code>{license.signature?.kind ?? '—'}</code> ·
            已授权功能：<code>{license.features.length ? license.features.join(', ') : '（无）'}</code>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() =>
                void fetch('/api/license-demo/export').then(async (r) => {
                  setDemoMsg(r.ok ? `导出成功（CSV ${(await r.text()).length} 字节）` : `导出被拒 ${r.status}：${(await r.json()).error}`)
                })
              }
            >
              导出 CSV（需 export）
            </button>
            <button
              onClick={() =>
                void fetch('/api/license-demo/beta/ping').then(async (r) => {
                  setDemoMsg(r.ok ? 'beta 功能可用' : `beta 被拒 ${r.status}：${(await r.json()).error}`)
                })
              }
            >
              调用 beta（需 beta）
            </button>
            <button onClick={() => void refresh()}>刷新状态</button>
          </div>
          {demoMsg && <p style={{ marginTop: 8, fontSize: 13 }}>{demoMsg}</p>}
          <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
            在中心 PATCH 该许可的 <code>features</code> 后点"刷新状态"——下一次心跳（≤ heartbeatIntervalSec 秒）
            闸门即随之开关。验签失败（如中心 rotate keys 后未更新公钥）时所有闸门一律 403，
            这是默认拒绝的安全网。
          </p>
        </section>
      )}
    </main>
  )
}
