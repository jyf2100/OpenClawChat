import { create } from "zustand";
import { Room, Message } from "../types";
import { roomStorage, messageStorage } from "../lib/storage";

interface RoomStore {
  rooms: Room[];
  activeRoomId: string | null;
  messages: Record<string, Message[]>;
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
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
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

      // 恢复“幽灵”房间（有消息但没房间记录）
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

      set({
        rooms: migratedRooms,
        activeRoomId: nextActiveRoomId,
        messages: allMessages,
        _initialized: true,
      });

      console.log('[RoomStore] 已加载房间配置:', migratedRooms);
      console.log('[RoomStore] 已加载消息历史:', Object.keys(allMessages).length, '个房间');
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
    set((state) => ({
      messages: {
        ...state.messages,
        [roomId]: [...(state.messages[roomId] || []), message],
      },
    }));

    try {
      await messageStorage.addMessage(roomId, message);
    } catch (error) {
      console.error('[RoomStore] 保存消息失败:', error);
    }
  },

  updateMessage: async (roomId, messageId, message) => {
    set((state) => {
      const roomMessages = state.messages[roomId] || [];
      const index = roomMessages.findIndex((m) => m.id === messageId);
      if (index === -1) {
        // 消息不存在，添加新消息
        return {
          messages: {
            ...state.messages,
            [roomId]: [...roomMessages, message],
          },
        };
      }
      // 替换现有消息
      const newMessages = [...roomMessages];
      newMessages[index] = message;
      return {
        messages: {
          ...state.messages,
          [roomId]: newMessages,
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
      const roomMessages = state.messages[roomId] || [];
      const newMessages = roomMessages.filter((m) => m.id !== messageId);
      console.log(`[RoomStore] 删除结果: ${roomMessages.length} -> ${newMessages.length}`);
      return {
        messages: {
          ...state.messages,
          [roomId]: newMessages,
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
      const roomMessages = state.messages[roomId] || [];
      const idSet = new Set(messageIds);
      const newMessages = roomMessages.filter((m) => !idSet.has(m.id));
      console.log(`[RoomStore] 批量删除结果: ${roomMessages.length} -> ${newMessages.length}`);
      return {
        messages: {
          ...state.messages,
          [roomId]: newMessages,
        },
      };
    });

    try {
      await messageStorage.deleteMessages(roomId, messageIds);
    } catch (error) {
      console.error('[RoomStore] 批量删除消息失败:', error);
    }
  },

  getMessages: (roomId) => get().messages[roomId] || [],

  clearMessages: async (roomId) => {
    set((state) => {
      const newMessages = { ...state.messages };
      delete newMessages[roomId];
      return { messages: newMessages };
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
