import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { Todo } from '../shared/types'

type Me = { sub: string; nickname?: string; avatarUrl?: string } | null

export default function App() {
  const [me, setMe] = useState<Me>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')
  const [caps, setCaps] = useState<string[] | null>(null)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [notice, setNotice] = useState<string>('')

  const refresh = useCallback(async () => {
    const [{ user }, { todos: list }] = await Promise.all([api.me(), api.listTodos()])
    setMe(user)
    setTodos(list)
    const cap = await api.capabilities()
    setCaps(cap?.capabilities ?? null)
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
            未登录 <a href="/auth/login">钉钉登录</a>（匿名可操作公共 todos）
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
        <input type="file" onChange={(e) => e.target.files?.[0] && void onUpload(e.target.files[0])} />
        {uploadUrl && (
          <p>
            已上传：<a href={uploadUrl}>{uploadUrl}</a>
          </p>
        )}
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
    </main>
  )
}
