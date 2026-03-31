import { logger } from './logger';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI__);
}

async function invokeDb<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export const dbBridge = {
  isAvailable(): boolean {
    return isTauriRuntime();
  },

  async listTemplates<T = any[]>(): Promise<T> {
    return invokeDb<T>('db_list_templates');
  },

  async upsertTemplate(id: string, payload: unknown): Promise<void> {
    await invokeDb('db_upsert_template', { id, payload });
  },

  async deleteTemplate(id: string): Promise<void> {
    await invokeDb('db_delete_template', { id });
  },

  async listGateways<T = any[]>(): Promise<T> {
    return invokeDb<T>('db_list_gateways');
  },

  async upsertGateway(id: string, payload: unknown): Promise<void> {
    await invokeDb('db_upsert_gateway', { id, payload });
  },

  async deleteGateway(id: string): Promise<void> {
    await invokeDb('db_delete_gateway', { id });
  },

  async getAgentConfig<T = any>(gatewayId: string, agentId: string): Promise<T | null> {
    return invokeDb<T | null>('db_get_agent_config', { gatewayId, agentId });
  },

  async listAgentConfigs<T = any[]>(): Promise<T> {
    return invokeDb<T>('db_list_agent_configs');
  },

  async upsertAgentConfig(gatewayId: string, agentId: string, payload: unknown): Promise<void> {
    await invokeDb('db_upsert_agent_config', { gatewayId, agentId, payload });
  },

  async deleteAgentConfig(gatewayId: string, agentId: string): Promise<void> {
    await invokeDb('db_delete_agent_config', { gatewayId, agentId });
  },

  async listRooms<T = any[]>(): Promise<T> {
    return invokeDb<T>('db_list_rooms');
  },

  async upsertRoom(id: string, payload: unknown): Promise<void> {
    await invokeDb('db_upsert_room', { id, payload });
  },

  async deleteRoom(id: string): Promise<void> {
    await invokeDb('db_delete_room', { id });
  },

  async importRoomMessages(roomId: string, messages: unknown[]): Promise<number> {
    return invokeDb<number>('db_import_room_messages', { roomId, messages });
  },

  async getRoomMessageStats<T = { roomId: string; count: number; latestTimestamp?: number | null }>(
    roomId: string,
  ): Promise<T> {
    return invokeDb<T>('db_get_room_message_stats', { roomId });
  },
};

export async function runDbMirror(label: string, task: () => Promise<void>): Promise<void> {
  if (!dbBridge.isAvailable()) {
    return;
  }

  try {
    await task();
  } catch (error) {
    logger.warn('dbBridge', `${label} mirror failed`, error);
  }
}
