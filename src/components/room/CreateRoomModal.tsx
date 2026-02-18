import React, { useState, useEffect } from 'react';
import { Room, RoomType, CollaborationParticipant, JudgeConfig } from '../../types';
import { CollaborationRoomForm } from './CollaborationRoomForm';
import { useGatewayStore } from '../../stores/gatewayStore';

interface CreateRoomModalProps {
  show: boolean;
  onClose: () => void;
  room?: Room;
  onCreate: (room: Omit<Room, 'id' | 'unreadCount'>) => void;
  onUpdate?: (id: string, room: Partial<Room>) => void;
  request: (gatewayId: string, method: string, params: any) => Promise<any>;
  getStatus: (gatewayId: string) => string;
  connect: (url: string, token: string, gatewayId: string) => Promise<void>;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  show,
  onClose,
  room,
  onCreate,
  onUpdate,
  request,
  getStatus,
  connect,
}) => {
  const { gateways } = useGatewayStore();
  
  const [name, setName] = useState(room?.name || '');
  const [customId, setCustomId] = useState(room?.id || '');
  const [type, setType] = useState<'channel' | 'private' | 'group'>(room?.type || 'channel');
  const [description, setDescription] = useState('');
  const [roomType, setRoomType] = useState<RoomType>(room?.roomType || 'single-gateway');
  const [selectedGatewayId, setSelectedGatewayId] = useState('');
  const [participants, setParticipants] = useState<CollaborationParticipant[]>(
    room?.collaboration?.participants || []
  );
  // 多轮配置状态
  const [maxRounds, setMaxRounds] = useState(room?.collaboration?.maxRounds || 10);
  const [judge, setJudge] = useState<JudgeConfig | undefined>(room?.collaboration?.judge);

  const isEditMode = !!room;

  useEffect(() => {
    if (show) {
      setName(room?.name || '');
      setCustomId(room?.id || '');
      setType(room?.type || 'channel');
      setDescription('');
      setRoomType(room?.roomType || 'single-gateway');
      setParticipants(room?.collaboration?.participants || []);
      setMaxRounds(room?.collaboration?.maxRounds || 10);
      setJudge(room?.collaboration?.judge);
      // 默认选中第一个网关
      if (gateways.length > 0 && !room?.gatewayId) {
        setSelectedGatewayId(gateways[0].id);
      } else if (room?.gatewayId) {
        setSelectedGatewayId(room.gatewayId);
      }
    }
  }, [show, room, gateways]);

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
    
    if (roomType === 'single-gateway' && !selectedGatewayId) {
      alert('请选择一个网关');
      return;
    }
    
    if (roomType === 'collaboration' && participants.length === 0) {
      alert('协作房间至少需要一个参与者');
      return;
    }

    if (isEditMode && room && onUpdate) {
      onUpdate(room.id, { name: name.trim(), type });
    } else {
      const gatewayId = roomType === 'collaboration'
        ? ''
        : selectedGatewayId;

      const newRoom = {
        id: customId.trim() || undefined,
        gatewayId,
        name: name.trim(),
        type,
        roomType,
        collaboration: roomType === 'collaboration' ? {
          participants,
          autoContinue: true,
          allowIntervention: true,
          maxRounds,
          judge,
        } : undefined,
      };
      onCreate(newRoom as any);
    }

    setName('');
    setCustomId('');
    setDescription('');
    setParticipants([]);
    setMaxRounds(10);
    setJudge(undefined);
    setSelectedGatewayId('');
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
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 16px rgba(0, 0, 0, 0.24)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px 0', color: 'var(--text-normal)', fontSize: '18px', flexShrink: 0 }}>
          {isEditMode ? '编辑房间' : '创建房间'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
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

          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
              消息类型
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setRoomType('single-gateway')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: roomType === 'single-gateway' ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: roomType === 'single-gateway' ? 'rgba(0, 132, 255, 0.1)' : 'var(--bg-secondary)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-normal)' }}>
                  单网关房间
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  与单个机器人对话
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRoomType('collaboration')}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: roomType === 'collaboration' ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: roomType === 'collaboration' ? 'rgba(0, 132, 255, 0.1)' : 'var(--bg-secondary)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-normal)' }}>
                  协作房间
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  多机器人串行协作
                </div>
              </button>
            </div>
          </div>

          {!isEditMode && roomType === 'single-gateway' && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                所属网关 <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                value={selectedGatewayId}
                onChange={(e) => setSelectedGatewayId(e.target.value)}
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
              >
                <option value="">选择网关...</option>
                {gateways.map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g.id})</option>
                ))}
              </select>
            </div>
          )}

          {!isEditMode && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                房间 ID（可选，用于 Agent 连接）
              </label>
              <input
                type="text"
                value={customId}
                onChange={(e) => setCustomId(e.target.value)}
                placeholder={roomType === 'collaboration' ? '协作房间自动生成 ID' : '例如: agent:main:main'}
                disabled={roomType === 'collaboration'}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: roomType === 'collaboration' ? 'var(--bg-tertiary)' : 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-normal)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace',
                  opacity: roomType === 'collaboration' ? 0.6 : 1,
                }}
              />
            </div>
          )}
          
          {roomType === 'collaboration' && !isEditMode && (
            <CollaborationRoomForm
              participants={participants}
              onChange={setParticipants}
              maxRounds={maxRounds}
              onMaxRoundsChange={setMaxRounds}
              judge={judge}
              onJudgeChange={setJudge}
              request={request}
              getStatus={getStatus}
              connect={connect}
            />
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
        </div>

        {/* 底部按钮 - 固定在底部 */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px', flexShrink: 0, paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
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
  );
};
