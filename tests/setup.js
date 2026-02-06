// tests/setup.js
// Jest 测试环境设置文件

// 模拟全局 window.Storage
global.Storage = {
  saveSession: jest.fn(),
  getSessions: jest.fn().mockReturnValue({}),
  getActiveSession: jest.fn().mockReturnValue(null),
  setActiveSession: jest.fn(),
  deleteSession: jest.fn()
};

// 模拟 console 方法
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn()
};
