/**
 * 本地存储工具类
 * 支持 localStorage 和 Tauri store 插件
 * 包含批量写入和防抖优化
 */

import type {
  GatewayConfig,
  Message,
  Room,
  ProjectDocument,
  RoleTemplate,
} from '../types';
import { debounce } from 'lodash-es';
import { dbBridge, runDbMirror } from './db';
import { logger } from './logger';

/**
 * 存储键定义
 */
const STORAGE_KEYS = {
  GATEWAYS: 'clawchat.gateways',
  ROOMS: 'clawchat.rooms',
  ACTIVE_SESSION: 'clawchat.activeSession',
  SETTINGS: 'clawchat.settings',
  MESSAGES: 'clawchat.messages',
  DOCUMENTS: 'clawchat.documentsByProject',
  ARCHIVED_CONVERSATIONS: 'clawchat.archivedConversations',
  ROLE_TEMPLATES: 'clawchat.roleTemplates',
  DB_PRIMARY_GATEWAYS_MIGRATED: 'clawchat.dbPrimary.gateways.v1',
  DB_PRIMARY_ROOMS_MIGRATED: 'clawchat.dbPrimary.rooms.v1',
  DB_PRIMARY_TEMPLATES_MIGRATED: 'clawchat.dbPrimary.templates.v1',
  DB_PRIMARY_MESSAGES_MIGRATED: 'clawchat.dbPrimary.messages.v1',
  DB_PRIMARY_DOCUMENTS_MIGRATED: 'clawchat.dbPrimary.documents.v1',
  DB_PRIMARY_ARCHIVES_MIGRATED: 'clawchat.dbPrimary.archives.v1',
} as const;

export interface ArchivedConversationSnapshot {
  id: string;
  roomId: string;
  gatewayId?: string;
  sessionKey?: string;
  roomName?: string;
  archivedAt: number;
  summary: string;
  messages: Message[];
}

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
      await this.store.onKeyChange('clawchat.messages', (_value: any) => {
        // 每次更新都强制保存
        this.store.save();
      });

      this.initialized = true;

      // 强制每次加载都重新保存一次，确保文件存在
      await this.store.save();
      logger.info('Storage', 'tauri store initialized');

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
      logger.info('Storage', 'using localStorage adapter');
      return new LocalStorageAdapter();
    }

    // Tauri 环境尝试使用 Tauri store
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      logger.info('Storage', 'using Tauri store adapter');
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

function stripLegacyTemplateRole(template: RoleTemplate): RoleTemplate {
  const { role: _role, ...normalized } = template as RoleTemplate & { role?: unknown };
  return normalized as RoleTemplate;
}

async function isMigrationComplete(key: string): Promise<boolean> {
  return Boolean(await defaultStorage.get<boolean>(key));
}

async function markMigrationComplete(key: string): Promise<void> {
  await defaultStorage.set(key, true);
}

async function mirrorGatewaysToDb(gateways: GatewayConfig[]): Promise<void> {
  if (!dbBridge.isAvailable()) return;

  const existing = await dbBridge.listGateways<GatewayConfig[]>();
  const nextIds = new Set(gateways.map((gateway) => gateway.id));

  for (const gateway of gateways) {
    await dbBridge.upsertGateway(gateway.id, gateway);

    const nextAgentConfigs = gateway.agentConfigs || {};
    const existingAgentConfigs = existing.find((item) => item.id === gateway.id)?.agentConfigs || {};
    const nextAgentIds = new Set(Object.keys(nextAgentConfigs));

    for (const [agentId, config] of Object.entries(nextAgentConfigs)) {
      await dbBridge.upsertAgentConfig(gateway.id, agentId, config);
    }

    for (const agentId of Object.keys(existingAgentConfigs)) {
      if (!nextAgentIds.has(agentId)) {
        await dbBridge.deleteAgentConfig(gateway.id, agentId);
      }
    }
  }

  for (const gateway of existing) {
    if (!nextIds.has(gateway.id)) {
      await dbBridge.deleteGateway(gateway.id);
    }
  }
}

async function mirrorTemplatesToDb(templates: RoleTemplate[]): Promise<void> {
  if (!dbBridge.isAvailable()) return;

  const existing = await dbBridge.listTemplates<RoleTemplate[]>();
  const nextIds = new Set(templates.map((template) => template.id));

  for (const template of templates) {
    await dbBridge.upsertTemplate(template.id, stripLegacyTemplateRole(template));
  }

  for (const template of existing) {
    if (!nextIds.has(template.id)) {
      await dbBridge.deleteTemplate(template.id);
    }
  }
}

type DbAgentConfigRow = {
  gatewayId: string;
  agentId: string;
  payload: GatewayConfig['agentConfigs'] extends Record<string, infer T> ? T : unknown;
};

function mergeAgentConfigsIntoGateways(
  gateways: GatewayConfig[],
  rows: DbAgentConfigRow[],
): GatewayConfig[] {
  if (rows.length === 0) {
    return gateways;
  }

  const rowsByGateway = new Map<string, Record<string, any>>();
  for (const row of rows) {
    const existing = rowsByGateway.get(row.gatewayId) || {};
    existing[row.agentId] = row.payload;
    rowsByGateway.set(row.gatewayId, existing);
  }

  return gateways.map((gateway) => ({
    ...gateway,
    agentConfigs: rowsByGateway.get(gateway.id) || gateway.agentConfigs || {},
  }));
}

async function loadGatewaysFromDb(): Promise<GatewayConfig[]> {
  const gateways = await dbBridge.listGateways<GatewayConfig[]>();
  if (!Array.isArray(gateways) || gateways.length === 0) {
    return [];
  }

  const rows = await dbBridge.listAgentConfigs<DbAgentConfigRow[]>();
  return mergeAgentConfigsIntoGateways(gateways, Array.isArray(rows) ? rows : []);
}

async function migrateGatewaysToDbIfNeeded(): Promise<void> {
  if (!dbBridge.isAvailable()) return;
  if (await isMigrationComplete(STORAGE_KEYS.DB_PRIMARY_GATEWAYS_MIGRATED)) return;

  const storeGateways = await defaultStorage.get<GatewayConfig[]>(STORAGE_KEYS.GATEWAYS) || [];
  if (storeGateways.length > 0) {
    await mirrorGatewaysToDb(storeGateways);
    logger.info('Storage', 'migrated gateways from legacy store to db', { count: storeGateways.length });
  }
  await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_GATEWAYS_MIGRATED);
}

async function migrateRoomsToDbIfNeeded(): Promise<void> {
  if (!dbBridge.isAvailable()) return;
  if (await isMigrationComplete(STORAGE_KEYS.DB_PRIMARY_ROOMS_MIGRATED)) return;

  const storeRooms = await defaultStorage.get<Room[]>(STORAGE_KEYS.ROOMS) || [];
  if (storeRooms.length > 0) {
    const existing = await dbBridge.listRooms<Room[]>();
    const nextIds = new Set(storeRooms.map((room) => room.id));
    for (const room of storeRooms) {
      await dbBridge.upsertRoom(room.id, room);
    }
    for (const room of existing) {
      if (!nextIds.has(room.id)) {
        await dbBridge.deleteRoom(room.id);
      }
    }
    logger.info('Storage', 'migrated rooms from legacy store to db', { count: storeRooms.length });
  }
  await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_ROOMS_MIGRATED);
}

async function migrateTemplatesToDbIfNeeded(): Promise<void> {
  if (!dbBridge.isAvailable()) return;
  if (await isMigrationComplete(STORAGE_KEYS.DB_PRIMARY_TEMPLATES_MIGRATED)) return;

  const storeTemplates = (await defaultStorage.get<RoleTemplate[]>(STORAGE_KEYS.ROLE_TEMPLATES) || [])
    .map(stripLegacyTemplateRole);
  if (storeTemplates.length > 0) {
    await mirrorTemplatesToDb(storeTemplates);
    logger.info('Storage', 'migrated templates from legacy store to db', { count: storeTemplates.length });
  }
  await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_TEMPLATES_MIGRATED);
}

async function migrateMessagesToDbIfNeeded(): Promise<void> {
  if (!dbBridge.isAvailable()) return;
  if (await isMigrationComplete(STORAGE_KEYS.DB_PRIMARY_MESSAGES_MIGRATED)) return;

  const allMessages = await defaultStorage.get<Record<string, Message[]>>(STORAGE_KEYS.MESSAGES) || {};
  for (const [roomId, messages] of Object.entries(allMessages)) {
    if (!messages || messages.length === 0) continue;
    await dbBridge.importRoomMessages(roomId, messages);
  }
  logger.info('Storage', 'migrated messages from legacy store to db', { roomCount: Object.keys(allMessages).length });
  await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_MESSAGES_MIGRATED);
}

async function migrateDocumentsToDbIfNeeded(): Promise<void> {
  if (!dbBridge.isAvailable()) return;
  if (await isMigrationComplete(STORAGE_KEYS.DB_PRIMARY_DOCUMENTS_MIGRATED)) return;

  const documentsByProject = await defaultStorage.get<Record<string, ProjectDocument[]>>(STORAGE_KEYS.DOCUMENTS) || {};
  for (const [projectId, docs] of Object.entries(documentsByProject)) {
    await dbBridge.replaceProjectDocuments(projectId, docs);
  }
  logger.info('Storage', 'migrated documents from legacy store to db', { projectCount: Object.keys(documentsByProject).length });
  await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_DOCUMENTS_MIGRATED);
}

async function migrateArchivesToDbIfNeeded(): Promise<void> {
  if (!dbBridge.isAvailable()) return;
  if (await isMigrationComplete(STORAGE_KEYS.DB_PRIMARY_ARCHIVES_MIGRATED)) return;

  const archives = await defaultStorage.get<ArchivedConversationSnapshot[]>(STORAGE_KEYS.ARCHIVED_CONVERSATIONS) || [];
  await dbBridge.replaceArchives(archives);
  logger.info('Storage', 'migrated archives from legacy store to db', { count: archives.length });
  await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_ARCHIVES_MIGRATED);
}

function logReadSource(scope: string, source: 'db' | 'store', count: number): void {
  logger.debug('Storage', `${scope} loaded from ${source}`, { count });
}

type MessageImportPriority = 'active' | 'normal';

export interface MessageImportStatus {
  running: boolean;
  pendingRooms: string[];
  activeRoomId: string | null;
  importedRooms: number;
  importedMessages: number;
  failedRooms: number;
  sampleMismatches: number;
  lastError?: string;
  lastImportedRoomId?: string;
  lastRunAt?: number;
}

class MessageImportScheduler {
  private queue = new Map<string, MessageImportPriority>();
  private running = false;
  private scheduled = false;
  private activeRoomId: string | null = null;
  private readonly maxRoomsPerBatch = 3;
  private readonly maxMessagesPerRoom = 500;
  private readonly idleDelayMs = 50;
  private status: MessageImportStatus = {
    running: false,
    pendingRooms: [],
    activeRoomId: null,
    importedRooms: 0,
    importedMessages: 0,
    failedRooms: 0,
    sampleMismatches: 0,
  };

  setActiveRoom(roomId: string | null) {
    this.activeRoomId = roomId;
    this.status.activeRoomId = roomId;
    if (roomId && this.queue.has(roomId)) {
      this.queue.set(roomId, 'active');
      this.schedule();
    }
  }

  scheduleRoom(roomId: string, priority: MessageImportPriority = 'normal') {
    const nextPriority = priority === 'active' || this.activeRoomId === roomId ? 'active' : 'normal';
    const currentPriority = this.queue.get(roomId);
    if (currentPriority !== 'active') {
      this.queue.set(roomId, nextPriority);
    }
    this.status.pendingRooms = [...this.queue.keys()];
    this.schedule();
  }

  getStatus(): MessageImportStatus {
    return {
      ...this.status,
      pendingRooms: [...this.queue.keys()],
    };
  }

  private schedule() {
    if (this.running || this.scheduled || !dbBridge.isAvailable()) {
      return;
    }

    this.scheduled = true;
    window.setTimeout(() => {
      this.scheduled = false;
      void this.runBatch();
    }, this.idleDelayMs);
  }

  private async runBatch() {
    if (this.running || this.queue.size === 0 || !dbBridge.isAvailable()) {
      return;
    }

    this.running = true;
    this.status.running = true;
    this.status.pendingRooms = [...this.queue.keys()];

    try {
      const roomIds = [...this.queue.entries()]
        .sort((a, b) => {
          if (a[1] === b[1]) return 0;
          return a[1] === 'active' ? -1 : 1;
        })
        .slice(0, this.maxRoomsPerBatch)
        .map(([roomId]) => roomId);

      for (const roomId of roomIds) {
        this.queue.delete(roomId);
        await this.importRoom(roomId);
      }
    } finally {
      this.running = false;
      this.status.running = false;
      this.status.pendingRooms = [...this.queue.keys()];
      if (this.queue.size > 0) {
        this.schedule();
      }
    }
  }

  private async importRoom(roomId: string) {
    try {
      const messages = await messageStorage.loadMessages(roomId);
      const limitedMessages = messages.slice(-this.maxMessagesPerRoom);
      const imported = await dbBridge.importRoomMessages(roomId, limitedMessages);
      const stats = await dbBridge.getRoomMessageStats(roomId);

      this.status.importedRooms += 1;
      this.status.importedMessages += imported;
      this.status.lastImportedRoomId = roomId;
      this.status.lastRunAt = Date.now();

      logger.info('Storage', 'message import batch finished', {
        roomId,
        sourceCount: limitedMessages.length,
        imported,
        dbCount: stats.count,
      });

      if (stats.count !== limitedMessages.length) {
        this.status.sampleMismatches += 1;
        logger.warn('Storage', 'message import count mismatch', {
          roomId,
          sourceCount: limitedMessages.length,
          dbCount: stats.count,
        });
      }

      await this.verifyRoomSamples(roomId, limitedMessages);
    } catch (error) {
      this.status.failedRooms += 1;
      this.status.lastError = error instanceof Error ? error.message : String(error);
      logger.error('Storage', 'message import batch failed', { roomId, error });
    }
  }

  private async verifyRoomSamples(roomId: string, messages: Message[]) {
    if (messages.length === 0) return;

    const sampleIds = Array.from(new Set([
      messages[0]?.id,
      messages[Math.floor(messages.length / 2)]?.id,
      messages[messages.length - 1]?.id,
    ].filter(Boolean) as string[]));

    if (sampleIds.length === 0) return;

    const dbSamples = await dbBridge.getRoomMessageSamples<Message[]>(roomId, sampleIds);
    const dbById = new Map((dbSamples || []).map((message) => [message.id, message]));

    for (const sampleId of sampleIds) {
      const source = messages.find((message) => message.id === sampleId);
      const target = dbById.get(sampleId);
      if (!source || !target) {
        this.status.sampleMismatches += 1;
        logger.warn('Storage', 'message sample missing after import', { roomId, sampleId });
        continue;
      }

      const sourceJson = JSON.stringify(source);
      const targetJson = JSON.stringify(target);
      if (sourceJson !== targetJson) {
        this.status.sampleMismatches += 1;
        logger.warn('Storage', 'message sample content mismatch', { roomId, sampleId });
      }
    }
  }
}

const messageImportScheduler = new MessageImportScheduler();

export function setMessageImportActiveRoom(roomId: string | null): void {
  messageImportScheduler.setActiveRoom(roomId);
}

export function getMessageImportStatus(): MessageImportStatus {
  return messageImportScheduler.getStatus();
}

export function triggerMessageImport(roomId?: string, priority: MessageImportPriority = 'normal'): void {
  if (roomId) {
    messageImportScheduler.scheduleRoom(roomId, priority);
    return;
  }

  void messageStorage.loadAllMessages().then((allMessages) => {
    Object.keys(allMessages).forEach((targetRoomId) => {
      messageImportScheduler.scheduleRoom(targetRoomId, priority);
    });
  });
}

export async function validateRoomMessagesAgainstDb(roomId: string): Promise<{
  room_id: string;
  expected_count: number;
  db_count: number;
  missing_ids: string[];
  extra_ids: string[];
  mismatched_ids: string[];
}> {
  const messages = await messageStorage.loadMessages(roomId);
  return dbBridge.validateRoomMessages(roomId, messages);
}

export async function maybeLoadRecentRoomMessagesFromDb(roomId: string, limit: number): Promise<Message[] | null> {
  if (!dbBridge.isAvailable()) {
    return null;
  }

  const sourceMessages = await messageStorage.loadMessages(roomId);
  const recentMessages = sourceMessages.slice(-limit);
  if (recentMessages.length === 0) {
    return null;
  }

  const report = await dbBridge.validateRoomMessages(roomId, recentMessages);
  if (report.missing_ids.length > 0 || report.mismatched_ids.length > 0) {
    logger.warn('Storage', 'recent room db read gated by validation failure', {
      roomId,
      missing: report.missing_ids.length,
      mismatched: report.mismatched_ids.length,
    });
    return null;
  }

  const dbMessages = await dbBridge.listRecentRoomMessages<Message[]>(roomId, limit, 0);
  logger.info('Storage', 'recent room messages loaded from db', {
    roomId,
    count: Array.isArray(dbMessages) ? dbMessages.length : 0,
  });
  return Array.isArray(dbMessages) ? dbMessages : null;
}

export async function importMessagesToDbInBackground(roomIds?: string[]): Promise<void> {
  if (!dbBridge.isAvailable()) {
    return;
  }

  const allMessages = await messageStorage.loadAllMessages();
  const targetRoomIds = roomIds && roomIds.length > 0 ? roomIds : Object.keys(allMessages);

  for (const roomId of targetRoomIds) {
    const messages = allMessages[roomId] || [];
    if (messages.length === 0) {
      continue;
    }

    await runDbMirror('importRoomMessages', async () => {
      const imported = await dbBridge.importRoomMessages(roomId, messages);
      const stats = await dbBridge.getRoomMessageStats(roomId);
      logger.info('Storage', 'room messages imported to db', {
        roomId,
        sourceCount: messages.length,
        imported,
        dbCount: stats.count,
        dbLatestTimestamp: stats.latestTimestamp,
      });
      if (stats.count !== messages.length) {
        logger.warn('Storage', 'room message count mismatch after import', {
          roomId,
          sourceCount: messages.length,
          dbCount: stats.count,
        });
      }
    });
  }
}

/**
 * 网关存储操作
 */
export const gatewayStorage = {
  /**
   * 保存网关列表
   */
  async saveGateways(gateways: GatewayConfig[]): Promise<void> {
    if (!dbBridge.isAvailable()) {
      await defaultStorage.set(STORAGE_KEYS.GATEWAYS, gateways);
      return;
    }

    await mirrorGatewaysToDb(gateways);
    await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_GATEWAYS_MIGRATED);
  },

  /**
   * 加载网关列表
   */
  async loadGateways(): Promise<GatewayConfig[]> {
    if (!dbBridge.isAvailable()) {
      const storeGateways = await defaultStorage.get<GatewayConfig[]>(STORAGE_KEYS.GATEWAYS) || [];
      logReadSource('gateways', 'store', storeGateways.length);
      return storeGateways;
    }

    await migrateGatewaysToDbIfNeeded();
    const dbGateways = await loadGatewaysFromDb();
    logReadSource('gateways', 'db', dbGateways.length);
    return dbGateways;
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
    if (!dbBridge.isAvailable()) {
      await defaultStorage.set(STORAGE_KEYS.ROOMS, rooms);
      return;
    }

    const existing = await dbBridge.listRooms<Room[]>();
    const nextIds = new Set(rooms.map((room) => room.id));

    for (const room of rooms) {
      await dbBridge.upsertRoom(room.id, room);
    }

    for (const room of existing) {
      if (!nextIds.has(room.id)) {
        await dbBridge.deleteRoom(room.id);
      }
    }

    await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_ROOMS_MIGRATED);
  },

  /**
   * 加载房间列表
   */
  async loadRooms(): Promise<Room[]> {
    if (!dbBridge.isAvailable()) {
      const storeRooms = await defaultStorage.get<Room[]>(STORAGE_KEYS.ROOMS) || [];
      logReadSource('rooms', 'store', storeRooms.length);
      return storeRooms;
    }

    await migrateRoomsToDbIfNeeded();
    const dbRooms = await dbBridge.listRooms<Room[]>();
    logReadSource('rooms', 'db', Array.isArray(dbRooms) ? dbRooms.length : 0);
    return Array.isArray(dbRooms) ? dbRooms : [];
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
 * 文档库存储操作（按 projectId 分组）
 */
export const documentStorage = {
  async loadDocumentsByProject(): Promise<Record<string, ProjectDocument[]>> {
    if (!dbBridge.isAvailable()) {
      const result = await defaultStorage.get<Record<string, ProjectDocument[]>>(STORAGE_KEYS.DOCUMENTS);
      return result || {};
    }

    await migrateDocumentsToDbIfNeeded();
    const documents = await dbBridge.listDocuments<ProjectDocument[]>();
    const grouped: Record<string, ProjectDocument[]> = {};
    for (const doc of documents || []) {
      if (!grouped[doc.projectId]) grouped[doc.projectId] = [];
      grouped[doc.projectId].push(doc);
    }
    return grouped;
  },

  async saveDocumentsByProject(documentsByProject: Record<string, ProjectDocument[]>): Promise<void> {
    if (!dbBridge.isAvailable()) {
      await defaultStorage.set(STORAGE_KEYS.DOCUMENTS, documentsByProject);
      return;
    }

    const projects = Object.keys(documentsByProject);
    const existing = await this.loadDocumentsByProject();
    for (const projectId of Object.keys(existing)) {
      if (!(projectId in documentsByProject)) {
        await dbBridge.replaceProjectDocuments(projectId, []);
      }
    }
    for (const projectId of projects) {
      await dbBridge.replaceProjectDocuments(projectId, documentsByProject[projectId]);
    }
    await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_DOCUMENTS_MIGRATED);
  },

  async loadProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
    const all = await this.loadDocumentsByProject();
    return all[projectId] || [];
  },

  async saveProjectDocuments(projectId: string, documents: ProjectDocument[]): Promise<void> {
    const all = await this.loadDocumentsByProject();
    all[projectId] = documents;
    await this.saveDocumentsByProject(all);
  },
};

export const archiveStorage = {
  async loadArchives(): Promise<ArchivedConversationSnapshot[]> {
    if (!dbBridge.isAvailable()) {
      const result = await defaultStorage.get<ArchivedConversationSnapshot[]>(STORAGE_KEYS.ARCHIVED_CONVERSATIONS);
      return result || [];
    }

    await migrateArchivesToDbIfNeeded();
    const result = await dbBridge.listArchives<ArchivedConversationSnapshot[]>();
    return result || [];
  },

  async saveArchives(items: ArchivedConversationSnapshot[]): Promise<void> {
    if (!dbBridge.isAvailable()) {
      await defaultStorage.set(STORAGE_KEYS.ARCHIVED_CONVERSATIONS, items);
      return;
    }

    await dbBridge.replaceArchives(items);
    await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_ARCHIVES_MIGRATED);
  },

  async addArchive(item: ArchivedConversationSnapshot): Promise<void> {
    const current = await this.loadArchives();
    await this.saveArchives([item, ...current].slice(0, 200));
  },
};

export const roleTemplateStorage = {
  async saveTemplates(templates: RoleTemplate[]): Promise<void> {
    const normalized = templates.map(stripLegacyTemplateRole);
    if (!dbBridge.isAvailable()) {
      await defaultStorage.set(STORAGE_KEYS.ROLE_TEMPLATES, normalized);
      return;
    }

    await mirrorTemplatesToDb(normalized);
    await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_TEMPLATES_MIGRATED);
  },

  async loadTemplates(): Promise<RoleTemplate[]> {
    if (!dbBridge.isAvailable()) {
      const storeTemplates = (await defaultStorage.get<RoleTemplate[]>(STORAGE_KEYS.ROLE_TEMPLATES) || [])
        .map(({ role: _role, ...template }) => template as RoleTemplate);
      logReadSource('templates', 'store', storeTemplates.length);
      return storeTemplates;
    }

    await migrateTemplatesToDbIfNeeded();
    const dbTemplates = await dbBridge.listTemplates<RoleTemplate[]>();
    const normalized = (Array.isArray(dbTemplates) ? dbTemplates : []).map(stripLegacyTemplateRole);
    logReadSource('templates', 'db', normalized.length);
    return normalized;
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
      logger.debug('Storage', 'batched messages flushed', { roomCount: entries.length });
    } catch (error) {
      logger.error('Storage', 'batched message flush failed', error);
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
    if (!dbBridge.isAvailable()) {
      batchedStorage.addToBatch(roomId, messages);
      return;
    }

    await dbBridge.importRoomMessages(roomId, messages);
    await markMigrationComplete(STORAGE_KEYS.DB_PRIMARY_MESSAGES_MIGRATED);
    messageImportScheduler.scheduleRoom(roomId);
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
    if (!dbBridge.isAvailable()) {
      const result = await defaultStorage.get<Record<string, Message[]>>(STORAGE_KEYS.MESSAGES);
      return result || {};
    }

    await migrateMessagesToDbIfNeeded();
    const dbMessages = await dbBridge.listAllMessages<Message[]>();
    const grouped: Record<string, Message[]> = {};
    for (const message of dbMessages || []) {
      if (!message.roomId) continue;
      if (!grouped[message.roomId]) grouped[message.roomId] = [];
      grouped[message.roomId].push(message);
    }
    return grouped;
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
    if (!dbBridge.isAvailable()) {
      const messages = await this.loadMessages(roomId);
      const newMessages = messages.filter(m => m.id !== messageId);
      if (newMessages.length !== messages.length) {
        await this.saveMessages(roomId, newMessages);
      }
      return;
    }

    await dbBridge.deleteMessage(roomId, messageId);
  },

  /**
   * 批量删除消息
   */
  async deleteMessages(roomId: string, messageIds: string[]): Promise<void> {
    if (!dbBridge.isAvailable()) {
      const messages = await this.loadMessages(roomId);
      const idSet = new Set(messageIds);
      const newMessages = messages.filter(m => !idSet.has(m.id));
      if (newMessages.length !== messages.length) {
        await this.saveMessages(roomId, newMessages);
      }
      return;
    }

    await dbBridge.deleteMessages(roomId, messageIds);
  },

  /**
   * 清除房间消息
   */
  async clearMessages(roomId: string): Promise<void> {
    if (!dbBridge.isAvailable()) {
      const allMessages = await this.loadAllMessages();
      delete allMessages[roomId];
      await defaultStorage.set(STORAGE_KEYS.MESSAGES, allMessages);
      messageImportScheduler.scheduleRoom(roomId);
      return;
    }

    await dbBridge.clearRoomMessages(roomId);
    messageImportScheduler.scheduleRoom(roomId);
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
    documentsByProject: await documentStorage.loadDocumentsByProject(),
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
    if (data.documentsByProject) {
      await documentStorage.saveDocumentsByProject(data.documentsByProject);
    }
  } catch (error) {
    throw new StorageError('导入数据失败', error as Error);
  }
}

// 导出存储键
export { STORAGE_KEYS };
