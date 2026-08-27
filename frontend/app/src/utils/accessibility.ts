/**
 * 无障碍工具函数
 * 提供 WAI/WCAG 合规支持
 */

/**
 * 键盘事件处理器
 * 支持 Enter 和 Space 键触发点击事件
 */
export const handleKeyDown = (
  event: React.KeyboardEvent,
  callback: () => void
) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    callback()
  }
}

/**
 * 生成无障碍标签
 */
export const createAriaLabel = (
  label: string,
  additionalInfo?: string
): string => {
  return additionalInfo ? `${label}: ${additionalInfo}` : label
}

/**
 * 检查是否应该减少动画
 * 尊重用户的系统偏好设置
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 检查高对比度模式
 */
export const prefersHighContrast = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-contrast: high)').matches
}

/**
 * 焦点管理：将焦点移动到指定元素
 */
export const focusElement = (selector: string): void => {
  if (typeof window === 'undefined') return
  const element = document.querySelector(selector)
  if (element && element instanceof HTMLElement) {
    element.focus()
  }
}

/**
 * 焦点管理：将焦点移动到第一个可聚焦元素
 */
export const focusFirstFocusableElement = (containerSelector: string): void => {
  if (typeof window === 'undefined') return
  const container = document.querySelector(containerSelector)
  if (!container) return

  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )

  if (focusableElements.length > 0) {
    const firstElement = focusableElements[0]
    if (firstElement instanceof HTMLElement) {
      firstElement.focus()
    }
  }
}

/**
 * 生成唯一的 ARIA ID
 */
let ariaIdCounter = 0
export const generateAriaId = (prefix: string = 'aria'): string => {
  ariaIdCounter += 1
  return `${prefix}-${ariaIdCounter}`
}

/**
 * 实时区域类型
 */
export type AriaLiveType = 'off' | 'polite' | 'assertive'

/**
 * 创建实时区域属性
 */
export const createAriaLiveProps = (
  type: AriaLiveType = 'polite'
): { 'aria-live': AriaLiveType; 'aria-atomic': boolean } => {
  return {
    'aria-live': type,
    'aria-atomic': true,
  }
}
