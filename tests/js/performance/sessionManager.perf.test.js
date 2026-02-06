// tests/js/performance/sessionManager.perf.test.js
// 导入 SessionManager 源码（这会设置 window.SessionManager）
import '../../../src/js/sessionManager.js';

describe('SessionManager - Performance', () => {
  let sessionManager;
  let mockStorage;

  beforeEach(() => {
    // Mock setup
    mockStorage = {
      saveSession: jest.fn(),
      getSessions: jest.fn().mockReturnValue({}),
      getActiveSession: jest.fn().mockReturnValue(null),
      setActiveSession: jest.fn(),
      deleteSession: jest.fn()
    };

    global.Storage = mockStorage;

    global.window.connectionManager = {
      getConnection: jest.fn(),
      addConnection: jest.fn(),
      deleteConnection: jest.fn()
    };

    // Create SessionManager instance
    sessionManager = new global.window.SessionManager();
    sessionManager.setConnectionManager(global.window.connectionManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('getAllRooms should handle 10000 sessions efficiently', () => {
    // 创建 10000 个会话，其中 100 个是房间
    for (let i = 0; i < 10000; i++) {
      sessionManager.sessions.set(`sess-${i}`, {
        id: `sess-${i}`,
        type: i < 100 ? 'room' : 'connection',
        name: `Session ${i}`
      });
    }

    const startTime = performance.now();
    const rooms = sessionManager.getAllRooms();
    const endTime = performance.now();

    expect(rooms).toHaveLength(100);
    expect(endTime - startTime).toBeLessThan(10); // 应在 10ms 内完成
  });
});
