/**
 * WebSocket 连接管理 Hook - 多连接版本
 * 支持同时维护多个网关的连接
 */

import { useCallback, useEffect, useRef } from 'react';
import type {
  ConnectionStatus,
  WSMessage,
  WSRequestMessage,
  WSResponseMessage,
  WSEventMessage,
  ConnectRequestParams,
  PendingRequest,
  ChatEventPayload,
  ConnectChallengePayload,
} from '../types';
import { generateUUID } from '../lib/protocol';

// 默认配置
const DEFAULTS = {
  gatewayUrl: 'ws://127.0.0.1:18789',
  reconnectInterval: 2000,
  maxReconnectAttempts: 5,
  requestTimeout: 30000,
};

// 单个连接的状态
interface ConnectionState {
  status: ConnectionStatus;
  error: string | null;
  ws: WebSocket | null;
  pending: Map<string, PendingRequest>;
  reconnectAttempts: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  token?: string;
  url?: string;
}

export interface UseWebSocketOptions {
  onChatEvent?: (payload: ChatEventPayload, gatewayId: string) => void;
  onStatusChange?: (gatewayId: string, status: ConnectionStatus, error?: string) => void;
  autoReconnect?: boolean;
}

export interface UseWebSocketReturn {
  // 获取特定网关的状态
  getStatus: (gatewayId: string) => ConnectionStatus;
  getError: (gatewayId: string) => string | null;
  isConnected: (gatewayId: string) => boolean;

  // 连接管理
  connect: (gatewayUrl: string, token: string, gatewayId: string) => Promise<void>;
  disconnect: (gatewayId?: string) => void;
  disconnectAll: () => void;

  // 发送请求（必须指定网关）
  request: <T = any>(gatewayId: string, method: string, params?: any) => Promise<T>;
  send: (gatewayId: string, data: string) => void;

  // 获取连接的网关列表
  getConnectedGatewayIds: () => string[];
}

/**
 * WebSocket 连接管理 Hook - 多连接版本
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    onChatEvent,
    onStatusChange,
    autoReconnect = true,
  } = options;

  // 使用 Map 存储每个网关的连接状态
  const connectionsRef = useRef<Map<string, ConnectionState>>(new Map());
  const connectNonceRef = useRef<Map<string, string>>(new Map());

  // 触发状态更新回调
  const notifyStatusChange = useCallback((gatewayId: string, status: ConnectionStatus, error: string | null) => {
    onStatusChange?.(gatewayId, status, error || undefined);
  }, [onStatusChange]);

  // 获取或创建连接状态
  const getConnection = useCallback((gatewayId: string): ConnectionState => {
    let conn = connectionsRef.current.get(gatewayId);
    if (!conn) {
      conn = {
        status: 'disconnected',
        error: null,
        ws: null,
        pending: new Map(),
        reconnectAttempts: 0,
        reconnectTimeout: null,
      };
      connectionsRef.current.set(gatewayId, conn);
    }
    return conn;
  }, []);

  // 更新连接状态
  const updateConnectionStatus = useCallback((gatewayId: string, status: ConnectionStatus, error: string | null = null) => {
    const conn = getConnection(gatewayId);
    conn.status = status;
    conn.error = error;
    notifyStatusChange(gatewayId, status, error);
  }, [getConnection, notifyStatusChange]);

  // 清理重连定时器
  const clearReconnectTimeout = useCallback((gatewayId: string) => {
    const conn = getConnection(gatewayId);
    if (conn.reconnectTimeout) {
      clearTimeout(conn.reconnectTimeout);
      conn.reconnectTimeout = null;
    }
  }, [getConnection]);

  // 发送 WebSocket 消息到指定网关
  const send = useCallback((gatewayId: string, data: string) => {
    const conn = getConnection(gatewayId);
    if (conn.ws?.readyState === WebSocket.OPEN) {
      conn.ws.send(data);
      return true;
    }
    return false;
  }, [getConnection]);

  // 处理连接挑战
  const sendConnect = useCallback(async (gatewayId: string, token: string) => {
    const conn = getConnection(gatewayId);

    const params: ConnectRequestParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'webchat',
        version: 'mini-1',
        platform: 'miniprogram',
        mode: 'webchat',
      },
      role: 'operator',
      scopes: ['operator.admin', 'operator.approvals', 'operator.pairing'],
      auth: token ? { token } : undefined,
      userAgent: 'miniprogram',
      locale: 'zh-CN',
    };

    console.log(`[WebSocket:${gatewayId}] 发送连接请求`);

    return new Promise((resolve, reject) => {
      if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket 未连接'));
        return;
      }

      const id = generateUUID();
      conn.pending.set(id, { resolve, reject });

      const message: WSRequestMessage = {
        type: 'req',
        id,
        method: 'connect',
        params,
      };

      try {
        conn.ws.send(JSON.stringify(message));
      } catch (err) {
        conn.pending.delete(id);
        reject(err);
        return;
      }

      // 设置超时
      setTimeout(() => {
        const pending = conn.pending.get(id);
        if (pending) {
          conn.pending.delete(id);
          pending.reject(new Error('连接超时'));
        }
      }, DEFAULTS.requestTimeout);
    }).then((response) => {
      updateConnectionStatus(gatewayId, 'connected');
      conn.reconnectAttempts = 0;
      console.log(`[WebSocket:${gatewayId}] 连接成功`);
      return response;
    }).catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      updateConnectionStatus(gatewayId, 'error', errorMessage);
      throw err;
    });
  }, [getConnection, updateConnectionStatus]);

  // 创建消息处理器（绑定到特定网关）
  const createMessageHandler = useCallback((gatewayId: string) => {
    return (event: MessageEvent) => {
      const conn = getConnection(gatewayId);
      let parsed: WSMessage;

      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }

      // 处理事件消息
      if (parsed.type === 'event') {
        const eventMsg = parsed as WSEventMessage;
        if (eventMsg.event === 'connect.challenge') {
          const payload = eventMsg.payload as ConnectChallengePayload;
          connectNonceRef.current.set(gatewayId, payload?.nonce || '');
          // 自动发送连接请求
          sendConnect(gatewayId, conn.token || '').catch((err) => {
            console.error(`[WebSocket:${gatewayId}] 连接失败:`, err);
          });
          return;
        }
        if (eventMsg.event === 'chat') {
          onChatEvent?.(eventMsg.payload as ChatEventPayload, gatewayId);
        }
        return;
      }

      // 处理响应消息
      if (parsed.type === 'res') {
        const responseMsg = parsed as WSResponseMessage;
        const pending = conn.pending.get(responseMsg.id);
        if (!pending) return;

        conn.pending.delete(responseMsg.id);
        if (responseMsg.ok) {
          pending.resolve(responseMsg.payload);
        } else {
          pending.reject(new Error(responseMsg.error?.message || '请求失败'));
        }
      }
    };
  }, [getConnection, onChatEvent, sendConnect]);

  // 请求方法
  const request = useCallback(<T = any>(gatewayId: string, method: string, params?: any): Promise<T> => {
    const conn = getConnection(gatewayId);

    return new Promise<T>((resolve, reject) => {
      if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`网关 ${gatewayId} 未连接`));
        return;
      }

      const id = generateUUID();
      conn.pending.set(id, { resolve, reject });

      const message: WSRequestMessage = {
        type: 'req',
        id,
        method,
        params,
      };

      try {
        conn.ws.send(JSON.stringify(message));
      } catch (err) {
        conn.pending.delete(id);
        reject(err);
      }

      // 设置超时
      setTimeout(() => {
        const pending = conn.pending.get(id);
        if (pending) {
          conn.pending.delete(id);
          pending.reject(new Error('请求超时'));
        }
      }, DEFAULTS.requestTimeout);
    });
  }, [getConnection]);

  // 连接方法
  const connect = useCallback(async (gatewayUrl: string, token: string, gatewayId: string) => {
    const conn = getConnection(gatewayId);

    // 如果已经连接到这个网关，直接返回
    if (conn.ws?.readyState === WebSocket.OPEN && conn.status === 'connected') {
      console.log(`[WebSocket:${gatewayId}] 已经连接，跳过`);
      return;
    }

    // 清理旧连接
    if (conn.ws) {
      conn.ws.close();
      conn.ws = null;
    }
    clearReconnectTimeout(gatewayId);

    // 保存配置
    conn.url = gatewayUrl;
    conn.token = token;

    updateConnectionStatus(gatewayId, 'connecting');

    try {
      conn.ws = new WebSocket(gatewayUrl);

      conn.ws.onopen = () => {
        // 等待 connect.challenge 事件
      };

      conn.ws.onmessage = createMessageHandler(gatewayId);

      conn.ws.onclose = () => {
        updateConnectionStatus(gatewayId, 'disconnected');
        conn.pending.clear();
        conn.ws = null;

        // 自动重连
        if (autoReconnect && conn.reconnectAttempts < DEFAULTS.maxReconnectAttempts) {
          conn.reconnectAttempts++;
          const delay = DEFAULTS.reconnectInterval * conn.reconnectAttempts;
          console.log(`[WebSocket:${gatewayId}] ${delay}ms 后重连 (尝试 ${conn.reconnectAttempts})`);

          conn.reconnectTimeout = setTimeout(() => {
            updateConnectionStatus(gatewayId, 'connecting');
            connect(gatewayUrl, token, gatewayId);
          }, delay);
        }
      };

      conn.ws.onerror = (_event) => {
        updateConnectionStatus(gatewayId, 'error', 'WebSocket 连接错误');
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      updateConnectionStatus(gatewayId, 'error', errorMessage);
      throw err;
    }
  }, [getConnection, updateConnectionStatus, clearReconnectTimeout, createMessageHandler, autoReconnect]);

  // 断开指定网关的连接
  const disconnect = useCallback((gatewayId?: string) => {
    if (gatewayId) {
      // 断开指定网关
      const conn = connectionsRef.current.get(gatewayId);
      if (conn) {
        clearReconnectTimeout(gatewayId);
        conn.reconnectAttempts = DEFAULTS.maxReconnectAttempts; // 阻止自动重连
        if (conn.ws) {
          conn.ws.close();
          conn.ws = null;
        }
        conn.pending.clear();
        updateConnectionStatus(gatewayId, 'disconnected');
      }
    }
  }, [clearReconnectTimeout, updateConnectionStatus]);

  // 断开所有连接
  const disconnectAll = useCallback(() => {
    connectionsRef.current.forEach((conn, gatewayId) => {
      clearReconnectTimeout(gatewayId);
      conn.reconnectAttempts = DEFAULTS.maxReconnectAttempts;
      if (conn.ws) {
        conn.ws.close();
        conn.ws = null;
      }
      conn.pending.clear();
    });
    connectionsRef.current.clear();
  }, [clearReconnectTimeout]);

  // 获取状态的方法
  const getStatus = useCallback((gatewayId: string): ConnectionStatus => {
    return getConnection(gatewayId).status;
  }, [getConnection]);

  const getError = useCallback((gatewayId: string): string | null => {
    return getConnection(gatewayId).error;
  }, [getConnection]);

  const isConnected = useCallback((gatewayId: string): boolean => {
    return getConnection(gatewayId).status === 'connected';
  }, [getConnection]);

  const getConnectedGatewayIds = useCallback((): string[] => {
    return Array.from(connectionsRef.current.entries())
      .filter(([_, conn]) => conn.status === 'connected')
      .map(([id]) => id);
  }, []);

  // 组件卸载时断开所有连接
  useEffect(() => {
    return () => {
      disconnectAll();
    };
  }, [disconnectAll]);

  return {
    getStatus,
    getError,
    isConnected,
    connect,
    disconnect,
    disconnectAll,
    request,
    send,
    getConnectedGatewayIds,
  };
}
