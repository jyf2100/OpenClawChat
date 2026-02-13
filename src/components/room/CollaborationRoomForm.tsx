import React, { useState, useEffect, useCallback } from 'react';
import { useGatewayStore } from '../../stores/gatewayStore';
import type { CollaborationParticipant, GatewayAgentRow, AgentsListResult } from '../../types';

interface CollaborationRoomFormProps {
  participants: CollaborationParticipant[];
  onChange: (participants: CollaborationParticipant[]) => void;
  request: (gatewayId: string, method: string, params: any) => Promise<any>;
  getStatus: (gatewayId: string) => string;
  connect: (url: string, token: string, gatewayId: string) => Promise<void>;
}

const COLORS = ['#0084ff', '#00c6ff', '#31a24c', '#f7b928', '#fa3e3e', '#9c27b0', '#00bcd4', '#ff5722'];

interface EditingState {
  index: number;
  field: 'name' | 'color';
  value: string;
}

export const CollaborationRoomForm: React.FC<CollaborationRoomFormProps> = ({
  participants,
  onChange,
  request,
  getStatus,
  connect,
}) => {
  const { gateways } = useGatewayStore();
  
  const [selectedGatewayId, setSelectedGatewayId] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [agents, setAgents] = useState<GatewayAgentRow[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [editingParticipant, setEditingParticipant] = useState<EditingState | null>(null);
  
  const loadAgents = useCallback(async (gatewayId: string) => {
    if (!gatewayId) {
      setAgents([]);
      setSelectedAgentId('');
      return;
    }
    
    setLoadingAgents(true);
    setError(null);
    try {
      const res = await request(gatewayId, 'agents.list', {}) as AgentsListResult | null;
      if (res?.agents) {
        setAgents(res.agents);
        if (res.defaultId && res.agents.some((a: GatewayAgentRow) => a.id === res.defaultId)) {
          setSelectedAgentId(res.defaultId);
        } else if (res.agents.length > 0) {
          setSelectedAgentId(res.agents[0].id);
        }
      }
    } catch (err) {
      console.error('[CollaborationRoomForm] 加载 Agent 列表失败:', err);
      setError('加载 Agent 列表失败');
      setAgents([]);
      setSelectedAgentId('');
    } finally {
      setLoadingAgents(false);
    }
  }, [request]);
  
  const ensureConnectedAndLoadAgents = useCallback(async (gatewayId: string) => {
    const status = getStatus(gatewayId);
    
    if (status === 'connected') {
      await loadAgents(gatewayId);
      return;
    }
    
    const gateway = gateways.find(g => g.id === gatewayId);
    if (!gateway) {
      setError('网关不存在');
      return;
    }
    
    if (!gateway.token) {
      setError('网关未设置 Token，请先在网关设置中配置');
      return;
    }
    
    setConnecting(true);
    setError(null);
    setAgents([]);
    setSelectedAgentId('');
    
    try {
      await connect(gateway.url, gateway.token, gatewayId);
      
      await new Promise<void>((resolve, reject) => {
        const maxWait = 10000;
        const startTime = Date.now();
        const check = () => {
          const currentStatus = getStatus(gatewayId);
          if (currentStatus === 'connected') {
            resolve();
          } else if (Date.now() - startTime > maxWait) {
            reject(new Error('连接超时'));
          } else {
            setTimeout(check, 200);
          }
        };
        check();
      });
      
      await loadAgents(gatewayId);
    } catch (err) {
      console.error('[CollaborationRoomForm] 连接网关失败:', err);
      setError(err instanceof Error ? err.message : '连接网关失败');
    } finally {
      setConnecting(false);
    }
  }, [getStatus, gateways, connect, loadAgents]);
  
  useEffect(() => {
    if (selectedGatewayId) {
      ensureConnectedAndLoadAgents(selectedGatewayId);
    }
  }, [selectedGatewayId, ensureConnectedAndLoadAgents]);
  
  useEffect(() => {
    if (selectedAgentId && agents.length > 0) {
      const agent = agents.find(a => a.id === selectedAgentId);
      if (agent && !displayName) {
        setDisplayName(agent.identity?.name || agent.name || agent.id);
      }
    }
  }, [selectedAgentId, agents, displayName]);
  
  const addParticipant = () => {
    if (!selectedGatewayId || !selectedAgentId || !displayName.trim()) {
      return;
    }
    
    const newParticipant: CollaborationParticipant = {
      gatewayId: selectedGatewayId,
      agentId: selectedAgentId,
      order: participants.length + 1,
      isActive: true,
      name: displayName.trim(),
      avatar: displayName.trim()[0] || '?',
      color: COLORS[participants.length % COLORS.length],
    };
    onChange([...participants, newParticipant]);
    
    setDisplayName('');
  };
  
  const removeParticipant = (index: number) => {
    const updated = participants.filter((_, i) => i !== index);
    updated.forEach((p, i) => p.order = i + 1);
    onChange(updated);
  };
  
  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...participants];
    [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
    updated.forEach((p, i) => p.order = i + 1);
    onChange(updated);
  };
  
  const moveDown = (index: number) => {
    if (index === participants.length - 1) return;
    const updated = [...participants];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    updated.forEach((p, i) => p.order = i + 1);
    onChange(updated);
  };
  
  const updateParticipantName = (index: number, name: string) => {
    const updated = [...participants];
    updated[index] = { ...updated[index], name, avatar: name[0] || '?' };
    onChange(updated);
  };
  
  const updateParticipantColor = (index: number, color: string) => {
    const updated = [...participants];
    updated[index] = { ...updated[index], color };
    onChange(updated);
  };
  
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (editingParticipant) {
        if (editingParticipant.field === 'name') {
          updateParticipantName(editingParticipant.index, editingParticipant.value);
        } else {
          updateParticipantColor(editingParticipant.index, editingParticipant.value);
        }
      }
      setEditingParticipant(null);
    } else if (e.key === 'Escape') {
      setEditingParticipant(null);
    }
  };
  
  const canAdd = selectedGatewayId && selectedAgentId && displayName.trim();
  
  return (
    <div className="collaboration-form">
      <h4 style={{ margin: '16px 0 12px', fontSize: '14px', fontWeight: 600, color: 'var(--text-normal)' }}>
        协作参与者配置
      </h4>
      
      <div className="participant-list" style={{ marginBottom: '12px' }}>
        {participants.length === 0 && (
          <div style={{ 
            padding: '16px', 
            textAlign: 'center', 
            color: 'var(--text-muted)', 
            fontSize: '13px',
            background: 'var(--bg-secondary)',
            borderRadius: '8px'
          }}>
            暂无参与者，请添加协作机器人
          </div>
        )}
        
        {participants.map((p, index) => (
          <div 
            key={`participant-${index}-${p.gatewayId}-${p.agentId}`}
            className="participant-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              background: 'var(--bg-secondary)',
              borderRadius: '8px',
              marginBottom: '8px',
            }}
          >
            <input
              type="color"
              value={p.color || COLORS[index % COLORS.length]}
              onChange={(e) => updateParticipantColor(index, e.target.value)}
              title="点击修改颜色"
              style={{
                width: '28px',
                height: '28px',
                padding: 0,
                border: 'none',
                borderRadius: '50%',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              {editingParticipant?.index === index && editingParticipant?.field === 'name' ? (
                <input
                  autoFocus
                  type="text"
                  value={editingParticipant.value}
                  onChange={(e) => setEditingParticipant({ ...editingParticipant, value: e.target.value })}
                  onBlur={() => {
                    updateParticipantName(index, editingParticipant.value);
                    setEditingParticipant(null);
                  }}
                  onKeyDown={handleEditKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    padding: '2px 6px',
                    fontSize: '14px',
                    fontWeight: 500,
                    border: '1px solid var(--accent)',
                    borderRadius: '4px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-normal)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              ) : (
                <div 
                  onClick={() => setEditingParticipant({ index, field: 'name', value: p.name })}
                  style={{ 
                    fontSize: '14px', 
                    fontWeight: 500, 
                    color: 'var(--text-normal)',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    margin: '-2px -6px',
                    borderRadius: '4px',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  title="点击修改名称"
                >
                  {p.name}
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {p.gatewayId} / {p.agentId}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <button
                onClick={() => moveUp(index)}
                disabled={index === 0}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-floating)',
                  borderRadius: '4px',
                  cursor: index === 0 ? 'not-allowed' : 'pointer',
                  opacity: index === 0 ? 0.5 : 1,
                  color: 'var(--text-normal)',
                }}
              >
                ↑
              </button>
              <button
                onClick={() => moveDown(index)}
                disabled={index === participants.length - 1}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-floating)',
                  borderRadius: '4px',
                  cursor: index === participants.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: index === participants.length - 1 ? 0.5 : 1,
                  color: 'var(--text-normal)',
                }}
              >
                ↓
              </button>
              <button
                onClick={() => removeParticipant(index)}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  border: '1px solid var(--danger)',
                  background: 'transparent',
                  color: 'var(--danger)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {error && (
        <div style={{
          padding: '8px 12px',
          marginBottom: '12px',
          background: 'rgba(250, 62, 62, 0.1)',
          border: '1px solid var(--danger)',
          borderRadius: '6px',
          fontSize: '12px',
          color: 'var(--danger)',
        }}>
          {error}
        </div>
      )}
      
      {connecting && (
        <div style={{
          padding: '8px 12px',
          marginBottom: '12px',
          background: 'rgba(0, 132, 255, 0.1)',
          borderRadius: '6px',
          fontSize: '12px',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ animation: 'pulse 1s infinite' }}>⏳</span>
          正在连接网关...
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={selectedGatewayId}
          onChange={(e) => {
            setSelectedGatewayId(e.target.value);
            setSelectedAgentId('');
            setAgents([]);
            setError(null);
          }}
          disabled={connecting || loadingAgents}
          style={{
            flex: '1 1 100px',
            minWidth: '100px',
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '13px',
            background: 'var(--bg-input)',
            color: 'var(--text-normal)',
            opacity: connecting || loadingAgents ? 0.6 : 1,
          }}
        >
          <option value="">选择网关...</option>
          {gateways.map(g => (
            <option key={g.id} value={g.id}>{g.name} ({g.id})</option>
          ))}
        </select>
        
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          disabled={!selectedGatewayId || loadingAgents}
          style={{
            flex: '1 1 100px',
            minWidth: '100px',
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '13px',
            background: 'var(--bg-input)',
            color: 'var(--text-normal)',
            opacity: !selectedGatewayId || loadingAgents ? 0.6 : 1,
          }}
        >
          <option value="">
            {loadingAgents ? '加载中...' : '选择 Agent...'}
          </option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>
              {a.identity?.name || a.name || a.id}
            </option>
          ))}
        </select>
        
        <input
          type="text"
          placeholder="显示名称"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{
            flex: '1 1 100px',
            minWidth: '100px',
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '13px',
            background: 'var(--bg-input)',
            color: 'var(--text-normal)',
          }}
        />
        
        <button
          onClick={addParticipant}
          disabled={!canAdd}
          style={{
            padding: '8px 16px',
            background: canAdd ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: canAdd ? 'white' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: canAdd ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
          }}
        >
          添加
        </button>
      </div>
    </div>
  );
};

export default CollaborationRoomForm;
