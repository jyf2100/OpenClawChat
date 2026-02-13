import React from 'react';
import { useCollaborationStore } from '../../stores/collaborationStore';
import { useCollaborationQueueStore } from '../../stores/collaborationQueueStore';

interface CollaborationStatusIndicatorProps {
  roomId: string;
  onCancel?: (sessionId: string) => void;
}

export const CollaborationStatusIndicator: React.FC<CollaborationStatusIndicatorProps> = ({
  roomId,
  onCancel,
}) => {
  const { getActiveSessionByRoom } = useCollaborationStore();
  const { getQueueLength } = useCollaborationQueueStore();
  
  const session = getActiveSessionByRoom(roomId);
  const queueLength = getQueueLength(roomId);
  
  if (!session) return null;
  
  const currentParticipant = session.participants[session.currentStep];
  const completedCount = session.completedSteps.length;
  const totalCount = session.participants.length;
  const failedCount = Object.keys(session.failedSteps).length;
  
  return (
    <div
      style={{
        padding: '10px 16px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            background: 'rgba(0, 132, 255, 0.1)',
            borderRadius: '12px',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              background: 'var(--accent)',
              borderRadius: '50%',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--accent)' }}>
            协作中
          </span>
        </div>
        
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {currentParticipant?.name} ({completedCount}/{totalCount})
        </span>
        
        {failedCount > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--warning)' }}>
            {failedCount} 失败
          </span>
        )}
        
        {queueLength > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            队列: {queueLength}
          </span>
        )}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '3px' }}>
          {session.participants.map((p, index) => {
            const isCompleted = session.completedSteps.includes(index);
            const isCurrent = index === session.currentStep;
            const isFailed = session.failedSteps[index] !== undefined;
            
            return (
              <div
                key={index}
                style={{
                  width: '22px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  fontSize: '10px',
                  fontWeight: 600,
                  background: isFailed 
                    ? 'var(--danger)' 
                    : isCompleted 
                      ? 'var(--success)' 
                      : isCurrent 
                        ? p.color || 'var(--accent)'
                        : 'var(--bg-tertiary)',
                  color: isCompleted || isCurrent || isFailed ? 'white' : 'var(--text-muted)',
                  border: isCurrent ? '2px solid var(--accent)' : 'none',
                  animation: isCurrent ? 'pulse 1.5s ease-in-out infinite' : 'none',
                }}
                title={p.name}
              >
                {isCompleted ? '✓' : isFailed ? '!' : p.order}
              </div>
            );
          })}
        </div>
        
        {onCancel && (
          <button
            onClick={() => onCancel(session.sessionId)}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              border: '1px solid var(--danger)',
              background: 'transparent',
              color: 'var(--danger)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
};

export default CollaborationStatusIndicator;
