import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { LicenseBanner, type LicenseState } from './LicenseBanner'
import { uploadChunked } from '@homurajs/storage/chunk-client'
import type { Todo } from '../shared/types'

type Me = { sub: string; nickname?: string; avatarUrl?: string } | null

export default function App() {
  const [me, setMe] = useState<Me>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')
  const [caps, setCaps] = useState<string[] | null>(null)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [chunkUrl, setChunkUrl] = useState<string | null>(null)
  const [chunkProgress, setChunkProgress] = useState<string>('')
  const [notice, setNotice] = useState<string>('')
  const [license, setLicense] = useState<LicenseState | null>(null)
  const [demoMsg, setDemoMsg] = useState<string>('')

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

  // 分块上传（活文档）：大文件走 @homurajs/storage/chunk-client 的 uploadChunked，
  // 每块一个小请求绕开 qw-pages 网关 body 上限（整文件上传 >~1MB 会被 413）。
  const onChunkedUpload = async (file: File) => {
    setChunkUrl(null)
    try {
      const r = await uploadChunked(file, {
        chunkSize: 384 * 1024,
        onProgress: (loaded, total) => setChunkProgress(`${Math.round((loaded / total) * 100)}%`),
      })
      setChunkUrl(r.url)
      setChunkProgress(`完成（${r.chunkCount} 块 / ${r.size} B）`)
      await refresh()
    } catch (e) {
      setChunkProgress(`失败：${e instanceof Error ? e.message : String(e)}`)
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
          <p>
            未登录 <a href="/auth/oauth2/authorize">钉钉登录</a> ·{' '}
            <a href="/auth/login">密码登录</a>（匿名可操作公共 todos）
          </p>
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
        {/* 分块上传（活文档）：大文件用 @homurajs/storage/chunk-client 切片，绕开网关 body 上限。
            仅 STORAGE_BACKEND=db（或任何分块后端）时服务端挂了 /api/files/init|chunk|complete。 */}
        <p style={{ fontSize: 13, color: '#666' }}>
          分块上传（大文件，前端 SDK 切片 + 进度）：
          <input type="file" onChange={(e) => e.target.files?.[0] && void onChunkedUpload(e.target.files[0])} />
          {chunkProgress && <span style={{ marginLeft: 8 }}>{chunkProgress}</span>}
          {chunkUrl && (
            <>
              {' '}
              <a href={chunkUrl}>{chunkUrl}</a>
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
