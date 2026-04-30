export interface SlackEvent {
  type: string
  event?: {
    type: string
    text: string
    user: string
    channel: string
    ts: string
    thread_ts?: string
    files?: SlackFile[]
    bot_id?: string
    subtype?: string
  }
  challenge?: string
  event_id?: string
}

export interface SlackFile {
  id: string
  name: string
  mimetype: string
  url_private: string
  url_private_download: string
}

export interface SlackUserMapping {
  id: string
  slack_user_id: string
  slack_username: string | null
  cake_user_id: string
}

export interface ToolResult {
  success: boolean
  data?: any
  error?: string
}
