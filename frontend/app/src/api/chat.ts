import apiClient from './client'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface SendMessageRequest {
  message: string
  sessionId?: string
}

export interface SendMessageResponse {
  sessionId: string
  message: ChatMessage
}

export const chatApi = {
  // 获取会话列表
  getSessions: (): Promise<ChatSession[]> => {
    return apiClient.get('/api/chat/sessions').then(res => res.data)
  },

  // 获取单个会话
  getSession: (sessionId: string): Promise<ChatSession> => {
    return apiClient.get(`/api/chat/sessions/${sessionId}`).then(res => res.data)
  },

  // 创建新会话
  createSession: (): Promise<ChatSession> => {
    return apiClient.post('/api/chat/sessions').then(res => res.data)
  },

  // 删除会话
  deleteSession: (sessionId: string): Promise<void> => {
    return apiClient.delete(`/api/chat/sessions/${sessionId}`)
  },

  // 发送消息
  sendMessage: (request: SendMessageRequest): Promise<SendMessageResponse> => {
    return apiClient.post('/api/chat/messages', request).then(res => res.data)
  },

  // 流式发送消息（SSE）
  sendMessageStream: (
    request: SendMessageRequest,
    onChunk: (chunk: string) => void,
    onComplete: (fullMessage: ChatMessage) => void,
    onError: (error: Error) => void
  ): (() => void) => {
    const eventSource = new EventSource(
      `/api/chat/messages/stream?message=${encodeURIComponent(request.message)}&sessionId=${request.sessionId || ''}`
    )

    let fullContent = ''

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'chunk') {
        fullContent += data.content
        onChunk(data.content)
      } else if (data.type === 'complete') {
        onComplete({
          id: data.messageId,
          role: 'assistant',
          content: fullContent,
          timestamp: data.timestamp,
        })
        eventSource.close()
      } else if (data.type === 'error') {
        onError(new Error(data.error))
        eventSource.close()
      }
    }

    eventSource.onerror = () => {
      onError(new Error('Connection lost'))
      eventSource.close()
    }

    return () => eventSource.close()
  },
}
