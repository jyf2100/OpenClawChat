import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Room, Gateway } from '../../types';
import { useRoomStore } from '../../stores/roomStore';
import { useSidebarStore } from '../../stores/sidebarStore';
import { CreateRoomModal } from '../room/CreateRoomModal';
import { CollaborationRoomForm } from '../room/CollaborationRoomForm';
import { GatewayForm } from '../gateway/GatewayForm';
import ContextMenu from '../chat/ContextMenu';

interface SidebarProps {
  gateways: Gateway[];
  rooms: Room[];
  activeRoomId: string | null;
  onRoomSelect: (roomId: string) => void;
  request: (gatewayId: string, method: string, params: any) => Promise<any>;
  getStatus: (gatewayId: string) => string;
  connect: (url: string, token: string, gatewayId: string) => Promise<void>;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'connected':
      return 'var(--success)';
    case 'connecting':
      return 'var(--warning)';
    case 'error':
      return 'var(--danger)';
    default:
      return 'var(--text-muted)';
  }
};

export const Sidebar: React.FC<SidebarProps> = ({
  gateways,
  rooms,
  activeRoomId,
  onRoomSelect,
  request,
  getStatus,
  connect,
}) => {
  const { addRoom, updateRoom, removeRoom } = useRoomStore();
  const { toggleGateway, isGatewayExpanded } = useSidebarStore();
  
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
  const [showGatewayForm, setShowGatewayForm] = useState(false);
  const [editingGatewayId, setEditingGatewayId] = useState<string | null>(null);
  const [showDeleteGatewayConfirm, setShowDeleteGatewayConfirm] = useState(false);
  const [deletingGatewayId, setDeletingGatewayId] = useState<string | null>(null);
  const [editingCollabRoom, setEditingCollabRoom] = useState<Room | null>(null);

  const collaborationRooms = useMemo(() => {
    return rooms.filter(room => room.roomType === 'collaboration');
  }, [rooms]);

  const gatewayRoomsMap = useMemo(() => {
    const map: Record<string, Room[]> = {};
    gateways.forEach(g => {
      map[g.id] = [];
    });
    rooms.forEach(room => {
      if (room.roomType === 'collaboration') return;
      if (room.gatewayId && map[room.gatewayId]) {
        map[room.gatewayId].push(room);
      }
    });
    Object.keys(map).forEach(gatewayId => {
      map[gatewayId].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (a.order ?? 0) - (b.order ?? 0);
      });
    });
    return map;
  }, [gateways, rooms]);

  const filteredCollaborationRooms = useMemo(() => {
    if (!roomSearchQuery) return collaborationRooms;
    return collaborationRooms.filter(room =>
      room.name.toLowerCase().includes(roomSearchQuery.toLowerCase())
    );
  }, [collaborationRooms, roomSearchQuery]);

  const handleContextMenu = (e: React.MouseEvent, item: Room) => {
    e.preventDefault();
    e.stopPropagation();
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
      case 'editCollab':
        setEditingCollabRoom(item);
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
        break;
      case 'markAsUnread':
        await updateRoom(item.id, { unreadCount: 1 });
        break;
      case 'togglePin':
        await updateRoom(item.id, { pinned: !item.pinned });
        break;
    }
    closeContextMenu();
  };

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

  const handleCreateRoomSubmit = async (roomData: Omit<Room, 'id' | 'unreadCount'> & { id?: string }) => {
    const isCollaboration = roomData.roomType === 'collaboration';
    const gatewayId = isCollaboration ? '' : (roomData.gatewayId || '');
    
    console.log('[Sidebar] 创建房间数据:', { roomData, isCollaboration, gatewayId });
    
    if (!isCollaboration && !gatewayId) {
      console.error('[Sidebar] 创建房间失败: 没有指定网关');
      return;
    }

    let roomId: string;
    if (roomData.id) {
      // 用户自定义 ID，需要加上网关前缀
      roomId = isCollaboration ? roomData.id : `${gatewayId}:${roomData.id}`;
    } else if (isCollaboration) {
      roomId = `collab:${Date.now()}`;
    } else {
      // 默认使用 agent:main:main 作为 sessionKey
      roomId = `${gatewayId}:agent:main:main`;
    }

    console.log('[Sidebar] 生成的房间 ID:', roomId);

    const newRoom: Room = {
      ...roomData,
      id: roomId,
      gatewayId,
      unreadCount: 0,
    };
    await addRoom(newRoom);
    console.log('[Sidebar] 已创建房间:', newRoom);
  };

  const handleCancelCreateRoom = () => {
    setShowCreateRoom(false);
  };

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

  const handleDeleteConfirm = async () => {
    if (deleteConfirm.roomId) {
      await removeRoom(deleteConfirm.roomId);
    }
    setDeleteConfirm({ show: false, roomId: null, roomName: '' });
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ show: false, roomId: null, roomName: '' });
  };

  const openEditGateway = (gatewayId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGatewayId(gatewayId);
    setShowGatewayForm(true);
  };

  const openAddGateway = () => {
    setEditingGatewayId(null);
    setShowGatewayForm(true);
  };

  const handleDeleteGateway = (gatewayId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingGatewayId(gatewayId);
    setShowDeleteGatewayConfirm(true);
  };

  const confirmDeleteGateway = async () => {
    if (deletingGatewayId) {
      const { useGatewayStore } = await import('../../stores/gatewayStore');
      await useGatewayStore.getState().removeGateway(deletingGatewayId);
    }
    setShowDeleteGatewayConfirm(false);
    setDeletingGatewayId(null);
  };

  useEffect(() => {
    const handleClickOutside = () => closeContextMenu();
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.visible]);

  const renderGatewayRow = (gateway: Gateway) => {
    const isExpanded = isGatewayExpanded(gateway.id);
    const status = gateway.status || getStatus(gateway.id) || 'disconnected';
    const gatewayRooms = gatewayRoomsMap[gateway.id] || [];
    const filteredRooms = roomSearchQuery
      ? gatewayRooms.filter(r => r.name.toLowerCase().includes(roomSearchQuery.toLowerCase()))
      : gatewayRooms;

    return (
      <div key={gateway.id} className="gateway-section">
        <div
          className="gateway-row"
          onClick={() => toggleGateway(gateway.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 8px',
            margin: '2px 0',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <span
            style={{
              width: '16px',
              fontSize: '10px',
              color: 'var(--text-muted)',
              transition: 'transform 0.2s ease',
              display: 'inline-block',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            ▶
          </span>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: getStatusColor(status),
              flexShrink: 0,
              marginLeft: '4px',
            }}
          />
          <span
            style={{
              flex: 1,
              marginLeft: '8px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-normal)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {gateway.name}
          </span>
          <div
            style={{ display: 'flex', gap: '2px', opacity: 0.6 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => openEditGateway(gateway.id, e)}
              title="编辑网关"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                fontSize: '12px',
                color: 'var(--text-muted)',
              }}
            >
              ⚙️
            </button>
            <button
              onClick={(e) => handleDeleteGateway(gateway.id, e)}
              title="删除网关"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                fontSize: '12px',
                color: 'var(--text-muted)',
              }}
            >
              🗑️
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="gateway-rooms" style={{ marginLeft: '8px' }}>
            {filteredRooms.map((room) => (
              <div
                key={room.id}
                className={`room-item ${activeRoomId === room.id ? 'active' : ''}`}
                onClick={() => onRoomSelect(room.id)}
                onContextMenu={(e) => handleContextMenu(e, room)}
                onMouseEnter={(e) => {
                  const members = room.members?.length || 0;
                  const pinStatus = room.pinned ? ' [置顶]' : '';
                  handleMouseEnter(e, `${room.name}${pinStatus}\n成员: ${members}\n未读: ${room.unreadCount}`);
                }}
                onMouseLeave={handleMouseLeave}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  marginBottom: '2px',
                  cursor: 'pointer',
                  backgroundColor: activeRoomId === room.id ? 'var(--bg-primary)' : 'transparent',
                  transition: 'background-color 0.1s ease',
                }}
              >
                <div
                  className="message-avatar"
                  style={{
                    width: '32px',
                    height: '32px',
                    fontSize: '13px',
                    fontWeight: 600,
                    backgroundColor: `hsl(${room.id.length * 30 % 360}, 70%, 60%)`,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  {room.name.charAt(0).toUpperCase()}
                  {room.pinned && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-2px',
                        right: '-2px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                      }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
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
                        fontSize: '13px',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-normal)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: activeRoomId === room.id ? 600 : 500,
                          color: activeRoomId === room.id ? 'var(--accent)' : 'var(--text-normal)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {room.name}
                      </span>
                      {room.unreadCount > 0 && (
                        <span
                          className="unread-badge"
                          style={{
                            minWidth: '18px',
                            height: '18px',
                            borderRadius: '9px',
                            background: 'var(--danger)',
                            color: 'white',
                            fontSize: '10px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 5px',
                          }}
                        >
                          {room.unreadCount > 99 ? '99+' : room.unreadCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {filteredRooms.length === 0 && (
              <div
                style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                }}
              >
                {roomSearchQuery ? '无匹配房间' : '暂无房间'}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCollaborationRoom = (room: Room) => (
    <div
      key={room.id}
      className={`room-item ${activeRoomId === room.id ? 'active' : ''}`}
      onClick={() => onRoomSelect(room.id)}
      onContextMenu={(e) => handleContextMenu(e, room)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderRadius: '8px',
        marginBottom: '2px',
        cursor: 'pointer',
        backgroundColor: activeRoomId === room.id ? 'var(--bg-primary)' : 'transparent',
        borderLeft: '3px solid var(--accent)',
        transition: 'background-color 0.1s ease',
      }}
    >
      <div
        className="message-avatar"
        style={{
          width: '32px',
          height: '32px',
          fontSize: '13px',
          fontWeight: 600,
          background: 'var(--accent-gradient)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          flexShrink: 0,
        }}
      >
        {room.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: activeRoomId === room.id ? 600 : 500,
            color: activeRoomId === room.id ? 'var(--accent)' : 'var(--text-normal)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {room.name}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {room.collaboration?.participants?.length || 0} 个参与者
        </div>
      </div>
      {room.unreadCount > 0 && (
        <span
          style={{
            minWidth: '18px',
            height: '18px',
            borderRadius: '9px',
            background: 'var(--danger)',
            color: 'white',
            fontSize: '10px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
          }}
        >
          {room.unreadCount > 99 ? '99+' : room.unreadCount}
        </span>
      )}
    </div>
  );

  return (
    <div className="sidebar" style={{ height: '100%', position: 'relative', display: 'flex' }}>
      <div
        className="room-list"
        style={{
          width: '260px',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="room-header" style={{ padding: '0 16px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            RoClaw
          </span>
          <button
            className="icon-btn add-room-btn"
            onClick={openCreateRoomModal}
            title="创建房间"
            style={{
              width: '28px',
              height: '28px',
              background: 'var(--bg-primary)',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              color: 'var(--text-normal)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +
          </button>
        </div>

        <div className="search-input-wrapper" style={{ padding: '0 12px 12px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="search-input"
              placeholder="搜索房间..."
              value={roomSearchQuery}
              onChange={(e) => setRoomSearchQuery(e.target.value)}
              style={{
                width: '100%',
                borderRadius: '6px',
                paddingLeft: '32px',
                paddingRight: '12px',
                padding: '8px 12px 8px 32px',
                backgroundColor: 'var(--bg-primary)',
                border: 'none',
                color: 'var(--text-normal)',
                fontSize: '13px',
              }}
            />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                opacity: 0.7,
              }}
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
          <div style={{ marginBottom: '8px' }}>
            <div
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              网关
            </div>
            {gateways.map(gateway => renderGatewayRow(gateway))}
            <button
              onClick={openAddGateway}
              style={{
                width: '100%',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '12px',
                borderRadius: '8px',
                marginTop: '4px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                e.currentTarget.style.color = 'var(--success)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <span style={{ fontSize: '14px' }}>+</span>
              添加网关
            </button>
          </div>

          {filteredCollaborationRooms.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                协作房间
              </div>
              {filteredCollaborationRooms.map(room => renderCollaborationRoom(room))}
            </div>
          )}

          {gateways.length === 0 && filteredCollaborationRooms.length === 0 && (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              暂无网关，请添加一个网关开始使用
            </div>
          )}
        </div>
      </div>

      {contextMenu.visible && contextMenu.item && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
          items={[
            ...(contextMenu.item.roomType === 'collaboration' ? [
              {
                id: 'editCollab',
                label: '编辑参与者',
                icon: (
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                  </svg>
                ),
                onClick: () => handleContextAction('editCollab'),
              },
              {
                id: 'divider-collab',
                label: '',
                type: 'divider' as const,
                onClick: () => {},
              },
            ] : []),
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
              type: 'divider' as const,
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

      <CreateRoomModal
        show={showCreateRoom}
        onClose={handleCancelCreateRoom}
        onCreate={handleCreateRoomSubmit}
        request={request}
        getStatus={getStatus}
        connect={connect}
      />

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
            fontSize: '11px',
            whiteSpace: 'pre-wrap',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          {tooltip.text}
        </div>
      )}

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
              padding: '20px',
              minWidth: '300px',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-normal)', fontSize: '16px' }}>
              删除房间
            </h3>
            <p style={{ margin: '0 0 16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
              确定要删除房间 <strong>{deleteConfirm.roomName}</strong> 吗？
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleDeleteCancel}
                style={{
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-normal)',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                取消
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: 'var(--danger)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {showGatewayForm && createPortal(
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
          onClick={() => {
            setShowGatewayForm(false);
            setEditingGatewayId(null);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-floating)',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px 0', color: 'var(--text-normal)', fontSize: '18px' }}>
              {editingGatewayId ? '编辑网关' : '添加网关'}
            </h2>
            <GatewayForm
              gateway={gateways.find(g => g.id === editingGatewayId)}
              onCancel={() => {
                setShowGatewayForm(false);
                setEditingGatewayId(null);
              }}
              onSave={() => {
                setShowGatewayForm(false);
                setEditingGatewayId(null);
              }}
            />
          </div>
        </div>,
        document.body
      )}

      {showDeleteGatewayConfirm && createPortal(
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
          onClick={() => {
            setShowDeleteGatewayConfirm(false);
            setDeletingGatewayId(null);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-floating)',
              borderRadius: '8px',
              padding: '20px',
              minWidth: '300px',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-normal)', fontSize: '16px' }}>
              删除网关
            </h3>
            <p style={{ margin: '0 0 16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
              确定要删除此网关吗？此操作无法撤销。
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDeleteGatewayConfirm(false);
                  setDeletingGatewayId(null);
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-normal)',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                取消
              </button>
              <button
                onClick={confirmDeleteGateway}
                style={{
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: 'var(--danger)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {editingCollabRoom && createPortal(
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
          onClick={() => setEditingCollabRoom(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-floating)',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '450px',
              maxWidth: '550px',
              maxHeight: '80vh',
              overflowY: 'auto',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px 0', color: 'var(--text-normal)', fontSize: '18px' }}>
              编辑协作参与者
            </h2>
            <CollaborationRoomForm
              participants={editingCollabRoom.collaboration?.participants || []}
              onChange={(newParticipants) => {
                const updatedRoom = {
                  ...editingCollabRoom,
                  collaboration: {
                    ...editingCollabRoom.collaboration!,
                    participants: newParticipants,
                  },
                };
                setEditingCollabRoom(updatedRoom as Room);
              }}
              request={request}
              getStatus={getStatus}
              connect={connect}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                onClick={() => setEditingCollabRoom(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '4px',
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
                onClick={async () => {
                  if (editingCollabRoom) {
                    await updateRoom(editingCollabRoom.id, {
                      collaboration: editingCollabRoom.collaboration,
                    });
                    setEditingCollabRoom(null);
                  }
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
