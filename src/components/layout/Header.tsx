import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Room, Gateway, ConnectionStatus } from '../../types';
import { useGatewayStore } from '../../stores/gatewayStore';
import { useTheme } from '../../hooks/useTheme';
import { useNotification } from '../../hooks/useNotification';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { GatewayForm } from '../gateway/GatewayForm';

interface HeaderProps {
  room: Room | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  gateways: Gateway[];
  activeGatewayId: string | null;
  currentUser?: {
    name: string;
    avatar?: string;
  };
  onSettingsClick?: () => void;
  onNotificationsClick?: () => void;
  onGatewaySelect?: (gatewayId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  room,
  connectionStatus,
  gateways,
  activeGatewayId,
  currentUser,
  onSettingsClick,
  onNotificationsClick,
  onGatewaySelect,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { unreadCount } = useNotification();
  const isMobile = useMediaQuery('(max-width: 768px)');

  // 网关下拉菜单状态
  const [showGatewayDropdown, setShowGatewayDropdown] = useState(false);
  const gatewayDropdownRef = useRef<HTMLDivElement>(null);

  // 网关表单状态 (用于添加和编辑)
  const [showGatewayForm, setShowGatewayForm] = useState(false);
  const [editingGatewayId, setEditingGatewayId] = useState<string | null>(null);

  // 删除确认对话框状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingGatewayId, setDeletingGatewayId] = useState<string | null>(null);

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gatewayDropdownRef.current && !gatewayDropdownRef.current.contains(event.target as Node)) {
        setShowGatewayDropdown(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getStatusColor = (status: Gateway['status'] | ConnectionStatus) => {
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

  const activeGateway = gateways.find(g => g.id === activeGatewayId);

  const handleNotificationsClick = () => {
    setShowNotifications(!showNotifications);
    setShowUserMenu(false);
    onNotificationsClick?.();
  };

  const handleUserMenuClick = () => {
    setShowUserMenu(!showUserMenu);
    setShowNotifications(false);
  };

  // 打开添加网关弹窗
  const openAddGateway = () => {
    setEditingGatewayId(null);
    setShowGatewayForm(true);
    setShowGatewayDropdown(false);
  };

  // 打开编辑网关弹窗
  const openEditGateway = (gateway: Gateway, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGatewayId(gateway.id);
    setShowGatewayForm(true);
    setShowGatewayDropdown(false);
  };

  // 删除网关
  const handleDeleteGateway = (gatewayId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingGatewayId(gatewayId);
    setShowDeleteConfirm(true);
    setShowGatewayDropdown(false);
  };

  // 确认删除
  const confirmDeleteGateway = async () => {
    if (deletingGatewayId) {
      try {
        await useGatewayStore.getState().removeGateway(deletingGatewayId);
        console.log('[Header] 网关已删除:', deletingGatewayId);
      } catch (error) {
        console.error('[Header] 删除网关失败:', error);
      }
    }
    setShowDeleteConfirm(false);
    setDeletingGatewayId(null);
  };

  // 取消删除
  const cancelDeleteGateway = () => {
    setShowDeleteConfirm(false);
    setDeletingGatewayId(null);
  };

  const handleCancelGatewayForm = () => {
    setShowGatewayForm(false);
    setEditingGatewayId(null);
  };

  return (
    <div 
      className="chat-header"
      style={{
        height: '60px',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 10,
        position: 'relative'
      }}
    >
      <div className="chat-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '18px', fontWeight: 700 }}>{room?.name || 'OpenClaw Chat'}</span>
        {room && (
          <span 
            style={{ 
              fontSize: '12px', 
              padding: '2px 8px', 
              borderRadius: '10px', 
              backgroundColor: 'var(--bg-secondary)', 
              color: 'var(--text-muted)' 
            }}
          >
            {(room as any).type === 'dm' ? '私聊' : '频道'}
          </span>
        )}
      </div>

      <div className="header-actions" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {/* 网关选择器 */}
        <div style={{ position: 'relative' }} ref={gatewayDropdownRef}>
          <button
            onClick={() => {
              setShowGatewayDropdown(!showGatewayDropdown);
              setShowNotifications(false);
              setShowUserMenu(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-normal)',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div
              className="status-indicator"
              data-status={connectionStatus}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: getStatusColor(connectionStatus),
              }}
            />
            <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeGateway?.name || '选择网关'}
            </span>
            <span style={{ fontSize: '10px', opacity: 0.5 }}>▼</span>
          </button>

          {showGatewayDropdown && (
            <div
              className="gateway-dropdown-menu"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                backgroundColor: 'var(--bg-floating)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 0',
                minWidth: '200px',
                maxHeight: '400px',
                overflowY: 'auto',
                boxShadow: '0 8px 16px rgba(0, 0, 0, 0.24)',
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  padding: '8px 16px',
                  borderBottom: '1px solid var(--divider)',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                网关列表 ({gateways.length})
              </div>

              {gateways.map(gateway => (
                <div
                  key={gateway.id}
                  className="gateway-dropdown-item"
                  onClick={() => {
                    onGatewaySelect?.(gateway.id);
                    setShowGatewayDropdown(false);
                  }}
                  style={{
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'background-color 0.1s ease',
                    backgroundColor: activeGatewayId === gateway.id ? 'var(--bg-primary)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (activeGatewayId !== gateway.id) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeGatewayId !== gateway.id) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <span
                    className="gateway-status-indicator"
                    style={{
                      display: 'inline-block',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: getStatusColor(gateway.status),
                      border: '2px solid var(--bg-floating)',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '14px',
                        color: 'var(--text-normal)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {gateway.name}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {gateway.url}
                    </div>
                  </div>
                  
                  {/* 操作按钮组 */}
                  <div className="gateway-actions" style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={(e) => openEditGateway(gateway, e)}
                      title="编辑"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        fontSize: '14px',
                        opacity: 0.6,
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => handleDeleteGateway(gateway.id, e)}
                      title="删除"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        fontSize: '14px',
                        opacity: 0.6,
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}

              {gateways.length === 0 && (
                <div
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '14px',
                  }}
                >
                  暂无网关
                </div>
              )}

              <div
                className="dropdown-divider"
                style={{
                  height: '1px',
                  backgroundColor: 'var(--divider)',
                  margin: '8px 0',
                }}
              />

              <button
                onClick={openAddGateway}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'var(--success)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ fontSize: '16px' }}>+</span>
                添加网关
              </button>
            </div>
          )}
        </div>

        {/* 添加网关按钮 */}
        <button
          className="icon-btn add-gateway-btn"
          onClick={openAddGateway}
          title="添加网关"
          aria-label="添加新网关"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--success)',
            fontSize: '20px',
            fontWeight: 600,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
            e.currentTarget.style.borderColor = 'var(--success)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          +
        </button>

        {!isMobile && currentUser && (
          <div
            ref={userMenuRef}
            className="user-menu-container"
            style={{ position: 'relative' }}
          >
            <button
              className="user-menu-btn"
              onClick={handleUserMenuClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-secondary)',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.1s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
            >
              <div
                className="message-avatar"
                style={{
                  width: '24px',
                  height: '24px',
                  fontSize: '10px',
                  backgroundColor: 'var(--accent)',
                }}
              >
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <span
                style={{
                  fontSize: '14px',
                  color: 'var(--text-normal)',
                  fontWeight: 500,
                }}
              >
                {currentUser.name}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>▼</span>
            </button>

            {showUserMenu && (
              <div
                className="user-menu-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  backgroundColor: 'var(--bg-floating)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '8px 0',
                  minWidth: '200px',
                  boxShadow: '0 8px 16px rgba(0, 0, 0, 0.24)',
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--divider)',
                  }}
                >
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    当前用户
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-normal)', fontWeight: 600 }}>
                    {currentUser.name}
                  </div>
                </div>
                <button
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: 'var(--text-normal)',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                  onClick={() => {
                    console.log('查看个人资料');
                    setShowUserMenu(false);
                  }}
                >
                  个人资料
                </button>
                <button
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: 'var(--text-normal)',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                  onClick={() => {
                    console.log('切换状态');
                    setShowUserMenu(false);
                  }}
                >
                  切换状态
                </button>
              </div>
            )}
          </div>
        )}

        <button
          className="icon-btn theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <div
          ref={notificationRef}
          className="notification-container"
          style={{ position: 'relative' }}
        >
          <button
            className="icon-btn notification-btn"
            onClick={handleNotificationsClick}
            title="通知中心"
            aria-label={`通知中心${unreadCount > 0 ? ` (${unreadCount} 条未读)` : ''}`}
          >
            🔔
            {unreadCount > 0 && (
              <span
                className="notification-badge"
                style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  backgroundColor: 'var(--danger)',
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: 700,
                  minWidth: '16px',
                  height: '16px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div
              className="notification-dropdown"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                backgroundColor: 'var(--bg-floating)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 0',
                minWidth: '300px',
                maxWidth: '400px',
                maxHeight: '400px',
                overflowY: 'auto',
                boxShadow: '0 8px 16px rgba(0, 0, 0, 0.24)',
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--divider)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-normal)' }}>
                  通知中心
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {unreadCount} 条未读
                </span>
              </div>
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '14px',
                }}
              >
                暂无通知
              </div>
            </div>
          )}
        </div>

        <button
          className="icon-btn settings-btn"
          onClick={onSettingsClick}
          title="设置"
          aria-label="打开设置"
        >
          ⚙️
        </button>
      </div>

      {/* 添加/编辑网关模态框 */}
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
          onClick={handleCancelGatewayForm}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-floating)',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px 0', color: 'var(--text-normal)', fontSize: '18px' }}>
              {editingGatewayId ? '编辑网关' : '添加网关'}
            </h2>

            <GatewayForm
              gateway={gateways.find(g => g.id === editingGatewayId)}
              onCancel={handleCancelGatewayForm}
              onSave={handleCancelGatewayForm}
            />
          </div>
        </div>,
        document.body
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm && createPortal(
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
          onClick={cancelDeleteGateway}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-floating)',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '320px',
              maxWidth: '400px',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-normal)', fontSize: '18px' }}>
              删除网关
            </h2>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '14px' }}>
              确定要删除这个网关吗？此操作无法撤销。
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelDeleteGateway}
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
                onClick={confirmDeleteGateway}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'var(--danger)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
