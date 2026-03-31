import React, { useState, useRef, useEffect } from 'react';
import { Room, ConnectionStatus, GatewayConfig } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { useNotification } from '../../hooks/useNotification';
import { useMediaQuery } from '../../hooks/useMediaQuery';

const WORKBENCH_PANEL_STYLE: React.CSSProperties = {
  background: 'var(--HEADER_BAR_BACKGROUND)',
  border: '1px solid var(--CHAT_HEADER_BORDER)',
  boxShadow: 'var(--CHAT_HEADER_SHADOW)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
};

const COMMAND_DECK_BUTTON: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '7px 11px',
  minHeight: '34px',
  borderRadius: '12px',
  border: '1px solid var(--CHAT_HEADER_BUTTON_BORDER)',
  background: 'var(--COMMAND_DECK_BUTTON)',
  color: 'var(--text-normal)',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer',
  flexShrink: 0,
};

const COMMAND_DECK_LABEL: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--COMMAND_DECK_LABEL)',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  flexShrink: 0,
};

const COMMAND_DECK_STATUS = (statusColor: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 10px',
  borderRadius: '999px',
  background: 'var(--COMMAND_DECK_STATUS)',
  border: '1px solid var(--CHAT_HEADER_BORDER)',
  color: 'var(--text-muted)',
  fontSize: '11px',
  fontWeight: 700,
  flexShrink: 0,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${statusColor} 12%, transparent)`,
});

interface HeaderProps {
  room: Room | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  gateways: GatewayConfig[];
  currentUser?: {
    name: string;
    avatar?: string;
  };
  onLogout?: () => void;
  onSettingsClick?: () => void;
  onNotificationsClick?: () => void;
  onDocsClick?: () => void;
  onAddGatewayClick?: () => void;
  onAddRoomClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  room,
  connectionStatus,
  gateways,
  currentUser,
  onLogout,
  onSettingsClick,
  onNotificationsClick,
  onDocsClick,
  onAddGatewayClick,
  onAddRoomClick,
}) => {
  const { theme, cycleTheme } = useTheme();
  const { unreadCount } = useNotification();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const notificationMenuId = React.useId();
  const userMenuId = React.useId();

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
        setShowUserMenu(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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

  const roomKind = room
    ? ((room as any).type === 'dm' ? '私聊' : room.roomType === 'collaboration' ? '协作工作台' : '频道')
    : '工作区';
  const themeLabels: Record<string, string> = {
    light: '原版',
    dark: '夜幕',
    tech: '科技',
    spring: '春',
    summer: '夏',
    autumn: '秋',
    winter: '冬',
  };
  const selectedGateway = room?.gatewayId
    ? gateways.find((gateway) => gateway.id === room.gatewayId) || gateways.find((gateway) => gateway.id === 'default') || gateways[0] || null
    : gateways.find((gateway) => gateway.id === 'default') || gateways[0] || null;
  const selectedGatewayName = selectedGateway?.name || '未选择网关';
  const connectionLabel =
    connectionStatus === 'connected'
      ? '在线'
      : connectionStatus === 'connecting'
        ? '连接中'
        : connectionStatus === 'error'
          ? '异常'
          : '离线';

  return (
    <div
      className="chat-header"
      style={{
        minHeight: isMobile ? '64px' : '68px',
        padding: isMobile ? '8px 12px' : '10px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        borderBottom: '1px solid var(--border)',
        ...WORKBENCH_PANEL_STYLE,
        zIndex: 10,
        position: 'relative',
      }}
    >
      <div className="chat-title" style={{ display: 'flex', alignItems: 'stretch', gap: '12px', minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            gap: '10px',
            minWidth: 0,
            width: '100%',
            flexDirection: isMobile ? 'column' : 'row',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? '8px' : '12px',
              flexWrap: isMobile ? 'wrap' : 'nowrap',
              padding: isMobile ? '8px 10px' : '8px 12px',
              borderRadius: '16px',
              background: 'var(--CHAT_HEADER_PANEL_SURFACE)',
              border: '1px solid var(--CHAT_HEADER_BORDER)',
              flex: '0 1 auto',
              minWidth: 0,
              maxWidth: isMobile ? '100%' : 'min(52vw, 620px)',
              width: isMobile ? '100%' : 'auto',
            }}
          >
            <span style={COMMAND_DECK_LABEL}>网关</span>
            <span style={{ fontSize: isMobile ? '13px' : '14px', fontWeight: 700, color: 'var(--text-normal)', minWidth: 0, maxWidth: isMobile ? '100%' : '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedGatewayName}
            </span>
            <span style={{ color: 'var(--divider)', flexShrink: 0 }}>/</span>
            <span style={COMMAND_DECK_LABEL}>房间</span>
            <div
              style={{
                width: isMobile ? '24px' : '26px',
                height: isMobile ? '24px' : '26px',
                borderRadius: '9px',
                background: 'var(--CHAT_HEADER_PANEL_SOFT)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '11px',
                boxShadow: 'var(--CHAT_HEADER_PANEL_SHADOW)',
                flexShrink: 0,
              }}
            >
              {(room?.name?.charAt(0).toUpperCase() || 'R')}
            </div>
            <span style={{ fontSize: isMobile ? '13px' : '14px', fontWeight: 800, color: 'var(--text-normal)', minWidth: 0, maxWidth: isMobile ? 'calc(100% - 48px)' : '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {room?.name || 'Roclaw Workspace'}
            </span>
            {!isMobile && (
              <>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
                  {roomKind}
                </span>
                <button
                  type="button"
                  onClick={onAddGatewayClick}
                  disabled={!onAddGatewayClick}
                  aria-label="添加网关"
                  style={{
                    ...COMMAND_DECK_BUTTON,
                    background: 'var(--accent-gradient)',
                    border: '1px solid transparent',
                    color: '#071018',
                    boxShadow: 'var(--CHAT_HEADER_ACTION_GLOW)',
                    whiteSpace: 'nowrap',
                  }}
                  title="添加网关"
                >
                  <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
                  <span>添加网关</span>
                </button>
                <button
                  type="button"
                  onClick={onAddRoomClick}
                  disabled={!onAddRoomClick}
                  aria-label="添加房间"
                  style={{
                    ...COMMAND_DECK_BUTTON,
                  }}
                  title="添加房间"
                >
                  <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
                  <span>添加房间</span>
                </button>
                <div
                  style={COMMAND_DECK_STATUS(getStatusColor(connectionStatus))}
                  role="status"
                  aria-live="polite"
                  aria-label={`网关状态：${connectionLabel}`}
                  title={`网关${connectionLabel}`}
                >
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: getStatusColor(connectionStatus),
                    boxShadow: `0 0 0 4px color-mix(in srgb, ${getStatusColor(connectionStatus)} 16%, transparent)`,
                  }} />
                  <span>{connectionLabel}</span>
                </div>
              </>
            )}
          </div>

          {isMobile && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                width: '100%',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  ...COMMAND_DECK_STATUS(getStatusColor(connectionStatus)),
                  padding: '6px 8px',
                }}
                role="status"
                aria-live="polite"
                aria-label={`网关状态：${connectionLabel}`}
                title={`网关${connectionLabel}`}
              >
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(connectionStatus),
                  boxShadow: `0 0 0 4px color-mix(in srgb, ${getStatusColor(connectionStatus)} 16%, transparent)`,
                }} />
                <span>{connectionLabel}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                <button
                  type="button"
                  onClick={onAddGatewayClick}
                  disabled={!onAddGatewayClick}
                  aria-label="添加网关"
                  style={{
                    ...COMMAND_DECK_BUTTON,
                    minHeight: '32px',
                    padding: '6px 10px',
                    background: 'var(--accent-gradient)',
                    border: '1px solid transparent',
                    color: '#071018',
                  }}
                  title="添加网关"
                >
                  <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
                  <span>网关</span>
                </button>
                <button
                  type="button"
                  onClick={onAddRoomClick}
                  disabled={!onAddRoomClick}
                  aria-label="添加房间"
                  style={{
                    ...COMMAND_DECK_BUTTON,
                    minHeight: '32px',
                    padding: '6px 10px',
                  }}
                  title="添加房间"
                >
                  <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
                  <span>房间</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="header-actions" style={{ display: 'flex', gap: isMobile ? '8px' : '10px', alignItems: 'center', flexShrink: 0 }}>
        {!isMobile && currentUser && (
          <div ref={userMenuRef} className="user-menu-container" style={{ position: 'relative' }}>
            <button
              type="button"
              className="user-menu-btn"
              onClick={handleUserMenuClick}
              aria-label={`用户菜单，当前用户 ${currentUser.name}`}
              aria-haspopup="menu"
              aria-expanded={showUserMenu}
              aria-controls={showUserMenu ? userMenuId : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 10px',
                borderRadius: '999px',
                backgroundColor: 'color-mix(in srgb, var(--bg-floating) 82%, transparent)',
                border: '1px solid var(--CHAT_HEADER_BUTTON_BORDER)',
                cursor: 'pointer',
                boxShadow: 'none',
              }}
            >
              <div
                className="message-avatar"
                style={{
                  width: '28px',
                  height: '28px',
                  fontSize: '11px',
                  background: 'var(--accent-gradient)',
                }}
              >
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-normal)',
                  fontWeight: 700,
                }}
              >
                {currentUser.name}
              </span>
            </button>

            {showUserMenu && (
              <div
                id={userMenuId}
                className="user-menu-dropdown"
                role="menu"
                aria-label="用户菜单"
                style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '10px',
                ...WORKBENCH_PANEL_STYLE,
                borderRadius: '18px',
                padding: '8px 0',
                minWidth: '180px',
                zIndex: 1000,
              }}
              >
                <button
                  type="button"
                  role="menuitem"
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
                    setShowUserMenu(false);
                  }}
                >
                  个人资料
                </button>
                {onLogout && (
                  <button
                    type="button"
                    role="menuitem"
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      textAlign: 'left',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#fca5a5',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                  >
                    退出登录
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="icon-btn theme-toggle"
          onClick={cycleTheme}
          title="切换主题"
          aria-label={`切换主题，当前主题 ${themeLabels[theme]}`}
          style={{
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingInline: isMobile ? '10px' : '12px',
            width: 'auto',
            minWidth: isMobile ? '38px' : '88px',
            height: isMobile ? '36px' : '38px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '16px' }}>
            {theme === 'tech' ? '◈' : theme === 'spring' ? '✿' : theme === 'summer' ? '☼' : theme === 'autumn' ? '❦' : theme === 'winter' ? '❄' : theme === 'dark' ? '☾' : '◐'}
          </span>
          {!isMobile && <span>{themeLabels[theme]}</span>}
        </button>

        {onDocsClick && (
          <button
            type="button"
            className="icon-btn docs-btn"
            onClick={onDocsClick}
            title="文档库"
            aria-label="打开文档库"
            style={{ fontSize: '16px' }}
          >
            📚
          </button>
        )}

        <div ref={notificationRef} className="notification-container" style={{ position: 'relative' }}>
          <button
            type="button"
            className="icon-btn notification-btn"
            onClick={handleNotificationsClick}
            title="通知中心"
            aria-label={`通知中心，${unreadCount} 条未读`}
            aria-haspopup="menu"
            aria-expanded={showNotifications}
            aria-controls={showNotifications ? notificationMenuId : undefined}
            style={{ fontSize: '16px', position: 'relative' }}
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
                  color: '#fff7ef',
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
              id={notificationMenuId}
              className="notification-dropdown"
              role="menu"
              aria-label="通知中心"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '10px',
                backgroundColor: 'color-mix(in srgb, var(--bg-floating) 92%, transparent)',
                border: '1px solid var(--CHAT_HEADER_BUTTON_BORDER)',
                borderRadius: '20px',
                padding: '8px 0',
                minWidth: '280px',
                maxWidth: '360px',
                maxHeight: '360px',
                overflowY: 'auto',
                boxShadow: '0 18px 36px rgba(0,0,0,0.18)',
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
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-normal)' }}>
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
          type="button"
          className="icon-btn settings-btn"
          onClick={onSettingsClick}
          title="设置"
          aria-label="打开设置"
          disabled={!onSettingsClick}
          style={{ fontSize: '16px' }}
        >
          ⚙️
        </button>
      </div>
    </div>
  );
};
