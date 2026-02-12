# CreateRoomModal 组件实现说明

## 概述

`CreateRoomModal` 是一个 Discord 风格的房间创建/编辑模态框组件，完全使用 TypeScript 编写，遵循项目的设计规范。

## 文件位置

- **组件文件**: `/Volumes/work/workspace/clawchat/.worktrees/tauri-desktop/src/components/room/CreateRoomModal.tsx`
- **导出文件**: 已更新 `/Volumes/work/workspace/clawchat/.worktrees/tauri-desktop/src/components/room/index.ts`
- **示例文件**: `/Volumes/work/workspace/clawchat/.worktrees/tauri-desktop/src/components/room/CreateRoomModal.example.tsx`

## 功能特性

### 1. 组件接口

```typescript
interface CreateRoomModalProps {
  show: boolean;                    // 控制模态框显示/隐藏
  onClose: () => void;              // 关闭回调
  room?: Room;                      // 可选，传入则为编辑模式
  onCreate: (room: Omit<Room, 'id' | 'unreadCount'>) => void;  // 创建回调
  onUpdate?: (id: string, room: Partial<Room>) => void;        // 更新回调
}
```

### 2. 表单字段

- **房间名称** (必填)
  - 最多 50 个字符
  - 至少 2 个字符
  - 实时字符计数
  - 验证错误提示

- **房间类型** (必填)
  - 频道 (channel) - 📢
  - 私聊 (private) - 💬
  - 群组 (group) - 👥
  - 单选按钮组，带图标和选中状态

- **描述** (可选)
  - 最多 200 个字符
  - 多行文本框
  - 实时字符计数

### 3. 样式特点

- **Discord 风格设计**
  - 遮罩层：半透明黑色背景 (rgba(0, 0, 0, 0.85))
  - 内容区：浮动卡片，圆角 8px
  - 输入框：使用 `var(--bg-input)` 背景
  - 主按钮：使用 `var(--accent)` 颜色
  - 取消按钮：透明背景

- **动画效果**
  - 淡入动画 (fadeIn)
  - 滑入动画 (slideUp)
  - 平滑过渡效果

- **响应式设计**
  - 移动设备适配
  - 最大高度限制 (90vh)
  - 内容溢出滚动

### 4. 交互功能

- **关闭方式**
  - 点击遮罩层关闭
  - ESC 键关闭
  - 点击关闭按钮

- **表单验证**
  - 实时验证
  - 提交前验证
  - 错误提示显示

- **状态管理**
  - 加载状态 (isSubmitting)
  - 编辑/创建模式自动切换
  - 表单数据自动填充（编辑模式）

## 使用方法

### 基础用法

```tsx
import React, { useState } from 'react';
import { CreateRoomModal } from './components/room';
import { useRoomStore } from './stores/roomStore';
import { nanoid } from 'nanoid';

function MyComponent() {
  const [showModal, setShowModal] = useState(false);
  const { addRoom } = useRoomStore();

  return (
    <>
      <button onClick={() => setShowModal(true)}>创建房间</button>

      <CreateRoomModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onCreate={(roomData) => {
          addRoom({
            ...roomData,
            id: nanoid(),
            unreadCount: 0,
          });
        }}
      />
    </>
  );
}
```

### 编辑模式

```tsx
function EditExample() {
  const [showModal, setShowModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room>();
  const { updateRoom } = useRoomStore();

  const handleEdit = (room: Room) => {
    setEditingRoom(room);
    setShowModal(true);
  };

  return (
    <CreateRoomModal
      show={showModal}
      onClose={() => {
        setShowModal(false);
        setEditingRoom(undefined);
      }}
      room={editingRoom}
      onUpdate={(id, data) => updateRoom(id, data)}
    />
  );
}
```

## 需要的 Store 更新

为了完整支持编辑功能，需要在 `roomStore.ts` 中添加 `updateRoom` 方法：

```typescript
interface RoomStore {
  // ... 现有属性
  updateRoom: (id: string, room: Partial<Room>) => void;
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  // ... 现有代码

  updateRoom: (id, roomData) =>
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === id ? { ...r, ...roomData } : r
      ),
    })),
}));
```

## CSS 变量依赖

组件使用项目定义的 CSS 变量（在 `src/styles/globals.css` 中）：

- `--bg-floating`: 浮动层背景色
- `--bg-input`: 输入框背景色
- `--bg-secondary`: 次要背景色
- `--bg-primary`: 主要背景色
- `--bg-tertiary`: 第三级背景色
- `--text-normal`: 正常文本颜色
- `--text-muted`: 次要文本颜色
- `--accent`: 强调色
- `--accent-hover`: 强调色悬停状态
- `--danger`: 危险/错误颜色
- `--border`: 边框颜色

## 可访问性

- 使用语义化 HTML
- `role="dialog"` 和 `aria-modal="true"` 属性
- `aria-labelledby` 关联标题
- 键盘导航支持 (ESC 关闭)
- 焦点管理

## 浏览器兼容性

- 现代浏览器 (Chrome, Firefox, Safari, Edge)
- 使用标准 CSS 特性
- 无外部依赖

## 注意事项

1. **不影响现有功能**: 这是全新的组件，不会修改现有代码
2. **遵循设计规范**: 使用 Discord 风格和项目 CSS 变量
3. **类型安全**: 完整的 TypeScript 类型定义
4. **性能优化**: 使用 `useCallback` 避免不必要的重渲染
