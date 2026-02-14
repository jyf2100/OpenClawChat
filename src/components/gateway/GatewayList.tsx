import React, { useState } from 'react';
import { GatewayCard } from './GatewayCard';
import { GatewayConfig } from '../../types';
import { useGatewayStore } from '../../stores/gatewayStore';
import { createPortal } from 'react-dom';

interface GatewayListProps {
  onEditGateway?: (gateway: GatewayConfig) => void;
  onAgentConfig?: (gateway: GatewayConfig) => void;
}

export const GatewayList: React.FC<GatewayListProps> = ({ onEditGateway, onAgentConfig }) => {
  const { gateways, removeGateway } = useGatewayStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingGateway, setDeletingGateway] = useState<GatewayConfig | null>(null);

  const handleDelete = (gateway: GatewayConfig) => {
    setDeletingGateway(gateway);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (deletingGateway) {
      try {
        await removeGateway(deletingGateway.id);
        console.log('[GatewayList] 网关已删除:', deletingGateway.id);
      } catch (error) {
        console.error('[GatewayList] 删除网关失败:', error);
      }
    }
    setShowDeleteConfirm(false);
    setDeletingGateway(null);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeletingGateway(null);
  };

  if (gateways.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <p className="text-lg font-medium mb-2">还没有网关</p>
        <p className="text-sm">点击下方按钮添加第一个网关</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {gateways.map((gateway) => (
          <GatewayCard
            key={gateway.id}
            gateway={gateway}
            onEdit={onEditGateway}
            onDelete={handleDelete}
            onAgentConfig={onAgentConfig}
          />
        ))}
      </div>

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
          onClick={cancelDelete}
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
              确定要删除网关 <span style={{ fontWeight: 600, color: 'var(--text-normal)' }}>{deletingGateway?.name}</span> 吗？
              <br />此操作无法撤销。
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelDelete}
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
                onClick={confirmDelete}
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
    </>
  );
};
