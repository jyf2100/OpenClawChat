import React, { useState, useEffect } from 'react';
import { Room } from '../../types';

interface CreateRoomModalProps {
  show: boolean;
  onClose: () => void;
  room?: Room;
  onCreate: (room: Omit<Room, 'id' | 'unreadCount'>) => void;
  onUpdate?: (id: string, room: Partial<Room>) => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  show,
  onClose,
  room,
  onCreate,
  onUpdate,
}) => {
  const [name, setName] = useState(room?.name || '');
  const [customId, setCustomId] = useState(room?.id || '');
  const [type, setType] = useState<'channel' | 'private' | 'group'>(room?.type || 'channel');
  const [description, setDescription] = useState('');

  const isEditMode = !!room;

  useEffect(() => {
    if (show) {
      setName(room?.name || '');
      setCustomId(room?.id || '');
      setType(room?.type || 'channel');
      setDescription('');
    }
  }, [show, room]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSubmit = () => {
    if (!name.trim()) {
      alert('请输入房间名称');
      return;
    }

    if (name.length > 50) {
      alert('房间名称不能超过50个字符');
      return;
    }

    if (isEditMode && room && onUpdate) {
      onUpdate(room.id, { name: name.trim(), type });
    } else {
      const newRoom = {
        id: customId.trim() || undefined,
        gatewayId: 'default',
        name: name.trim(),
        type,
      };
      onCreate(newRoom as any);
    }

    setName('');
    setCustomId('');
    setDescription('');
    onClose();
  };

  if (!show) return null;

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-floating)',
          borderRadius: '8px',
          padding: '24px',
          minWidth: '400px',
          maxWidth: '500px',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 16px rgba(0, 0, 0, 0.24)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px 0', color: 'var(--text-normal)', fontSize: '18px' }}>
          {isEditMode ? '编辑房间' : '创建房间'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
              房间名称 <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 闲聊、技术交流"
              maxLength={50}
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-normal)',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {name.length}/50
            </div>
          </div>

          {!isEditMode && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                房间 ID（可选，用于 Agent 连接）
              </label>
              <input
                type="text"
                value={customId}
                onChange={(e) => setCustomId(e.target.value)}
                placeholder="例如: agent:main:main"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-normal)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
              房间类型
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              {(['channel', 'private', 'group'] as const).map((typeOption) => (
                <label
                  key={typeOption}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: 'var(--text-normal)',
                  }}
                >
                  <input
                    type="radio"
                    name="roomType"
                    value={typeOption}
                    checked={type === typeOption}
                    onChange={(e) => setType(e.target.value as any)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>
                    {typeOption === 'channel' && '频道'}
                    {typeOption === 'private' && '私聊'}
                    {typeOption === 'group' && '群组'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
              描述（可选）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简单描述这个房间的用途..."
              maxLength={200}
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-normal)',
                fontSize: '14px',
                resize: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {description.length}/200
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
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
              {isEditMode ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
