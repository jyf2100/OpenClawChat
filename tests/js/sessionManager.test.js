// tests/js/sessionManager.test.js
describe('SessionManager - _addParticipantToSession', () => {
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

    window.Storage = mockStorage;

    window.connectionManager = {
      getConnection: jest.fn()
    };

    // Create SessionManager instance
    sessionManager = new SessionManager();
    sessionManager.setConnectionManager(window.connectionManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should return false if connection not found', () => {
    window.connectionManager.getConnection.mockReturnValue(null);

    const session = { participants: [], normalizedRoomName: 'test' };
    const result = sessionManager._addParticipantToSession(session, 'invalid-id');

    expect(result).toBe(false);
    expect(session.participants).toHaveLength(0);
    expect(window.connectionManager.getConnection).toHaveBeenCalledWith('invalid-id');
  });

  test('should return false if sessionKey is null', () => {
    window.connectionManager.getConnection.mockReturnValue({
      id: 'conn-1',
      name: 'Test AI',
      sessionKey: null
    });

    const session = { participants: [], normalizedRoomName: 'test' };
    const result = sessionManager._addParticipantToSession(session, 'conn-1');

    expect(result).toBe(false);
    expect(session.participants).toHaveLength(0);
  });

  test('should return false if sessionKey is undefined', () => {
    window.connectionManager.getConnection.mockReturnValue({
      id: 'conn-1',
      name: 'Test AI',
      sessionKey: undefined
    });

    const session = { participants: [], normalizedRoomName: 'test' };
    const result = sessionManager._addParticipantToSession(session, 'conn-1');

    expect(result).toBe(false);
    expect(session.participants).toHaveLength(0);
  });

  test('should return false if sessionKey is not a string', () => {
    window.connectionManager.getConnection.mockReturnValue({
      id: 'conn-1',
      name: 'Test AI',
      sessionKey: 12345
    });

    const session = { participants: [], normalizedRoomName: 'test' };
    const result = sessionManager._addParticipantToSession(session, 'conn-1');

    expect(result).toBe(false);
    expect(session.participants).toHaveLength(0);
  });

  test('should return false if sessionKey is malformed (no colon)', () => {
    window.connectionManager.getConnection.mockReturnValue({
      id: 'conn-1',
      name: 'Test AI',
      sessionKey: 'invalid-format'
    });

    const session = { participants: [], normalizedRoomName: 'test' };
    const result = sessionManager._addParticipantToSession(session, 'conn-1');

    expect(result).toBe(false);
    expect(session.participants).toHaveLength(0);
  });

  test('should return false if sessionKey is malformed (only one part)', () => {
    window.connectionManager.getConnection.mockReturnValue({
      id: 'conn-1',
      name: 'Test AI',
      sessionKey: 'agent:'
    });

    const session = { participants: [], normalizedRoomName: 'test' };
    const result = sessionManager._addParticipantToSession(session, 'conn-1');

    expect(result).toBe(false);
    expect(session.participants).toHaveLength(0);
  });

  test('should add participant with valid sessionKey (agent:main:main format)', () => {
    window.connectionManager.getConnection.mockReturnValue({
      id: 'conn-1',
      name: 'Test AI',
      sessionKey: 'agent:main:main'
    });

    const session = { participants: [], normalizedRoomName: 'test-room' };
    const result = sessionManager._addParticipantToSession(session, 'conn-1');

    expect(result).toBe(true);
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0].agentId).toBe('main');
    expect(session.participants[0].connId).toBe('conn-1');
    expect(session.participants[0].name).toBe('Test AI');
    expect(session.participants[0].sessionKey).toBe('agent:main:main');
    expect(mockStorage.saveSession).toHaveBeenCalledWith(session);
  });

  test('should add participant with valid sessionKey (agent:gpt-4:default format)', () => {
    window.connectionManager.getConnection.mockReturnValue({
      id: 'conn-2',
      name: 'GPT-4',
      sessionKey: 'agent:gpt-4:default'
    });

    const session = { participants: [], normalizedRoomName: 'ai-room' };
    const result = sessionManager._addParticipantToSession(session, 'conn-2');

    expect(result).toBe(true);
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0].agentId).toBe('gpt-4');
  });

  test('should not add duplicate participant', () => {
    const existingParticipant = {
      connId: 'conn-1',
      agentId: 'main',
      sessionKey: 'agent:main:main',
      dynamicKey: 'agent:main:client:room:test-room:1234567890',
      name: 'Test AI'
    };

    window.connectionManager.getConnection.mockReturnValue({
      id: 'conn-1',
      name: 'Test AI',
      sessionKey: 'agent:main:main'
    });

    const session = {
      participants: [existingParticipant],
      normalizedRoomName: 'test-room'
    };

    const result = sessionManager._addParticipantToSession(session, 'conn-1');

    expect(result).toBe(false);
    expect(session.participants).toHaveLength(1);
    expect(mockStorage.saveSession).not.toHaveBeenCalled();
  });

  test('should add multiple participants to same session', () => {
    window.connectionManager.getConnection.mockImplementation((connId) => {
      if (connId === 'conn-1') {
        return {
          id: 'conn-1',
          name: 'AI 1',
          sessionKey: 'agent:main:main'
        };
      } else if (connId === 'conn-2') {
        return {
          id: 'conn-2',
          name: 'AI 2',
          sessionKey: 'agent:gpt-4:default'
        };
      }
      return null;
    });

    const session = { participants: [], normalizedRoomName: 'test-room' };

    const result1 = sessionManager._addParticipantToSession(session, 'conn-1');
    const result2 = sessionManager._addParticipantToSession(session, 'conn-2');

    expect(result1).toBe(true);
    expect(result2).toBe(true);
    expect(session.participants).toHaveLength(2);
    expect(session.participants[0].agentId).toBe('main');
    expect(session.participants[1].agentId).toBe('gpt-4');
  });

  test('should handle empty string sessionKey', () => {
    window.connectionManager.getConnection.mockReturnValue({
      id: 'conn-1',
      name: 'Test AI',
      sessionKey: ''
    });

    const session = { participants: [], normalizedRoomName: 'test' };
    const result = sessionManager._addParticipantToSession(session, 'conn-1');

    expect(result).toBe(false);
    expect(session.participants).toHaveLength(0);
  });
});
