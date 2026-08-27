import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Card,
  Input,
  Text,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import {
  SendRegular,
  AddRegular,
  DeleteRegular,
  ChatRegular,
} from '@fluentui/react-icons'
import { chatApi, type ChatSession, type ChatMessage } from '../../api/chat'

const useStyles = makeStyles({
  container: {
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    height: 'calc(100vh - 120px)',
    gap: tokens.spacingHorizontalM,
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    overflow: 'hidden',
  },
  sessionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    overflowY: 'auto',
    flex: 1,
  },
  sessionItem: {
    padding: tokens.spacingVerticalM + ' ' + tokens.spacingHorizontalM,
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusMedium,
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  sessionItemActive: {
    backgroundColor: tokens.colorBrandBackground2,
    '&:hover': {
      backgroundColor: tokens.colorBrandBackground2,
    },
  },
  sessionTitle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
  },
  chatArea: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  message: {
    maxWidth: '70%',
    padding: tokens.spacingVerticalM + ' ' + tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
  },
  messageUser: {
    alignSelf: 'flex-end',
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  messageAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  messageSystem: {
    alignSelf: 'center',
    backgroundColor: tokens.colorNeutralBackground4,
    fontStyle: 'italic',
  },
  inputArea: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  input: {
    flex: 1,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: tokens.spacingVerticalL,
  },
})

export const Chat: React.FC = () => {
  const styles = useStyles()
  const { t } = useTranslation()

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [currentSession?.messages, streamingContent])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadSessions = async () => {
    try {
      const data = await chatApi.getSessions()
      setSessions(data)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
  }

  const handleCreateSession = async () => {
    try {
      const session = await chatApi.createSession()
      setSessions([session, ...sessions])
      setCurrentSession(session)
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  const handleSelectSession = async (session: ChatSession) => {
    try {
      const fullSession = await chatApi.getSession(session.id)
      setCurrentSession(fullSession)
    } catch (error) {
      console.error('Failed to load session:', error)
    }
  }

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await chatApi.deleteSession(sessionId)
      setSessions(sessions.filter(s => s.id !== sessionId))
      if (currentSession?.id === sessionId) {
        setCurrentSession(null)
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !currentSession) return

    const message = inputValue.trim()
    setInputValue('')
    setIsLoading(true)
    setStreamingContent('')

    try {
      // 添加用户消息到当前会话
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      }

      setCurrentSession({
        ...currentSession,
        messages: [...currentSession.messages, userMessage],
      })

      // 发送消息并接收流式响应
      chatApi.sendMessageStream(
        { message, sessionId: currentSession.id },
        (chunk: string) => {
          setStreamingContent(prev => prev + chunk)
        },
        (assistantMessage: ChatMessage) => {
          setCurrentSession(prev => prev ? {
            ...prev,
            messages: [...prev.messages, assistantMessage],
          } : null)
          setStreamingContent('')
          setIsLoading(false)
        },
        (error: Error) => {
          console.error('Stream error:', error)
          setIsLoading(false)
          setStreamingContent('')
        }
      )
    } catch (error) {
      console.error('Failed to send message:', error)
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className={styles.container}>
      <Card className={styles.sidebar}>
        <Button
          appearance="primary"
          icon={<AddRegular />}
          onClick={handleCreateSession}
          style={{ width: '100%' }}
        >
          {t('chat.newSession')}
        </Button>

        <div className={styles.sessionList}>
          {sessions.map(session => (
            <div
              key={session.id}
              className={`${styles.sessionItem} ${
                currentSession?.id === session.id ? styles.sessionItemActive : ''
              }`}
              onClick={() => handleSelectSession(session)}
            >
              <div className={styles.sessionTitle}>
                <Text size={300} weight="semibold" truncate>
                  {session.title}
                </Text>
                <Button
                  size="small"
                  icon={<DeleteRegular />}
                  appearance="subtle"
                  onClick={(e) => handleDeleteSession(session.id, e)}
                />
              </div>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {new Date(session.updatedAt).toLocaleDateString()}
              </Text>
            </div>
          ))}
        </div>
      </Card>

      <Card className={styles.chatArea}>
        {currentSession ? (
          <>
            <div className={styles.messages}>
              {currentSession.messages.map(message => (
                <div
                  key={message.id}
                  className={`${styles.message} ${
                    message.role === 'user'
                      ? styles.messageUser
                      : message.role === 'assistant'
                      ? styles.messageAssistant
                      : styles.messageSystem
                  }`}
                >
                  <Text>{message.content}</Text>
                </div>
              ))}

              {streamingContent && (
                <div className={`${styles.message} ${styles.messageAssistant}`}>
                  <Text>{streamingContent}</Text>
                </div>
              )}

              {isLoading && !streamingContent && (
                <div className={`${styles.message} ${styles.messageAssistant}`}>
                  <Spinner size="tiny" />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputArea}>
              <Input
                className={styles.input}
                value={inputValue}
                onChange={(_, data) => setInputValue(data.value)}
                onKeyPress={handleKeyPress}
                placeholder={t('chat.inputPlaceholder')}
                disabled={isLoading}
              />
              <Button
                appearance="primary"
                icon={<SendRegular />}
                onClick={handleSendMessage}
                disabled={isLoading || !inputValue.trim()}
              />
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <ChatRegular style={{ fontSize: 48, color: tokens.colorNeutralForeground3 }} />
            <Text size={500}>{t('chat.welcome')}</Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              {t('chat.welcomeDescription')}
            </Text>
            <Button
              appearance="primary"
              icon={<AddRegular />}
              onClick={handleCreateSession}
            >
              {t('chat.startChat')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
