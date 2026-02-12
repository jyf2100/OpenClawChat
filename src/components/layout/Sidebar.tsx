import React, { useState, useEffect, useMemo } from 'react';
import { Room, Gateway } from '../../types';
import { useRoomStore } from '../../stores/roomStore';
import { CreateRoomModal } from '../room/CreateRoomModal';
import ContextMenu from '../chat/ContextMenu';

interface SidebarProps {
  gateways: Gateway[];
  rooms: Room[];
  activeGatewayId: string | null;
  activeRoomId: string | null;
  onRoomSelect: (roomId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  gateways,
  rooms,
  activeGatewayId,
  activeRoomId,
  onRoomSelect,
}) => {
  const { addRoom, updateRoom, removeRoom } = useRoomStore();
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; roomId: string | null; roomName: string }>({
    show: false,
    roomId: null,
    roomName: '',
  });

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    item: Room;
  }>({ visible: false, x: 0, y: 0, item: null as any });
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
  }>({ visible: false, x: 0, y: 0, text: '' });

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  // 预留创建房间相关功能
  void showCreateRoom;
  void setShowCreateRoom;

  const activeGateway = gateways.find(g => g.id === activeGatewayId);

  // 过滤并排序房间（置顶的在前）
  const filteredRooms = useMemo(() => {
    // 只有当有 activeGatewayId 时才显示房间
    if (!activeGatewayId) return [];

    let result = rooms.filter(room => {
      // 核心逻辑：只显示当前网关的房间
      // 旧逻辑兼容：如果 activeGatewayId 是 'default'，也显示 gatewayId='default' 的房间
      if (room.gatewayId !== activeGatewayId) return false;
      
      if (roomSearchQuery) {
        return room.name.toLowerCase().includes(roomSearchQuery.toLowerCase());
      }
      return true;
    });

    // 排序：置顶的在前，然后按 order 排序
    result.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      // 都置顶或都不置顶，按 order 排序
      const aOrder = a.order ?? 0;
      const bOrder = b.order ?? 0;
      return aOrder - bOrder;
    });

    return result;
  }, [activeGateway, rooms, roomSearchQuery]);

  // 右键菜单处理
  const handleContextMenu = (
    e: React.MouseEvent,
    item: Room
  ) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      item,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleContextAction = async (action: string) => {
    const { item } = contextMenu;

    switch (action) {
      case 'rename':
        setEditingRoomId(item.id);
        setEditingName(item.name);
        break;
      case 'delete':
        setDeleteConfirm({
          show: true,
          roomId: item.id,
          roomName: item.name,
        });
        break;
      case 'markAsRead':
        await updateRoom(item.id, { unreadCount: 0 });
        console.log('标记房间为已读:', item.id);
        break;
      case 'markAsUnread':
        await updateRoom(item.id, { unreadCount: 1 });
        console.log('标记房间为未读:', item.id);
        break;
      case 'togglePin':
        await updateRoom(item.id, { pinned: !item.pinned });
        console.log(item.pinned ? '取消置顶:' : '置顶:', item.id);
        break;
    }
    closeContextMenu();
  };

  // 工具提示处理
  const showTooltip = (x: number, y: number, text: string) => {
    setTooltip({ visible: true, x, y, text });
    setTimeout(() => {
      setTooltip(prev => ({ ...prev, visible: false }));
    }, 2000);
  };

  const handleMouseEnter = (e: React.MouseEvent, text: string) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    showTooltip(rect.left + rect.width / 2, rect.top - 8, text);
  };

  const handleMouseLeave = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  const openCreateRoomModal = () => {
    setShowCreateRoom(true);
  };

  // 实际创建房间的处理函数
  const handleCreateRoomSubmit = async (roomData: Omit<Room, 'id' | 'unreadCount'> & { id?: string }) => {
    if (!activeGatewayId) {
      console.error('[Sidebar] 创建房间失败: 没有选中的网关');
      return;
    }

    const newRoom: Room = {
      ...roomData,
      id: roomData.id || `room:${Date.now()}`,
      unreadCount: 0,
      gatewayId: activeGatewayId,
    };
    await addRoom(newRoom);
    console.log('[Sidebar] 已创建房间:', newRoom);
  };

  const handleCancelCreateRoom = () => {
    setShowCreateRoom(false);
  };

  // 处理重命名提交
  const handleRenameSubmit = async () => {
    if (editingRoomId && editingName.trim()) {
      await updateRoom(editingRoomId, { name: editingName.trim() });
      setEditingRoomId(null);
      setEditingName('');
    } else {
      setEditingRoomId(null);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setEditingRoomId(null);
      setEditingName('');
    }
  };

  // 处理删除确认
  const handleDeleteConfirm = async () => {
    if (deleteConfirm.roomId) {
      await removeRoom(deleteConfirm.roomId);
      console.log('删除房间:', deleteConfirm.roomId);
    }
    setDeleteConfirm({ show: false, roomId: null, roomName: '' });
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ show: false, roomId: null, roomName: '' });
  };

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = () => closeContextMenu();
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.visible]);

  return (
    <div className="sidebar" style={{ height: '100%', position: 'relative', display: 'flex' }}>
      {/* 房间列表 - 占满整个侧边栏 */}
      <div
        className="room-list"
        style={{
          width: '260px',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="room-header" style={{ padding: '0 20px', height: '60px' }}>
          <span style={{ fontSize: '20px', fontWeight: 800, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            RoClaw
          </span>
          <button 
            className="icon-btn add-room-btn" 
            onClick={openCreateRoomModal}
            style={{ width: '32px', height: '32px', background: 'var(--bg-primary)', borderRadius: '50%', boxShadow: 'var(--shadow-sm)' }}
          >
            +
          </button>
        </div>

        {/* 房间搜索 */}
        <div className="search-input-wrapper" style={{ padding: '0 16px 12px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="search-input"
              placeholder="搜索房间..."
              value={roomSearchQuery}
              onChange={(e) => setRoomSearchQuery(e.target.value)}
              style={{ 
                borderRadius: '20px', 
                paddingLeft: '36px',
                backgroundColor: 'var(--bg-primary)',
                border: 'none',
                boxShadow: 'var(--shadow-sm)'
              }}
            />
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', opacity: 0.7 }}
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
          {filteredRooms.map((room, index) => (
            <div
              key={room.id}
              className={`room-item ${activeRoomId === room.id ? 'active' : ''} ${index % 2 === 0 ? 'slide-in-right' : 'slide-in-left'}`}
              onClick={() => onRoomSelect(room.id)}
              onContextMenu={(e) => handleContextMenu(e, room)}
              onMouseEnter={(e) => {
                const members = room.members?.length || 0;
                const pinStatus = room.pinned ? ' [置顶]' : '';
                handleMouseEnter(e, `${room.name}${pinStatus}\n成员: ${members}\n未读: ${room.unreadCount}`);
              }}
              onMouseLeave={handleMouseLeave}
              style={{
                borderRadius: '12px',
                padding: '10px 12px',
                marginBottom: '4px'
              }}
            >
              <div
                className="message-avatar"
                style={{
                  width: '40px',
                  height: '40px',
                  fontSize: '16px',
                  fontWeight: 600,
                  backgroundColor: `hsl(${room.id.length * 30 % 360}, 70%, 60%)`,
                  position: 'relative',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  borderRadius: '14px', // 稍微方一点的圆角
                }}
              >
                {room.name.charAt(0).toUpperCase()}
                {room.pinned && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      width: '16px',
                      height: '16px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-gradient)' }} />
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingLeft: '4px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  {editingRoomId === room.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={handleRenameSubmit}
                      onKeyDown={handleRenameKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        border: '1px solid var(--accent)',
                        outline: 'none',
                        fontSize: '14px',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-normal)',
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: '15px',
                        fontWeight: activeRoomId === room.id ? 600 : 500,
                        color: activeRoomId === room.id ? 'var(--accent)' : 'var(--text-normal)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {room.name}
                    </span>
                  )}
                  {room.unreadCount > 0 && editingRoomId !== room.id && (
                    <span className="unread-badge" style={{ boxShadow: '0 2px 5px rgba(250, 62, 62, 0.3)' }}>
                        {room.unreadCount > 99 ? '99+' : room.unreadCount}
                    </span>
                  )}
                </div>
                {room.lastMessage && (
                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: '2px',
                      opacity: 0.8
                    }}
                  >
                    {room.lastMessage && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {typeof room.lastMessage.content === 'string'
                          ? room.lastMessage.content
                          : (Array.isArray(room.lastMessage.content) && (room.lastMessage.content[0] as any)?.text) || '消息'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {filteredRooms.length === 0 && roomSearchQuery && (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '14px',
            }}>
              没有找到匹配的房间
            </div>
          )}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu.visible && contextMenu.item && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
          items={[
            {
              id: 'rename',
              label: '重命名',
              icon: (
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
              ),
              onClick: () => handleContextAction('rename'),
            },
            {
              id: 'pin',
              label: contextMenu.item.pinned ? '取消置顶' : '置顶',
              icon: (
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>
                </svg>
              ),
              onClick: () => handleContextAction('togglePin'),
            },
            {
              id: 'read',
              label: contextMenu.item.unreadCount > 0 ? '标记为已读' : '标记为未读',
              icon: (
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              ),
              onClick: () => handleContextAction(contextMenu.item.unreadCount > 0 ? 'markAsRead' : 'markAsUnread'),
            },
            {
              id: 'divider-1',
              label: '',
              type: 'divider',
              onClick: () => {},
            },
            {
              id: 'delete',
              label: '删除',
              danger: true,
              icon: (
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              ),
              onClick: () => handleContextAction('delete'),
            },
          ]}
        />
      )}

      {/* 创建房间模态框 */}
      <CreateRoomModal
        show={showCreateRoom}
        onClose={handleCancelCreateRoom}
        onCreate={handleCreateRoomSubmit}
      />

      {/* 工具提示 */}
      {tooltip.visible && (
        <div
          className="tooltip"
          style={{
            position: 'fixed',
            left: `${tooltip.x}px`,
            top: `${tooltip.y - 30}px`,
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            whiteSpace: 'pre-wrap',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirm.show && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={handleDeleteCancel}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-floating)',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '320px',
              maxWidth: '400px',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.24)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-normal)', fontSize: '18px' }}>
              删除房间
            </h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.5' }}>
              确定要删除房间 <span style={{ fontWeight: 600, color: 'var(--text-normal)' }}>{deleteConfirm.roomName}</span> 吗？
              <br />此操作无法撤销。
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleDeleteCancel}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-normal)',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                取消
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'var(--danger)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
