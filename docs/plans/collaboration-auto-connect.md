# 协作房间自动连接所有参与Agent功能

## 需求

点击协作者房间名时自动连接所有参与的agent。

## 当前实现

在 `src/App.tsx` 的 `handleRoomSelect` 函数中，协作房间的处理逻辑是直接跳过网关连接：

```tsx
const room = rooms.find(r => r.id === roomId);
if (room?.roomType !== 'collaboration') {
  // 只有非协作房间才连接网关
  // ...
}
setActiveRoom(roomId);
```

协作房间的 agent 连接是在**发送消息时**按需建立的（在 `useCollaboration.ts` 的 `processNextStep` 中）。

## 实现方案

在 `handleRoomSelect` 函数中添加协作房间的自动连接逻辑：

1. 检测到协作房间时，遍历所有参与者
2. 对每个参与者，检查其 `gatewayId` 对应的网关状态
3. 如果未连接，找到对应的 gateway 配置，然后调用 `connect` 方法

### 代码修改

**文件**: `src/App.tsx`

```tsx
const handleRoomSelect = async (roomId: string) => {
  console.log('[App] 选择房间:', roomId);

  const room = rooms.find(r => r.id === roomId);

  if (room?.roomType === 'collaboration') {
    // 协作房间：连接所有参与者的网关
    const participants = room.collaboration?.participants || [];
    for (const participant of participants) {
      const gatewayStatus = getStatus(participant.gatewayId);
      if (gatewayStatus !== 'connected') {
        const gateway = gateways.find(g => g.id === participant.gatewayId);
        if (gateway && gateway.token) {
          console.log('[App] 协作房间 - 连接网关:', gateway.id);
          connect(gateway.url, gateway.token, participant.gatewayId);
        }
      }
    }
  } else {
    // 普通房间：连接单个网关
    // ... 现有逻辑
  }

  setActiveRoom(roomId);
};
```

## 影响分析

- **现有功能**: 不影响，只是将连接时机提前
- **用户体验**: 提升体验，进入房间时就开始连接，发送消息时无需等待

## 实施日期

2026-02-13
