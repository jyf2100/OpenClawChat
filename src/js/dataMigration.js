// src/js/dataMigration.js
const DataMigration = {
  VERSION: 2,

  needsMigration() {
    const currentVersion = localStorage.getItem('roclaw.migration.version');
    return !currentVersion || parseInt(currentVersion) < this.VERSION;
  },

  migrate() {
    console.log('[Migration] Starting migration to version', this.VERSION);

    const sessions = {};

    // 迁移连接数据将在 Task 2 中实现
    // 迁移房间数据将在 Task 3 中实现

    localStorage.setItem('roclaw.migration.version', this.VERSION);
    console.log('[Migration] Migration completed');
  }
};

window.DataMigration = DataMigration;
