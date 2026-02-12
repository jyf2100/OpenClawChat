import { create } from "zustand";
import { Room, Message } from "../types";
import { roomStorage, messageStorage } from "../lib/storage";

// 内存中保留的最大消息数量
const MAX_MESSAGES_IN_MEMORY = 500;

// 优化的消息存储结构
interface RoomMessages {
  byId: Map<string, Message>;  // O(1) 查找
  ids: string[];                // 有序 ID 列表
  version: number;              // 版本号，用于乐观更新检测
}

interface RoomStore {
  rooms: Room[];
  activeRoomId: string | null;
  // 内部使用优化结构，外部接口保持兼容
  _roomMessages: Record<string, RoomMessages>;
  _initialized: boolean;

  // Actions
  init: () => Promise<void>;
  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => Promise<void>;
  removeRoom: (id: string) => Promise<void>;
  updateRoom: (id: string, updates: Partial<Room>) => Promise<void>;
  setActiveRoom: (id: string | null) => Promise<void>;
  addMessage: (roomId: string, message: Message) => Promise<void>;
  updateMessage: (roomId: string, messageId: string, message: Message) => Promise<void>;
  deleteMessage: (roomId: string, messageId: string) => Promise<void>;
  deleteMessages: (roomId: string, messageIds: string[]) => Promise<void>;
  getMessages: (roomId: string) => Message[];
  clearMessages: (roomId: string) => Promise<void>;
  initDefaultRoom: (gatewayId?: string) => void;
  // 获取消息数量（用于分页）
  getMessageCount: (roomId: string) => number;
  // 获取分页消息
  getMessagesPaginated: (roomId: string, page: number, pageSize: number) => Message[];
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  _roomMessages: {},
  _initialized: false,

  // 初始化：从存储加载数据
  init: async () => {
    if (get()._initialized) return;

    try {
      const [rooms, activeSession, allMessages] = await Promise.all([
        roomStorage.loadRooms(),
        roomStorage.loadActiveSession(),
        messageStorage.loadAllMessages(),
      ]);

      const messageRoomIds = Object.keys(allMessages || {});
      const existingRoomIds = new Set((rooms || []).map(r => r.id));
      let migratedRooms: Room[] = [...(rooms || [])];
      let needsMigration = false;

      // 1. 迁移旧的 room:default:* 房间到 default:agent:main:main
      // 2. 迁移旧的 agent:main:main 到 default:agent:main:main
      const oldDefaultRooms = migratedRooms.filter(r =>
        r.id.startsWith('room:default:') ||
        (r.id === 'agent:main:main' && r.gatewayId === 'default')
      );

      if (oldDefaultRooms.length > 0) {
        console.log('[RoomStore] 发现旧格式房间，开始迁移:', oldDefaultRooms);
        const targetId = 'default:agent:main:main';

        // 确保目标房间存在
        if (!existingRoomIds.has(targetId)) {
          migratedRooms.push({
            id: targetId,
            gatewayId: 'default',
            name: '默认频道',
            type: 'channel',
            unreadCount: 0,
          });
          existingRoomIds.add(targetId);
        }

        // 迁移消息
        for (const oldRoom of oldDefaultRooms) {
          const oldMessages = allMessages[oldRoom.id] || [];
          if (oldMessages.length > 0) {
            console.log(`[RoomStore] 迁移消息 ${oldRoom.id} -> ${targetId} (${oldMessages.length}条)`);
            const targetMessages = allMessages[targetId] || [];
            // 合并并去重
            const merged = [...targetMessages, ...oldMessages].sort((a, b) => a.timestamp - b.timestamp);
            const unique = merged.filter((msg, index, self) =>
              index === self.findIndex((m) => m.id === msg.id)
            );
            allMessages[targetId] = unique;
            delete allMessages[oldRoom.id];
            await messageStorage.saveMessages(targetId, unique);
            await messageStorage.clearMessages(oldRoom.id);
          }
        }

        // 移除旧房间
        migratedRooms = migratedRooms.filter(r => !r.id.startsWith('room:default:') && r.id !== 'agent:main:main');
        needsMigration = true;
      }

      // 恢复"幽灵"房间（有消息但没房间记录）
      for (const roomId of messageRoomIds) {
        if (existingRoomIds.has(roomId)) continue;
        if (roomId.startsWith('room:default:')) continue;
        if (roomId === 'agent:main:main') continue; // 已处理

        // 如果是无前缀的 ID，且不在现有列表中，尝试归类为 default 网关
        // 但根据新规则，所有 ID 必须有前缀。如果发现无前缀的幽灵数据，我们迁移到 default:ID
        let finalRoomId = roomId;
        let gatewayId = 'default';

        if (!roomId.includes(':')) {
            finalRoomId = `default:${roomId}`;
            // 迁移消息
            const msgs = allMessages[roomId];
            if (msgs) {
                allMessages[finalRoomId] = msgs;
                delete allMessages[roomId];
                await messageStorage.saveMessages(finalRoomId, msgs);
                await messageStorage.clearMessages(roomId);
            }
        } else {
            // 尝试从 ID 解析 gatewayId
            // 假设格式 gatewayId:sessionKey
            const parts = roomId.split(':');
            if (parts.length > 1) {
                // 简单的启发式：第一个部分作为 gatewayId
                // 注意：agent:main:main 会被解析为 agent，但这通常是 default 网关
                if (roomId.startsWith('agent:')) {
                    // 这是旧格式，归为 default
                    finalRoomId = `default:${roomId}`;
                    gatewayId = 'default';
                    // 迁移...
                    const msgs = allMessages[roomId];
                    if (msgs) {
                        allMessages[finalRoomId] = msgs;
                        delete allMessages[roomId];
                        await messageStorage.saveMessages(finalRoomId, msgs);
                        await messageStorage.clearMessages(roomId);
                    }
                } else {
                    gatewayId = parts[0];
                }
            }
        }

        migratedRooms.push({
          id: finalRoomId,
          gatewayId: gatewayId,
          name: finalRoomId.includes('agent:main:main') ? '默认频道' : `会话 ${finalRoomId.slice(0, 8)}`,
          type: 'channel',
          unreadCount: 0,
        });
        existingRoomIds.add(finalRoomId);
        needsMigration = true;
      }

      if (needsMigration) {
        await roomStorage.saveRooms(migratedRooms);
        console.log('[RoomStore] 迁移完成，新房间列表:', migratedRooms);
      }

      // 修正 activeSession
      let nextActiveRoomId = activeSession;
      // 映射旧 session 到新 ID
      if (activeSession) {
          if (activeSession.startsWith('room:default:') || activeSession === 'agent:main:main') {
              nextActiveRoomId = 'default:agent:main:main';
          } else if (!activeSession.includes(':') && !activeSession.startsWith('default:')) {
              nextActiveRoomId = `default:${activeSession}`;
          }
      }

      if (!nextActiveRoomId || !existingRoomIds.has(nextActiveRoomId)) {
        nextActiveRoomId = migratedRooms[0]?.id ?? null;
      }

      if (nextActiveRoomId !== activeSession) {
        await roomStorage.saveActiveSession(nextActiveRoomId || '');
      }

      // 将数组消息转换为优化结构
      const roomMessages: Record<string, RoomMessages> = {};
      for (const [roomId, messages] of Object.entries(allMessages)) {
        if (!messages || messages.length === 0) continue;

        const byId = new Map<string, Message>();
        const ids: string[] = [];

        for (const msg of messages) {
          if (!byId.has(msg.id)) {
            byId.set(msg.id, msg);
            ids.push(msg.id);
          }
        }

        roomMessages[roomId] = {
          byId,
          ids,
          version: 0,
        };
      }

      set({
        rooms: migratedRooms,
        activeRoomId: nextActiveRoomId,
        _roomMessages: roomMessages,
        _initialized: true,
      });

      console.log('[RoomStore] 已加载房间配置:', migratedRooms);
      console.log('[RoomStore] 已加载消息历史:', Object.keys(roomMessages).length, '个房间');
    } catch (error) {
      console.error('[RoomStore] 初始化失败:', error);
      set({ _initialized: true });
    }
  },

  setRooms: (rooms) => set({ rooms }),

  addRoom: async (room) => {
    set((state) => ({
      rooms: [...state.rooms, room],
    }));

    try {
      await roomStorage.saveRoom(room);
      console.log('[RoomStore] 已保存房间:', room);
    } catch (error) {
      console.error('[RoomStore] 保存房间失败:', error);
    }
  },

  removeRoom: async (id) => {
    set((state) => ({
      rooms: state.rooms.filter((r) => r.id !== id),
      activeRoomId: state.activeRoomId === id ? null : state.activeRoomId,
      _roomMessages: (() => {
        const newRoomMessages = { ...state._roomMessages };
        delete newRoomMessages[id];
        return newRoomMessages;
      })(),
    }));

    try {
      await roomStorage.removeRoom(id);
      await messageStorage.clearMessages(id);
      console.log('[RoomStore] 已删除房间:', id);
    } catch (error) {
      console.error('[RoomStore] 删除房间失败:', error);
    }
  },

  updateRoom: async (id, updates) => {
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    }));

    try {
      const room = get().rooms.find(r => r.id === id);
      if (room) {
        await roomStorage.saveRoom(room);
        console.log('[RoomStore] 已更新房间:', id, updates);
      }
    } catch (error) {
      console.error('[RoomStore] 更新房间失败:', error);
    }
  },

  setActiveRoom: async (id) => {
    set({ activeRoomId: id });

    try {
      if (id) {
        await roomStorage.saveActiveSession(id);
      } else {
        await roomStorage.clearActiveSession();
      }
    } catch (error) {
      console.error('[RoomStore] 保存当前会话失败:', error);
    }
  },

  addMessage: async (roomId, message) => {
    set((state) => {
      const roomMsgs = state._roomMessages[roomId];

      // 检查消息是否已存在（去重）
      if (roomMsgs?.byId.has(message.id)) {
        console.log(`[RoomStore] 消息已存在，跳过添加: ${message.id}`);
        return state;
      }

      // 创建或更新 RoomMessages
      const newById = roomMsgs ? new Map(roomMsgs.byId) : new Map<string, Message>();
      const newIds = roomMsgs ? [...roomMsgs.ids] : [];

      newById.set(message.id, message);
      newIds.push(message.id);

      // 限制内存中保留的消息数量
      if (newIds.length > MAX_MESSAGES_IN_MEMORY) {
        const oldestId = newIds.shift();
        if (oldestId) {
          newById.delete(oldestId);
        }
      }

      return {
        _roomMessages: {
          ...state._roomMessages,
          [roomId]: {
            byId: newById,
            ids: newIds,
            version: (roomMsgs?.version ?? 0) + 1,
          },
        },
      };
    });

    try {
      await messageStorage.addMessage(roomId, message);
    } catch (error) {
      console.error('[RoomStore] 保存消息失败:', error);
    }
  },

  updateMessage: async (roomId, messageId, message) => {
    set((state) => {
      const roomMsgs = state._roomMessages[roomId];

      if (!roomMsgs) {
        // 房间消息不存在，创建新记录
        const newById = new Map<string, Message>();
        newById.set(messageId, message);
        return {
          _roomMessages: {
            ...state._roomMessages,
            [roomId]: {
              byId: newById,
              ids: [messageId],
              version: 1,
            },
          },
        };
      }

      // O(1) 查找和更新
      const newById = new Map(roomMsgs.byId);
      let newIds = roomMsgs.ids;

      if (!newById.has(messageId)) {
        // 消息不存在，添加新消息
        newIds = [...newIds, messageId];
      }

      newById.set(messageId, message);

      return {
        _roomMessages: {
          ...state._roomMessages,
          [roomId]: {
            byId: newById,
            ids: newIds,
            version: roomMsgs.version + 1,
          },
        },
      };
    });

    try {
      await messageStorage.updateMessage(roomId, messageId, message);
    } catch (error) {
      console.error('[RoomStore] 更新消息失败:', error);
    }
  },

  deleteMessage: async (roomId, messageId) => {
    console.log(`[RoomStore] 尝试删除消息: room=${roomId}, msg=${messageId}`);
    set((state) => {
      const roomMsgs = state._roomMessages[roomId];
      if (!roomMsgs?.byId.has(messageId)) {
        console.log(`[RoomStore] 消息不存在: ${messageId}`);
        return state;
      }

      const newById = new Map(roomMsgs.byId);
      newById.delete(messageId);
      const newIds = roomMsgs.ids.filter(id => id !== messageId);

      console.log(`[RoomStore] 删除结果: ${roomMsgs.ids.length} -> ${newIds.length}`);

      return {
        _roomMessages: {
          ...state._roomMessages,
          [roomId]: {
            byId: newById,
            ids: newIds,
            version: roomMsgs.version + 1,
          },
        },
      };
    });

    try {
      await messageStorage.deleteMessage(roomId, messageId);
    } catch (error) {
      console.error('[RoomStore] 删除消息失败:', error);
    }
  },

  deleteMessages: async (roomId, messageIds) => {
    console.log(`[RoomStore] 尝试批量删除消息: room=${roomId}, count=${messageIds.length}`);
    set((state) => {
      const roomMsgs = state._roomMessages[roomId];
      if (!roomMsgs) return state;

      const idSet = new Set(messageIds);
      const newById = new Map(roomMsgs.byId);

      for (const id of messageIds) {
        newById.delete(id);
      }

      const newIds = roomMsgs.ids.filter((id) => !idSet.has(id));
      console.log(`[RoomStore] 批量删除结果: ${roomMsgs.ids.length} -> ${newIds.length}`);

      return {
        _roomMessages: {
          ...state._roomMessages,
          [roomId]: {
            byId: newById,
            ids: newIds,
            version: roomMsgs.version + 1,
          },
        },
      };
    });

    try {
      await messageStorage.deleteMessages(roomId, messageIds);
    } catch (error) {
      console.error('[RoomStore] 批量删除消息失败:', error);
    }
  },

  getMessages: (roomId) => {
    const roomMsgs = get()._roomMessages[roomId];
    if (!roomMsgs) return [];

    // 按 ids 顺序返回消息数组
    return roomMsgs.ids.map(id => roomMsgs.byId.get(id)!).filter(Boolean);
  },

  getMessageCount: (roomId) => {
    return get()._roomMessages[roomId]?.ids.length ?? 0;
  },

  getMessagesPaginated: (roomId, page, pageSize) => {
    const roomMsgs = get()._roomMessages[roomId];
    if (!roomMsgs) return [];

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageIds = roomMsgs.ids.slice(start, end);

    return pageIds.map(id => roomMsgs.byId.get(id)!).filter(Boolean);
  },

  clearMessages: async (roomId) => {
    set((state) => {
      const newRoomMessages = { ...state._roomMessages };
      delete newRoomMessages[roomId];
      return { _roomMessages: newRoomMessages };
    });

    try {
      await messageStorage.clearMessages(roomId);
    } catch (error) {
      console.error('[RoomStore] 清除消息失败:', error);
    }
  },

  initDefaultRoom: (gatewayId?: string) => {
    // 确保已初始化（防止过早创建空房间导致覆盖旧数据）
    if (!get()._initialized) {
      console.log('[RoomStore] 等待存储初始化后再检查默认房间...');
      // 简单轮询等待
      const checkInit = setInterval(() => {
        if (get()._initialized) {
          clearInterval(checkInit);
          get().initDefaultRoom(gatewayId);
        }
      }, 100);
      return;
    }

    const state = get();
    const targetGatewayId = gatewayId;

    if (!targetGatewayId) {
      console.error('[roomStore] initDefaultRoom: gatewayId 为空');
      return;
    }

    // 检查该网关下是否有房间
    const gatewayRooms = state.rooms.filter(r => r.gatewayId === targetGatewayId);

    if (gatewayRooms.length === 0) {
      const defaultRoomId = `${targetGatewayId}:agent:main:main`;
      const defaultRoom: Room = {
        id: defaultRoomId,
        gatewayId: targetGatewayId,
        name: '默认频道',
        type: 'channel',
        unreadCount: 0,
      };

      // 使用 addRoom 确保持久化
      get().addRoom(defaultRoom);

      // 如果没有选中的房间，选中这个新房间
      if (!state.activeRoomId) {
        get().setActiveRoom(defaultRoom.id);
      }

      console.log('[RoomStore] 已为网关创建默认房间:', targetGatewayId, defaultRoom);
    }
  },
}));

// 向后兼容：提供一个获取 messages 对象的 getter
// 注意：这返回一个新对象，不要频繁调用
export function getMessagesAsRecord(store: RoomStore): Record<string, Message[]> {
  const result: Record<string, Message[]> = {};
  for (const [roomId, roomMsgs] of Object.entries(store._roomMessages)) {
    result[roomId] = roomMsgs.ids.map(id => roomMsgs.byId.get(id)!).filter(Boolean);
  }
  return result;
}
