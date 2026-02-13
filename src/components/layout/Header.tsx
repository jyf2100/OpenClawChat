import React, { useState, useRef, useEffect } from 'react';
import { Room, ConnectionStatus } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { useNotification } from '../../hooks/useNotification';
import { useMediaQuery } from '../../hooks/useMediaQuery';

interface HeaderProps {
  room: Room | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  currentUser?: {
    name: string;
    avatar?: string;
  };
  onSettingsClick?: () => void;
  onNotificationsClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  room,
  connectionStatus,
  currentUser,
  onSettingsClick,
  onNotificationsClick,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { unreadCount } = useNotification();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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

  const getStatusColor = (status: ConnectionStatus) => {
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

  const handleNotificationsClick = () => {
    setShowNotifications(!showNotifications);
    setShowUserMenu(false);
    onNotificationsClick?.();
  };

  const handleUserMenuClick = () => {
    setShowUserMenu(!showUserMenu);
    setShowNotifications(false);
  };

  return (
    <div
      className="chat-header"
      style={{
        height: '56px',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 10,
        position: 'relative',
      }}
    >
      <div className="chat-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '17px', fontWeight: 700 }}>{room?.name || 'RoClaw'}</span>
        {room && (
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '10px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-muted)',
            }}
          >
            {(room as any).type === 'dm' ? '私聊' : room.roomType === 'collaboration' ? '协作' : '频道'}
          </span>
        )}
        {room && connectionStatus && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              borderRadius: '10px',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: getStatusColor(connectionStatus),
              }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {connectionStatus === 'connected' ? '已连接' : connectionStatus === 'connecting' ? '连接中' : connectionStatus === 'error' ? '连接错误' : '未连接'}
            </span>
          </div>
        )}
      </div>

      <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
                gap: '6px',
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-secondary)',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.1s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
            >
              <div
                className="message-avatar"
                style={{
                  width: '22px',
                  height: '22px',
                  fontSize: '10px',
                  backgroundColor: 'var(--accent)',
                }}
              >
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-normal)',
                  fontWeight: 500,
                }}
              >
                {currentUser.name}
              </span>
            </button>

            {showUserMenu && (
              <div
                className="user-menu-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  backgroundColor: 'var(--bg-floating)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '8px 0',
                  minWidth: '180px',
                  boxShadow: '0 8px 16px rgba(0, 0, 0, 0.24)',
                  zIndex: 1000,
                }}
              >
                <button
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: 'var(--text-normal)',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                  onClick={() => {
                    console.log('查看个人资料');
                    setShowUserMenu(false);
                  }}
                >
                  个人资料
                </button>
              </div>
            )}
          </div>
        )}

        <button
          className="icon-btn theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px',
          }}
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
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '4px',
              position: 'relative',
            }}
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
                  fontSize: '9px',
                  fontWeight: 700,
                  minWidth: '14px',
                  height: '14px',
                  borderRadius: '7px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
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
                marginTop: '6px',
                backgroundColor: 'var(--bg-floating)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 0',
                minWidth: '280px',
                maxWidth: '360px',
                maxHeight: '360px',
                overflowY: 'auto',
                boxShadow: '0 8px 16px rgba(0, 0, 0, 0.24)',
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--divider)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-normal)' }}>
                  通知中心
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {unreadCount} 条未读
                </span>
              </div>
              <div
                style={{
                  padding: '20px 14px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
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
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px',
          }}
        >
          ⚙️
        </button>
      </div>
    </div>
  );
};
