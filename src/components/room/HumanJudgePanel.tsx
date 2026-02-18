/**
 * 人工裁判决策面板
 * 在协作每轮结束后显示，让用户决定是否继续下一轮
 */

import React, { useState, useCallback } from 'react';
import { useCollaborationStore } from '../../stores/collaborationStore';

interface HumanJudgePanelProps {
  sessionId: string;
  onContinue: (guidance?: string) => void;
  onComplete: () => void;
}

export const HumanJudgePanel: React.FC<HumanJudgePanelProps> = ({
  sessionId,
  onContinue,
  onComplete,
}) => {
  const { getSession } = useCollaborationStore();
  const [guidance, setGuidance] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const session = getSession(sessionId);

  if (!session) {
    return null;
  }

  const handleContinue = useCallback(async () => {
    setIsLoading(true);
    try {
      onContinue(guidance.trim() || undefined);
      setGuidance('');
    } finally {
      setIsLoading(false);
    }
  }, [onContinue, guidance]);

  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleContinue();
    }
  }, [handleContinue]);

  return (
    <div
      style={{
        padding: '16px 20px',
        backgroundColor: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1))',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(147, 51, 234, 0.08))',
        borderTop: '1px solid rgba(59, 130, 246, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '18px' }}>🎯</span>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-normal)' }}>
          第 {session.currentRound} 轮完成 - 请决定下一步
        </span>
        <span style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          padding: '2px 6px',
          background: 'var(--bg-secondary)',
          borderRadius: '4px',
        }}>
          最大 {session.maxRounds} 轮
        </span>
      </div>

      {/* 指导输入 */}
      <div>
        <label style={{
          display: 'block',
          fontSize: '12px',
          color: 'var(--text-muted)',
          marginBottom: '4px',
        }}>
          下轮指导（可选）
        </label>
        <input
          type="text"
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="给下一轮的指导建议..."
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '13px',
            background: 'var(--bg-input)',
            color: 'var(--text-normal)',
            opacity: isLoading ? 0.6 : 1,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={handleComplete}
          disabled={isLoading}
          style={{
            padding: '8px 16px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            background: 'var(--bg-floating)',
            color: 'var(--text-normal)',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🏁</span>
          <span>完成协作</span>
        </button>
        <button
          onClick={handleContinue}
          disabled={isLoading || session.currentRound >= session.maxRounds}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            background: session.currentRound >= session.maxRounds ? 'var(--bg-tertiary)' : 'var(--accent)',
            color: 'white',
            cursor: isLoading || session.currentRound >= session.maxRounds ? 'not-allowed' : 'pointer',
            opacity: isLoading || session.currentRound >= session.maxRounds ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>{isLoading ? '⏳' : '▶️'}</span>
          <span>
            {session.currentRound >= session.maxRounds
              ? '已达最大轮次'
              : '继续下一轮'}
          </span>
        </button>
      </div>

      {/* 提示信息 */}
      {session.currentRound >= session.maxRounds && (
        <div style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          padding: '6px 10px',
          background: 'rgba(250, 62, 62, 0.1)',
          borderRadius: '4px',
        }}>
          已达到最大轮次限制（{session.maxRounds} 轮），请完成协作。
        </div>
      )}
    </div>
  );
};

export default HumanJudgePanel;
