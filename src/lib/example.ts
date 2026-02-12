/**
 * 存储功能使用示例
 */

import {
  gatewayStorage,
  roomStorage,
  settingsStorage,
  messageStorage,
  exportData,
  importData,
} from './storage';
import type { GatewayConfig, Room, Message } from '../types';
import { GatewayStatus, MessageType } from '../types';

/**
 * 示例 1: 网关管理
 */
export async function exampleGatewayManagement() {
  console.log('=== 网关管理示例 ===');

  const newGateway: GatewayConfig = {
    id: 'gw-1',
    name: '本地 OpenClaw',
    url: 'ws://127.0.0.1:18789',
    status: GatewayStatus.Connected,
    autoConnect: true,
  };

  await gatewayStorage.addGateway(newGateway);
  console.log('✓ 网关已保存');

  const gateways = await gatewayStorage.loadGateways();
  console.log('✓ 当前网关列表:', gateways);

  await gatewayStorage.updateGateway('gw-1', { name: '更新的名称' });
  console.log('✓ 网关已更新');
}

/**
 * 示例 2: 房间管理
 */
export async function exampleRoomManagement() {
  console.log('=== 房间管理示例 ===');

  const newRoom: Room = {
    id: 'room-1',
    gatewayId: 'gw-1',
    name: 'AI 对话室',
    type: 'channel',
    unreadCount: 0,
  };

  await roomStorage.saveRoom(newRoom);
  console.log('✓ 房间已保存');

  const rooms = await roomStorage.loadRooms();
  console.log('✓ 房间列表:', rooms);

  await roomStorage.saveActiveSession('room-1');
  console.log('✓ 活跃会话已设置');
}

/**
 * 示例 3: 设置管理
 */
export async function exampleSettingsManagement() {
  console.log('=== 设置管理示例 ===');

  const settings = await settingsStorage.loadSettings();
  console.log('✓ 当前设置:', settings);

  const updated = await settingsStorage.updateSettings({
    theme: 'dark',
  });
  console.log('✓ 设置已更新:', updated);
}

/**
 * 示例 4: 消息存储
 */
export async function exampleMessageStorage() {
  console.log('=== 消息存储示例 ===');

  const newMessage: Message = {
    id: 'msg-1',
    gatewayId: 'gw-1',
    roomId: 'room-1',
    type: MessageType.Text,
    content: '你好！',
    timestamp: Date.now(),
  };

  await messageStorage.addMessage('room-1', newMessage);
  console.log('✓ 消息已添加');

  const messages = await messageStorage.loadMessages('room-1');
  console.log('✓ 房间消息:', messages);

  await messageStorage.limitMessages('room-1', 50);
  console.log('✓ 消息数量已限制');
}

/**
 * 示例 5: 数据备份和恢复
 */
export async function exampleBackupAndRestore() {
  console.log('=== 备份和恢复示例 ===');

  const backup = await exportData();
  console.log('✓ 数据已导出');

  await importData(backup);
  console.log('✓ 数据已恢复');
}

/**
 * 运行所有示例
 */
export async function runAllExamples() {
  try {
    await exampleGatewayManagement();
    await exampleRoomManagement();
    await exampleSettingsManagement();
    await exampleMessageStorage();
    await exampleBackupAndRestore();
    console.log('✅ 所有示例执行完成');
  } catch (error) {
    console.error('❌ 示例执行失败:', error);
  }
}

// 浏览器环境导出
if (typeof window !== 'undefined') {
  (window as any).storageExamples = {
    runAll: runAllExamples,
    gateways: exampleGatewayManagement,
    rooms: exampleRoomManagement,
    settings: exampleSettingsManagement,
    messages: exampleMessageStorage,
    backup: exampleBackupAndRestore,
  };
  console.log('💡 存储示例已加载到 window.storageExamples');
}
