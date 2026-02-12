/**
 * 本地存储工具类
 * 支持 localStorage 和 Tauri store 插件
 * 包含批量写入和防抖优化
 */

import type {
  GatewayConfig,
  Message,
  Room,
} from '../types';
import { debounce } from 'lodash-es';

/**
 * 存储键定义
 */
const STORAGE_KEYS = {
  GATEWAYS: 'clawchat.gateways',
  ROOMS: 'clawchat.rooms',
  ACTIVE_SESSION: 'clawchat.activeSession',
  SETTINGS: 'clawchat.settings',
  MESSAGES: 'clawchat.messages',
} as const;

/**
 * 应用设置
 */
export interface AppSettings {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  fontSize: 'small' | 'medium' | 'large';
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
  };
  autoReconnect: boolean;
  reconnectInterval: number;
  messageHistoryLimit: number;
}

/**
 * 存储错误类型
 */
export class StorageError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * 加密助手（用于敏感信息）
 */
class EncryptionHelper {
  private static ALGORITHM = 'AES-GCM';
  private static KEY_LENGTH = 256;

  /**
   * 生成加密密钥（从固定种子）
   */
  private static async getKey(): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode('clawchat-storage-key'),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('clawchat-salt'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: EncryptionHelper.ALGORITHM, length: EncryptionHelper.KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * 加密数据
   */
  static async encrypt(data: string): Promise<string> {
    try {
      const key = await this.getKey();
      const encoder = new TextEncoder();
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encrypted = await crypto.subtle.encrypt(
        { name: this.ALGORITHM, iv },
        key,
        encoder.encode(data)
      );

      // 组合 IV 和加密数据
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      throw new StorageError('加密失败', error as Error);
    }
  }

  /**
   * 解密数据
   */
  static async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.getKey();
      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: this.ALGORITHM, iv },
        key,
        data
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new StorageError('解密失败', error as Error);
    }
  }
}

/**
 * 存储适配器接口
 */
interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear?(): Promise<void>;
}

/**
 * localStorage 适配器
 */
class LocalStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    localStorage.clear();
  }
}

/**
 * Tauri Store 适配器（条件加载）
 */
class TauriStoreAdapter implements StorageAdapter {
  private store: any = null;
  private ready: Promise<void>;
  private initialized: boolean = false;
  private fallback: StorageAdapter;
  private useFallback: boolean = false;

  constructor() {
    this.fallback = new LocalStorageAdapter();
    this.ready = this.init();
  }

  private async init() {
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      // 使用相对路径，不指定目录，让它自动存在 AppData 下
      this.store = await load('clawchat-store.json', { defaults: {}, autoSave: 200 });
      
      // 监听存储变化并打印日志
      await this.store.onKeyChange('clawchat.messages', (value: any) => {
        console.log('[Storage] Store 消息更新:', value ? '有数据' : '空');
        // 每次更新都强制保存
        this.store.save();
      });

      this.initialized = true;

      // 强制每次加载都重新保存一次，确保文件存在
      await this.store.save();
      console.log('[Storage] Store 初始化完成并已保存');

      const migratedFlag = await this.store.get('clawchat.migratedFromLocalStorage');
      if (!migratedFlag && typeof localStorage !== 'undefined') {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith('clawchat.'));
        if (keys.length > 0) {
          for (const key of keys) {
            const value = localStorage.getItem(key);
            if (value === null) continue;

            const existing = await this.store.get(key);
            if (existing === null || existing === undefined) {
              await this.store.set(key, value);
            }
          }
          await this.store.set('clawchat.migratedFromLocalStorage', true);
          await this.store.save();
        }
      }
    } catch (error) {
      this.useFallback = true;
    }
  }

  private async ensureReady() {
    await this.ready;
    if (!this.useFallback && !this.initialized) {
      throw new StorageError('Tauri store 未初始化');
    }
  }

  async getItem(key: string): Promise<string | null> {
    await this.ensureReady();
    if (this.useFallback) return await this.fallback.getItem(key);
    return await this.store.get(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.ensureReady();
    if (this.useFallback) return await this.fallback.setItem(key, value);
    await this.store.set(key, value);
    await this.store.save();
  }

  async removeItem(key: string): Promise<void> {
    await this.ensureReady();
    if (this.useFallback) return await this.fallback.removeItem(key);
    await this.store.delete(key);
    await this.store.save();
  }

  async clear(): Promise<void> {
    await this.ensureReady();
    if (this.useFallback && this.fallback.clear) return await this.fallback.clear();
    const keys = await this.store.keys();
    for (const key of keys) {
      await this.store.delete(key);
    }
    await this.store.save();
  }
}

/**
 * 存储工具类
 */
export class Storage {
  private adapter: StorageAdapter;
  private encryptionEnabled: boolean;

  constructor(encryptionEnabled: boolean = true) {
    this.encryptionEnabled = encryptionEnabled;
    this.adapter = this.createAdapter();
  }

  /**
   * 创建存储适配器（同步检测）
   */
  private createAdapter(): StorageAdapter {
    // 在浏览器开发环境下直接使用 localStorage
    if (typeof window !== 'undefined' && !(window as any).__TAURI__) {
      console.log('[Storage] 浏览器环境，使用 localStorage');
      return new LocalStorageAdapter();
    }

    // Tauri 环境尝试使用 Tauri store
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      console.log('[Storage] Tauri 环境，尝试使用 Tauri store');
      return new TauriStoreAdapter();
    }

    return new LocalStorageAdapter();
  }

  /**
   * 安全地序列化数据
   */
  private async serialize(value: any, encrypt: boolean = false): Promise<string> {
    const json = JSON.stringify(value);
    if (encrypt && this.encryptionEnabled) {
      return await EncryptionHelper.encrypt(json);
    }
    return json;
  }

  /**
   * 安全地反序列化数据
   */
  private async deserialize<T>(value: string | null, decrypt: boolean = false): Promise<T | null> {
    if (value === null) return null;

    try {
      let json = value;
      if (decrypt && this.encryptionEnabled) {
        json = await EncryptionHelper.decrypt(value);
      }
      return JSON.parse(json) as T;
    } catch (error) {
      throw new StorageError('数据反序列化失败', error as Error);
    }
  }

  /**
   * 保存数据
   */
  async set<T>(key: string, value: T, encrypt: boolean = false): Promise<void> {
    try {
      const serialized = await this.serialize(value, encrypt);
      await this.adapter.setItem(key, serialized);
    } catch (error) {
      throw new StorageError(`保存数据失败: ${key}`, error as Error);
    }
  }

  /**
   * 获取数据
   */
  async get<T>(key: string, decrypt: boolean = false): Promise<T | null> {
    try {
      const value = await this.adapter.getItem(key);
      return await this.deserialize<T>(value, decrypt);
    } catch (error) {
      throw new StorageError(`获取数据失败: ${key}`, error as Error);
    }
  }

  /**
   * 删除数据
   */
  async remove(key: string): Promise<void> {
    try {
      await this.adapter.removeItem(key);
    } catch (error) {
      throw new StorageError(`删除数据失败: ${key}`, error as Error);
    }
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    try {
      if (this.adapter.clear) {
        await this.adapter.clear();
      }
    } catch (error) {
      throw new StorageError('清空数据失败', error as Error);
    }
  }
}

// 默认存储实例
const defaultStorage = new Storage();

/**
 * 网关存储操作
 */
export const gatewayStorage = {
  /**
   * 保存网关列表
   */
  async saveGateways(gateways: GatewayConfig[]): Promise<void> {
    await defaultStorage.set(STORAGE_KEYS.GATEWAYS, gateways);
  },

  /**
   * 加载网关列表
   */
  async loadGateways(): Promise<GatewayConfig[]> {
    const result = await defaultStorage.get<GatewayConfig[]>(STORAGE_KEYS.GATEWAYS);
    return result || [];
  },

  /**
   * 添加网关
   */
  async addGateway(gateway: GatewayConfig): Promise<void> {
    const gateways = await this.loadGateways();
    const existing = gateways.findIndex(g => g.id === gateway.id);
    if (existing >= 0) {
      gateways[existing] = gateway;
    } else {
      gateways.push(gateway);
    }
    await this.saveGateways(gateways);
  },

  /**
   * 删除网关
   */
  async removeGateway(id: string): Promise<void> {
    const gateways = await this.loadGateways();
    const filtered = gateways.filter(g => g.id !== id);
    await this.saveGateways(filtered);
  },

  /**
   * 更新网关
   */
  async updateGateway(id: string, updates: Partial<GatewayConfig>): Promise<void> {
    const gateways = await this.loadGateways();
    const index = gateways.findIndex(g => g.id === id);
    if (index >= 0) {
      gateways[index] = { ...gateways[index], ...updates };
      await this.saveGateways(gateways);
    }
  },

  /**
   * 获取单个网关
   */
  async getGateway(id: string): Promise<GatewayConfig | null> {
    const gateways = await this.loadGateways();
    return gateways.find(g => g.id === id) || null;
  },
};

/**
 * 房间存储操作
 */
export const roomStorage = {
  /**
   * 保存房间列表
   */
  async saveRooms(rooms: Room[]): Promise<void> {
    await defaultStorage.set(STORAGE_KEYS.ROOMS, rooms);
  },

  /**
   * 加载房间列表
   */
  async loadRooms(): Promise<Room[]> {
    const result = await defaultStorage.get<Room[]>(STORAGE_KEYS.ROOMS);
    return result || [];
  },

  /**
   * 添加或更新房间
   */
  async saveRoom(room: Room): Promise<void> {
    const rooms = await this.loadRooms();
    const existing = rooms.findIndex(r => r.id === room.id);
    if (existing >= 0) {
      rooms[existing] = room;
    } else {
      rooms.push(room);
    }
    await this.saveRooms(rooms);
  },

  /**
   * 删除房间
   */
  async removeRoom(id: string): Promise<void> {
    const rooms = await this.loadRooms();
    const filtered = rooms.filter(r => r.id !== id);
    await this.saveRooms(filtered);
  },

  /**
   * 获取房间
   */
  async getRoom(id: string): Promise<Room | null> {
    const rooms = await this.loadRooms();
    return rooms.find(r => r.id === id) || null;
  },

  /**
   * 保存当前会话
   */
  async saveActiveSession(session: string): Promise<void> {
    await defaultStorage.set(STORAGE_KEYS.ACTIVE_SESSION, session);
  },

  /**
   * 加载当前会话
   */
  async loadActiveSession(): Promise<string | null> {
    return await defaultStorage.get<string>(STORAGE_KEYS.ACTIVE_SESSION);
  },

  /**
   * 清除当前会话
   */
  async clearActiveSession(): Promise<void> {
    await defaultStorage.remove(STORAGE_KEYS.ACTIVE_SESSION);
  },
};

/**
 * 应用设置存储操作
 */
export const settingsStorage = {
  /**
   * 默认设置
   */
  DEFAULTS: (): AppSettings => ({
    theme: 'auto',
    language: 'zh-CN',
    fontSize: 'medium',
    notifications: {
      enabled: true,
      sound: true,
      desktop: true,
    },
    autoReconnect: true,
    reconnectInterval: 3000,
    messageHistoryLimit: 50,
  }),

  /**
   * 保存设置
   */
  async saveSettings(settings: AppSettings): Promise<void> {
    await defaultStorage.set(STORAGE_KEYS.SETTINGS, settings);
  },

  /**
   * 加载设置
   */
  async loadSettings(): Promise<AppSettings> {
    const result = await defaultStorage.get<AppSettings>(STORAGE_KEYS.SETTINGS);
    return result || this.DEFAULTS();
  },

  /**
   * 更新设置
   */
  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.loadSettings();
    const updated = { ...current, ...updates };
    await this.saveSettings(updated);
    return updated;
  },
};

/**
 * 批量消息存储管理器 - 防抖批量写入
 */
class BatchedMessageStorage {
  private batch: Map<string, Message[]> = new Map();
  private flushDebounced: ReturnType<typeof debounce>;
  private isFlushing = false;

  constructor() {
    // 500ms 防抖，最大等待 2000ms
    this.flushDebounced = debounce(
      () => this.flush(),
      500,
      { maxWait: 2000 }
    );
  }

  /**
   * 将消息添加到批量写入队列
   */
  addToBatch(roomId: string, messages: Message[]): void {
    this.batch.set(roomId, messages);
    this.flushDebounced();
  }

  /**
   * 立即执行批量写入
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.batch.size === 0) return;

    this.isFlushing = true;
    const entries = Array.from(this.batch.entries());
    this.batch.clear();

    try {
      // 加载现有消息
      const allMessages = await defaultStorage.get<Record<string, Message[]>>(STORAGE_KEYS.MESSAGES) || {};

      // 合并批量更新
      for (const [roomId, messages] of entries) {
        allMessages[roomId] = messages;
      }

      // 一次性写入
      await defaultStorage.set(STORAGE_KEYS.MESSAGES, allMessages);
      console.log(`[BatchedMessageStorage] 批量写入 ${entries.length} 个房间的消息`);
    } catch (error) {
      console.error('[BatchedMessageStorage] 批量写入失败:', error);
      // 将失败的消息放回队列
      for (const [roomId, messages] of entries) {
        this.batch.set(roomId, messages);
      }
    } finally {
      this.isFlushing = false;
    }
  }
}

// 批量存储实例
const batchedStorage = new BatchedMessageStorage();

/**
 * 消息存储操作
 */
export const messageStorage = {
  /**
   * 保存消息（按房间分组）- 使用批量写入
   */
  async saveMessages(roomId: string, messages: Message[]): Promise<void> {
    batchedStorage.addToBatch(roomId, messages);
  },

  /**
   * 立即保存所有待写入的消息
   */
  async flushPending(): Promise<void> {
    await batchedStorage.flush();
  },

  /**
   * 加载所有消息
   */
  async loadAllMessages(): Promise<Record<string, Message[]>> {
    const result = await defaultStorage.get<Record<string, Message[]>>(STORAGE_KEYS.MESSAGES);
    return result || {};
  },

  /**
   * 加载房间消息
   */
  async loadMessages(roomId: string): Promise<Message[]> {
    const allMessages = await this.loadAllMessages();
    return allMessages[roomId] || [];
  },

  /**
   * 添加消息到房间
   */
  async addMessage(roomId: string, message: Message): Promise<void> {
    const messages = await this.loadMessages(roomId);
    messages.push(message);
    await this.saveMessages(roomId, messages);
  },

  /**
   * 更新消息
   */
  async updateMessage(roomId: string, messageId: string, updates: Partial<Message>): Promise<void> {
    const messages = await this.loadMessages(roomId);
    const index = messages.findIndex(m => m.id === messageId);
    if (index >= 0) {
      messages[index] = { ...messages[index], ...updates };
    } else {
      // 如果消息不存在，则添加它（Upsert）
      // 这对于处理流式消息非常重要，因为第一条流式消息可能还未被持久化
      messages.push(updates as Message);
    }
    await this.saveMessages(roomId, messages);
  },

  /**
   * 删除单条消息
   */
  async deleteMessage(roomId: string, messageId: string): Promise<void> {
    const messages = await this.loadMessages(roomId);
    const newMessages = messages.filter(m => m.id !== messageId);
    if (newMessages.length !== messages.length) {
      await this.saveMessages(roomId, newMessages);
    }
  },

  /**
   * 批量删除消息
   */
  async deleteMessages(roomId: string, messageIds: string[]): Promise<void> {
    const messages = await this.loadMessages(roomId);
    const idSet = new Set(messageIds);
    const newMessages = messages.filter(m => !idSet.has(m.id));
    if (newMessages.length !== messages.length) {
      await this.saveMessages(roomId, newMessages);
    }
  },

  /**
   * 清除房间消息
   */
  async clearMessages(roomId: string): Promise<void> {
    const allMessages = await this.loadAllMessages();
    delete allMessages[roomId];
    await defaultStorage.set(STORAGE_KEYS.MESSAGES, allMessages);
  },

  /**
   * 限制房间消息数量
   */
  async limitMessages(roomId: string, limit: number): Promise<void> {
    const messages = await this.loadMessages(roomId);
    if (messages.length > limit) {
      const trimmed = messages.slice(-limit);
      await this.saveMessages(roomId, trimmed);
    }
  },
};

/**
 * 清除所有数据
 */
export async function clearAllData(): Promise<void> {
  await defaultStorage.clear();
}

/**
 * 导出所有数据（用于备份）
 */
export async function exportData(): Promise<string> {
  const data = {
    gateways: await gatewayStorage.loadGateways(),
    rooms: await roomStorage.loadRooms(),
    activeSession: await roomStorage.loadActiveSession(),
    settings: await settingsStorage.loadSettings(),
    messages: await messageStorage.loadAllMessages(),
    exportedAt: Date.now(),
  };
  return JSON.stringify(data, null, 2);
}

/**
 * 导入数据（用于恢复）
 */
export async function importData(jsonData: string): Promise<void> {
  try {
    const data = JSON.parse(jsonData);

    if (data.gateways) {
      await gatewayStorage.saveGateways(data.gateways);
    }
    if (data.rooms) {
      await roomStorage.saveRooms(data.rooms);
    }
    if (data.activeSession) {
      await roomStorage.saveActiveSession(data.activeSession);
    }
    if (data.settings) {
      await settingsStorage.saveSettings(data.settings);
    }
    if (data.messages) {
      await defaultStorage.set(STORAGE_KEYS.MESSAGES, data.messages);
    }
  } catch (error) {
    throw new StorageError('导入数据失败', error as Error);
  }
}

// 导出存储键
export { STORAGE_KEYS };
