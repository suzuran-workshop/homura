/**
 * LicenseBanner：中央激活的前端强提醒活文档。
 *
 * 产品硬要求是"每次使用强提醒、无差别提示所有用户"——所以这个 banner 必须：
 * 1. 读全局 `/_license` 端点（它在 guard 豁免清单里，enforcement=all 全站 503 时仍可读，
 *    否则前端连"为什么停了"都问不到）
 * 2. 只要 `notice` 非空就展示，且**不可被用户关闭**（强提醒的意义就在于无差别）
 * 3. 轮询刷新——中心随时可能 PATCH 状态，下一次心跳后 App 侧就会更新，前端要跟上
 *
 * 派生 App 照抄这个组件即可；若要做更复杂的 UI（比如到期倒计时、续期链接），
 * 在此基础上扩展，但**不要去掉强提醒的不可关闭性**。
 */
import { useCallback, useEffect, useState } from 'react'

export interface LicenseState {
  status: string
  enforcement: string | null
  notice: string | null
  expiresAt: string | null
  features: string[]
  signature: { kind: string; reason?: string } | null
}

/** 轮询间隔：与心跳周期同量级即可（中心 PATCH 后下一次心跳生效，前端再下一次轮询看到） */
const POLL_INTERVAL_MS = 15_000

export function LicenseBanner() {
  const [state, setState] = useState<LicenseState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/_license')
      if (!res.ok) {
        // /_license 在豁免清单里，正常不会非 200；非 200 说明 App 本身出问题了
        setError(`/_license HTTP ${res.status}`)
        return
      }
      setState((await res.json()) as LicenseState)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void poll()
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [poll])

  // 未启用 license（/_license 404）时不渲染——模板是渐进式的，没配 GENUINE_SERVER 就没这个端点
  if (error?.includes('404')) return null
  if (!state && !error) return null

  if (error) {
    return (
      <div role="alert" style={bannerStyle('#fff3cd', '#856404')}>
        授权状态读取失败：{error}
      </div>
    )
  }

  const s = state!
  // active 且无显式 notice → 不打扰用户（到期前预警等运营文案才会让 active 带 notice）
  if (s.status === 'active' && !s.notice) return null

  // 非 active 或有显式 notice → 强提醒，不可关闭
  const bg = s.status === 'active' ? '#d1ecf1' : s.signature?.kind === 'invalid' ? '#f8d7da' : '#fff3cd'
  const fg = s.status === 'active' ? '#0c5460' : s.signature?.kind === 'invalid' ? '#721c24' : '#856404'

  return (
    <div role="alert" style={bannerStyle(bg, fg)}>
      <strong>授权提醒</strong>
      <div>{s.notice ?? `当前状态：${s.status}`}</div>
      <details style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
        <summary>诊断信息</summary>
        <div>status: {s.status}</div>
        <div>enforcement: {s.enforcement ?? '—'}</div>
        <div>expiresAt: {s.expiresAt ?? '永不过期'}</div>
        <div>features: {s.features.length ? s.features.join(', ') : '（无）'}</div>
        <div>signature: {s.signature?.kind ?? '—'}{s.signature?.reason ? ` (${s.signature.reason})` : ''}</div>
      </details>
    </div>
  )
}

function bannerStyle(bg: string, fg: string): React.CSSProperties {
  return {
    background: bg,
    color: fg,
    padding: '12px 16px',
    borderRadius: 6,
    marginBottom: 16,
    border: `1px solid ${fg}33`,
    fontSize: 14,
  }
}
