// tests/js/integration/room-management.integration.test.js
// 房间管理集成测试

// 导入源码模块
import '../../../src/js/sessionManager.js';
import '../../../src/js/connectionManager.js';
import '../../../src/js/ui.js';

describe('Room Management Integration', () => {
  let sessionManager;
  let connectionManager;
  let mockStorage;

  beforeEach(() => {
    // Mock Storage
    mockStorage = {
      saveSession: jest.fn(),
      getSessions: jest.fn().mockReturnValue({}),
      getActiveSession: jest.fn().mockReturnValue(null),
      setActiveSession: jest.fn(),
      deleteSession: jest.fn()
    };

    global.Storage = mockStorage;

    // 设置 DOM 环境
    document.body.innerHTML = `
      <div id="connList"></div>
      <div id="roomList"></div>
      <div id="roomStatusBar" style="display: none;">
        <span id="participantsCount">0</span>
      </div>
      <div id="currentConnTitle"></div>
    `;

    // 初始化全局状态
    window.state = {
      isInRoomMode: false,
      currentSessionId: null,
      currentRoomId: null
    };

    // 创建管理器实例
    sessionManager = new window.SessionManager();
    connectionManager = new window.ConnectionManager();

    // 设置依赖注入
    sessionManager.setConnectionManager(connectionManager);

    // 导出到全局（UIManager 依赖）
    window.sessionManager = sessionManager;
    window.connectionManager = connectionManager;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should create and switch rooms without memory leaks', async () => {
    // 创建多个连接
    const conn1 = connectionManager.addConnection({
      id: 'conn-1',
      name: 'AI 1',
      gatewayUrl: 'ws://localhost:8080',
      sessionKey: 'agent:gpt-4:default'
    });

    const conn2 = connectionManager.addConnection({
      id: 'conn-2',
      name: 'AI 2',
      gatewayUrl: 'ws://localhost:8080',
      sessionKey: 'agent:claude:main'
    });

    // 创建多个房间（添加延迟确保时间戳不同）
    const rooms = [];
    for (let i = 0; i < 10; i++) {
      const room = sessionManager.createSession('room', {
        name: `TestRoom${i}`,  // 使用驼峰命名避免重复
        participantIds: i % 2 === 0 ? ['conn-1', 'conn-2'] : ['conn-1']
      });
      rooms.push(room);
      // 添加小延迟确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 2));
    }

    // 验证房间创建
    const allRooms = sessionManager.getAllRooms();
    expect(allRooms.length).toBeGreaterThanOrEqual(10);

    // 验证最后一个房间的参与者
    const lastRoom = allRooms[allRooms.length - 1];
    const lastRoomIndex = parseInt(lastRoom.name.replace('TestRoom', ''));
    expect(lastRoom.participants.length).toBe(lastRoomIndex % 2 === 0 ? 2 : 1);

    // 渲染房间列表（使用 UIManager）
    window.UIManager.renderRoomList();

    // 检查 DOM 元素数量
    const roomItems = document.querySelectorAll('.room-item');
    expect(roomItems).toHaveLength(10);

    // 检查房间内容
    const firstRoomName = document.querySelector('.room-item .room-name');
    expect(firstRoomName.textContent).toBe('TestRoom0');

    const firstRoomCount = document.querySelector('.room-item .participant-count');
    expect(firstRoomCount.textContent).toBe('(2)');

    // 多次重新渲染（模拟内存泄漏场景）
    for (let i = 0; i < 100; i++) {
      window.UIManager.renderRoomList();
    }

    // 验证 DOM 元素数量没有无限增长
    const roomItemsAfter = document.querySelectorAll('.room-item');
    expect(roomItemsAfter).toHaveLength(10);

    // 验证事件监听器没有重复绑定
    // 在 Jest 中，我们通过检查元素是否正确工作来间接验证
    // 实际的内存泄漏检测需要在浏览器中进行
    const firstRoomItem = document.querySelector('.room-item');
    expect(firstRoomItem).toBeTruthy();

    // 切换房间
    sessionManager.switchRoom(rooms[0].id);
    expect(sessionManager.activeRoomId).toBe(rooms[0].id);

    // 删除房间
    sessionManager.deleteSession(rooms[0].id);
    expect(sessionManager.getAllRooms()).toHaveLength(9);
  });

  test('should handle invalid sessionKey gracefully', () => {
    // 创建一个带有有效 sessionKey 的连接
    const validConn = connectionManager.addConnection({
      id: 'valid-conn',
      name: 'Valid AI',
      gatewayUrl: 'ws://localhost:8080',
      sessionKey: 'agent:gpt-4:default'
    });

    // 创建房间
    const room = sessionManager.createSession('room', {
      name: 'Test Room',
      participantIds: []
    });

    // 尝试添加不存在的连接
    const result1 = sessionManager.addParticipantToRoom(room.id, 'invalid-conn');
    expect(result1).toBe(false);
    expect(room.participants).toHaveLength(0);

    // 添加有效连接
    const result2 = sessionManager.addParticipantToRoom(room.id, 'valid-conn');
    expect(result2).toBe(true);
    expect(room.participants).toHaveLength(1);
    expect(room.participants[0].agentId).toBe('gpt-4');

    // 验证不会重复添加
    const result3 = sessionManager.addParticipantToRoom(room.id, 'valid-conn');
    expect(result3).toBe(false);
    expect(room.participants).toHaveLength(1);
  });

  test('should handle malformed sessionKey gracefully', () => {
    const testCases = [
      { sessionKey: null, desc: 'null sessionKey' },
      { sessionKey: undefined, desc: 'undefined sessionKey' },
      { sessionKey: '', desc: 'empty string sessionKey' },
      { sessionKey: 'no-colon', desc: 'sessionKey without colon' },
      { sessionKey: 'agent:', desc: 'sessionKey with only prefix' },
      { sessionKey: 12345, desc: 'numeric sessionKey' }
    ];

    testCases.forEach(({ sessionKey, desc }) => {
      // 为每个测试用例创建新房间
      const room = sessionManager.createSession('room', {
        name: `Test Room ${desc}`,
        participantIds: []
      });

      // 创建带有无效 sessionKey 的连接
      const conn = connectionManager.addConnection({
        id: `conn-${desc}`,
        name: `Invalid AI ${desc}`,
        gatewayUrl: 'ws://localhost:8080',
        sessionKey: sessionKey
      });

      // 尝试添加到房间
      const result = sessionManager.addParticipantToRoom(room.id, conn.id);
      expect(result).toBe(false);
      expect(room.participants).toHaveLength(0);
    });
  });

  test('should handle room switching correctly', () => {
    // 创建连接
    connectionManager.addConnection({
      id: 'conn-1',
      name: 'AI 1',
      gatewayUrl: 'ws://localhost:8080',
      sessionKey: 'agent:gpt-4:default'
    });

    // 创建多个房间
    const room1 = sessionManager.createSession('room', {
      name: 'RoomSwitch1',
      participantIds: ['conn-1']
    });

    const room2 = sessionManager.createSession('room', {
      name: 'RoomSwitch2',
      participantIds: ['conn-1']
    });

    // 初始状态
    expect(sessionManager.activeRoomId).toBeNull();

    // 切换到第一个房间
    sessionManager.switchRoom(room1.id);
    expect(sessionManager.activeRoomId).toBe(room1.id);
    expect(mockStorage.setActiveSession).toHaveBeenCalledWith(room1.id);

    // 切换到第二个房间
    sessionManager.switchRoom(room2.id);
    expect(sessionManager.activeRoomId).toBe(room2.id);

    // 删除活跃房间应该切换到另一个房间
    sessionManager.deleteSession(room2.id);
    // 删除后活跃房间应该是 room1 或者 null（取决于实现）
    expect(sessionManager.activeRoomId).not.toBe(room2.id);
  });

  test('should handle participant removal correctly', () => {
    // 创建连接
    const conn1 = connectionManager.addConnection({
      id: 'conn-1',
      name: 'AI 1',
      gatewayUrl: 'ws://localhost:8080',
      sessionKey: 'agent:gpt-4:default'
    });

    const conn2 = connectionManager.addConnection({
      id: 'conn-2',
      name: 'AI 2',
      gatewayUrl: 'ws://localhost:8080',
      sessionKey: 'agent:claude:main'
    });

    // 创建房间
    const room = sessionManager.createSession('room', {
      name: 'Test Room',
      participantIds: ['conn-1', 'conn-2']
    });

    expect(room.participants).toHaveLength(2);

    // 移除一个参与者
    const result = sessionManager.removeParticipantFromRoom(room.id, 'conn-1');
    expect(result).toBe(true);
    expect(room.participants).toHaveLength(1);
    expect(room.participants[0].connId).toBe('conn-2');

    // 移除不存在的参与者
    const result2 = sessionManager.removeParticipantFromRoom(room.id, 'conn-3');
    expect(result2).toBe(false);
    expect(room.participants).toHaveLength(1);
  });

  test('should handle room name normalization', () => {
    const testCases = [
      { input: 'Test Room', expected: 'test-room' },
      { input: 'Room:With:Colons', expected: 'room-with-colons' },
      { input: 'Room With   Spaces', expected: 'room-with-spaces' },
      { input: 'Room/With\\Slashes', expected: 'room-with-slashes' },
      { input: 'UPPERCASE ROOM', expected: 'uppercase-room' }
    ];

    testCases.forEach(({ input, expected }) => {
      const normalized = sessionManager.normalizeRoomName(input);
      expect(normalized).toBe(expected);
    });
  });

  test('should generate correct dynamic session keys', () => {
    const agentId = 'gpt-4';
    const roomName = 'Test Room';
    const timestamp = 1234567890;

    const dynamicKey = sessionManager.generateDynamicSessionKey(agentId, roomName, timestamp);
    expect(dynamicKey).toBe('agent:gpt-4:client:room:test-room:1234567890');
  });

  test('should handle room deletion correctly', async () => {
    // 创建连接
    const conn1 = connectionManager.addConnection({
      id: 'conn-1',
      name: 'AI 1',
      gatewayUrl: 'ws://localhost:8080',
      sessionKey: 'agent:gpt-4:default'
    });

    // 创建房间（添加延迟确保时间戳不同）
    const room1 = sessionManager.createSession('room', {
      name: 'RoomDelete1',
      participantIds: ['conn-1']
    });

    await new Promise(resolve => setTimeout(resolve, 2));

    const room2 = sessionManager.createSession('room', {
      name: 'RoomDelete2',
      participantIds: []
    });

    const allRooms = sessionManager.getAllRooms();
    expect(allRooms.length).toBeGreaterThanOrEqual(2);

    // 切换到 room1
    sessionManager.switchRoom(room1.id);
    expect(sessionManager.activeRoomId).toBe(room1.id);

    // 删除 room1
    const result = sessionManager.deleteSession(room1.id);
    expect(result).toBe(true);

    // 房间数量应该减少
    const remainingRooms = sessionManager.getAllRooms();
    expect(remainingRooms.length).toBeLessThan(allRooms.length);

    // 活跃房间应该不再是被删除的房间
    expect(sessionManager.activeRoomId).not.toBe(room1.id);

    // 删除不存在的房间
    const result2 = sessionManager.deleteSession('non-existent');
    expect(result2).toBe(false);
  });

  test('should handle empty room list in UI', () => {
    // 初始状态没有房间
    expect(sessionManager.getAllRooms()).toHaveLength(0);

    // 渲染空房间列表
    window.UIManager.renderRoomList();

    const roomContainer = document.getElementById('roomList');
    expect(roomContainer.innerHTML).toContain('暂无房间');
  });
});
