// 网关状态
export enum GatewayStatus {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
  Error = "error",
}

// 网关配置
export interface GatewayConfig {
  id: string;
  name: string;
  url: string;
  token?: string;
  status: GatewayStatus;
  autoConnect?: boolean;
}

// 网关类型别名（用于兼容）
export type Gateway = GatewayConfig;

// 消息类型
export enum MessageType {
  Text = "text",
  System = "system",
  Notice = "notice",
  Error = "error",
}

// 消息
export interface Message {
  id: string;
  gatewayId: string;
  roomId: string;
  type: MessageType;
  role?: MessageRole; // 添加角色属性
  content: string;
  sender?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// 房间
export interface Room {
  id: string;
  gatewayId: string;
  name: string;
  type: "channel" | "private" | "group";
  unreadCount: number;
  lastMessage?: Message;
  members?: string[];
  pinned?: boolean;
  order?: number;
  roomType?: RoomType;
  collaboration?: CollaborationConfig;
}

// ==================== 聊天消息扩展类型 ====================

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * 图片来源类型
 */
export type ImageSourceType = 'base64' | 'url';

/**
 * 图片来源
 */
export interface ImageSource {
  type: ImageSourceType;
  media_type?: string;
  url?: string;
  data?: string;
}

/**
 * 内容块类型
 */
export type ContentBlockType = 'text' | 'image';

/**
 * 内容块
 */
export interface ContentBlock {
  type: ContentBlockType;
  text?: string;
  source?: ImageSource;
}

/**
 * 附件类型
 */
export type AttachmentType = 'image' | 'file';

/**
 * 附件
 */
export interface Attachment {
  id: string;
  type: AttachmentType;
  mimeType?: string;
  content?: string;
  url?: string;
  preview?: string;
}

/**
 * 聊天消息（扩展基础消息）
 */
export interface ChatMessage {
  id: string;
  gatewayId?: string;
  roomId?: string;
  role: MessageRole;
  content: ContentBlock[] | string;
  text?: string;
  timestamp: number;
  isStreaming?: boolean;
  state?: 'pending' | 'sending' | 'sent' | 'error';
  attachments?: Attachment[];
  runId?: string;
  collaborationContext?: CollaborationContext;
}

/**
 * 渲染消息（用于 UI 显示）
 */
export interface RenderedMessage {
  id: string;
  domId: string;
  role: MessageRole;
  avatar: string;
  text: string;
  images: string[];
  time: string;
  streaming: boolean;
  loading: boolean;
  collaborationContext?: CollaborationContext;
}

/**
 * WebSocket 连接状态
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Chat 事件状态
 */
export type ChatEventState = 'delta' | 'final' | 'aborted' | 'error';

/**
 * Chat 事件负载
 */
export interface ChatEventPayload {
  sessionKey?: string;
  state: ChatEventState;
  message?: ChatMessage;
  runId?: string;
  error?: {
    code?: string;
    message: string;
  };
}

/**
 * 连接挑战负载
 */
export interface ConnectChallengePayload {
  nonce: string;
}

/**
 * WebSocket 消息类型
 */
export type WSMessageType = 'req' | 'res' | 'event';

/**
 * WebSocket 请求消息
 */
export interface WSRequestMessage {
  type: 'req';
  id: string;
  method: string;
  params?: any;
}

/**
 * WebSocket 响应消息
 */
export interface WSResponseMessage {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: any;
  error?: {
    code?: string;
    message: string;
  };
}

/**
 * WebSocket 事件消息
 */
export interface WSEventMessage {
  type: 'event';
  event: string;
  payload?: any;
}

/**
 * WebSocket 消息（联合类型）
 */
export type WSMessage = WSRequestMessage | WSResponseMessage | WSEventMessage;

/**
 * 连接请求参数
 */
export interface ConnectRequestParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    version: string;
    platform: string;
    mode: string;
  };
  role: string;
  scopes: string[];
  auth?: {
    token: string;
  };
  userAgent: string;
  locale: string;
}

/**
 * Chat 发送请求参数
 */
export interface ChatSendParams {
  sessionKey: string;
  message?: string;
  deliver: boolean;
  idempotencyKey?: string;
  attachments?: Array<{
    type: string;
    mimeType: string;
    content: string;
  }>;
}

/**
 * Chat 历史请求参数
 */
export interface ChatHistoryParams {
  sessionKey: string;
  limit?: number;
}

/**
 * Chat 历史响应
 */
export interface ChatHistoryResponse {
  messages: ChatMessage[];
}

/**
 * Chat 中止请求参数
 */
export interface ChatAbortParams {
  sessionKey: string;
  runId?: string;
}

/**
 * 待处理的请求
 */
export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

// ==================== Agent API 类型 ====================

/**
 * Agent 身份信息
 */
export interface AgentIdentity {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
}

/**
 * Agent 列表项
 */
export interface GatewayAgentRow {
  id: string;
  name?: string;
  identity?: AgentIdentity;
}

/**
 * agents.list 响应
 */
export interface AgentsListResult {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: GatewayAgentRow[];
}

// ==================== 协作房间扩展类型 ====================

/**
 * 房间类型
 */
export type RoomType = 'single-gateway' | 'collaboration';

/**
 * 协作参与者
 */
export interface CollaborationParticipant {
  gatewayId: string;
  agentId: string;
  order: number;
  isActive: boolean;
  name: string;
  avatar?: string;
  color?: string;
}

/**
 * 协作配置
 */
export interface CollaborationConfig {
  participants: CollaborationParticipant[];
  autoContinue: boolean;
  allowIntervention: boolean;
}

/**
 * 协作状态
 */
export type CollaborationStatus = 'idle' | 'active' | 'paused' | 'completed';

/**
 * 协作会话
 */
export interface CollaborationSession {
  sessionId: string;
  roomId: string;
  status: CollaborationStatus;
  currentStep: number;
  participants: CollaborationParticipant[];
  userMessageId: string;
  userMessage: string;
  completedSteps: number[];
  failedSteps: Record<number, string>;
  createdAt: number;
  updatedAt: number;
}

/**
 * 协作消息上下文
 */
export interface CollaborationContext {
  sessionId: string;
  step: number;
  participantName: string;
  participantColor?: string;
}
