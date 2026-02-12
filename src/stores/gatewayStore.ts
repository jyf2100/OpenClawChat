import { create } from "zustand";
import { GatewayConfig, GatewayStatus } from "../types";
import { gatewayStorage } from "../lib/storage";

// 当前选中网关的存储键
const ACTIVE_GATEWAY_KEY = 'clawchat.activeGateway';

interface GatewayStore {
  gateways: GatewayConfig[];
  activeGatewayId: string | null;
  _initialized: boolean;

  // Actions
  init: () => Promise<void>;
  addGateway: (gateway: GatewayConfig) => Promise<void>;
  removeGateway: (id: string) => Promise<void>;
  updateGateway: (id: string, updates: Partial<GatewayConfig>) => Promise<void>;
  setActiveGateway: (id: string | null) => Promise<void>;
  getGateway: (id: string) => GatewayConfig | undefined;
  connectGateway: (id: string) => Promise<void>;
  disconnectGateway: (id: string) => Promise<void>;
}

export const useGatewayStore = create<GatewayStore>((set, get) => ({
  gateways: [],
  activeGatewayId: null,
  _initialized: false,

  // 初始化：从存储加载数据
  init: async () => {
    if (get()._initialized) return;

    try {
      const [gateways, activeGatewayId] = await Promise.all([
        gatewayStorage.loadGateways(),
        Promise.resolve(localStorage.getItem(ACTIVE_GATEWAY_KEY)),
      ]);

      let nextGateways = gateways;
      if (nextGateways.length === 0) {
        const defaultGateway: GatewayConfig = {
          id: 'default',
          name: '本地网关',
          url: 'ws://127.0.0.1:18789',
          token: '',
          status: GatewayStatus.Disconnected,
          autoConnect: true,
        };
        nextGateways = [defaultGateway];
        await gatewayStorage.saveGateways(nextGateways);
      }

      const nextActiveGatewayId = activeGatewayId || nextGateways[0]?.id || null;
      if (nextActiveGatewayId) {
        localStorage.setItem(ACTIVE_GATEWAY_KEY, nextActiveGatewayId);
      }

      set({
        gateways: nextGateways,
        activeGatewayId: nextActiveGatewayId,
        _initialized: true,
      });

      console.log('[GatewayStore] 已加载网关配置:', nextGateways);
    } catch (error) {
      console.error('[GatewayStore] 初始化失败:', error);
      set({ _initialized: true });
    }
  },

  addGateway: async (gateway) => {
    set((state) => ({
      gateways: [...state.gateways, gateway],
    }));

    try {
      await gatewayStorage.addGateway(gateway);
      console.log('[GatewayStore] 已保存网关:', gateway);
    } catch (error) {
      console.error('[GatewayStore] 保存网关失败:', error);
    }
  },

  removeGateway: async (id) => {
    const state = get();
    const isActive = state.activeGatewayId === id;
    const remainingGateways = state.gateways.filter((g) => g.id !== id);

    // 如果删除的是当前激活的网关，自动选择剩下的第一个
    const newActiveId = isActive && remainingGateways.length > 0
      ? remainingGateways[0].id
      : isActive
        ? null
        : state.activeGatewayId;

    set(() => ({
      gateways: remainingGateways,
      activeGatewayId: newActiveId,
    }));

    // 更新 localStorage 中的 activeGatewayId
    try {
      if (newActiveId) {
        localStorage.setItem(ACTIVE_GATEWAY_KEY, newActiveId);
      } else {
        localStorage.removeItem(ACTIVE_GATEWAY_KEY);
      }
    } catch (e) {
      // 忽略 localStorage 错误
    }

    try {
      await gatewayStorage.removeGateway(id);
      console.log('[GatewayStore] 已删除网关:', id);
    } catch (error) {
      console.error('[GatewayStore] 删除网关失败:', error);
    }
  },

  updateGateway: async (id, updates) => {
    set((state) => ({
      gateways: state.gateways.map((g) =>
        g.id === id ? { ...g, ...updates } : g
      ),
    }));

    try {
      await gatewayStorage.updateGateway(id, updates);
      console.log('[GatewayStore] 已更新网关:', id, updates);
    } catch (error) {
      console.error('[GatewayStore] 更新网关失败:', error);
    }
  },

  setActiveGateway: async (id) => {
    set({ activeGatewayId: id });

    try {
      if (id) {
        localStorage.setItem(ACTIVE_GATEWAY_KEY, id);
      } else {
        localStorage.removeItem(ACTIVE_GATEWAY_KEY);
      }
    } catch (error) {
      console.error('[GatewayStore] 保存当前网关失败:', error);
    }
  },

  getGateway: (id) => get().gateways.find((g) => g.id === id),

  connectGateway: async (id) => {
    set((state) => ({
      gateways: state.gateways.map((g) =>
        g.id === id ? { ...g, status: GatewayStatus.Connecting } : g
      ),
    }));
    // TODO: 实现连接逻辑，调用 Tauri 命令
  },

  disconnectGateway: async (id) => {
    set((state) => ({
      gateways: state.gateways.map((g) =>
        g.id === id ? { ...g, status: GatewayStatus.Disconnected } : g
      ),
    }));
    // TODO: 实现断开连接逻辑
  },
}));
