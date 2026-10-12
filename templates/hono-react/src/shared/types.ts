/**
 * 前后端共享 DTO（模板即活文档：契约集中此处）
 */
export interface Todo {
  id: string
  title: string
  done: boolean
  ownerSub: string | null
  createdAt: number
}

export interface TodoCreate {
  title: string
}

export interface Me {
  sub: string
  nickname?: string
  avatarUrl?: string
}
