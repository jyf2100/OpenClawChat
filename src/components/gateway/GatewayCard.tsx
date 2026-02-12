import React from 'react';
import { GatewayConfig, GatewayStatus } from '../../types';
import { useGatewayStore } from '../../stores/gatewayStore';

interface GatewayCardProps {
  gateway: GatewayConfig;
  onEdit?: (gateway: GatewayConfig) => void;
  onDelete?: (gateway: GatewayConfig) => void;
}

const statusConfig = {
  [GatewayStatus.Disconnected]: {
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
    dotColor: 'bg-gray-400',
    label: '未连接',
  },
  [GatewayStatus.Connecting]: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    dotColor: 'bg-yellow-400',
    label: '连接中',
  },
  [GatewayStatus.Connected]: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    dotColor: 'bg-green-400',
    label: '已连接',
  },
  [GatewayStatus.Error]: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    dotColor: 'bg-red-400',
    label: '错误',
  },
};

export const GatewayCard: React.FC<GatewayCardProps> = ({
  gateway,
  onEdit,
  onDelete,
}) => {
  const { updateGateway, setActiveGateway, activeGatewayId } = useGatewayStore();
  const isActive = activeGatewayId === gateway.id;
  const config = statusConfig[gateway.status];

  const handleConnect = async () => {
    if (gateway.status === GatewayStatus.Connected) {
      updateGateway(gateway.id, { status: GatewayStatus.Disconnected });
    } else {
      updateGateway(gateway.id, { status: GatewayStatus.Connecting });
      try {
        // 模拟连接过程
        await new Promise(resolve => setTimeout(resolve, 1000));
        updateGateway(gateway.id, { status: GatewayStatus.Connected });
      } catch (error) {
        updateGateway(gateway.id, { status: GatewayStatus.Error });
        // 可以在这里触发错误提示
        console.error('网关连接失败:', error);
      }
    }
  };

  const handleSetActive = () => {
    setActiveGateway(gateway.id);
  };

  return (
    <div
      className={`
        relative p-4 rounded-lg border-2 transition-all duration-200
        ${isActive ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'}
      `}
    >
      {/* 状态指示器 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${config.dotColor} ${
            gateway.status === GatewayStatus.Connecting ? 'animate-pulse' : ''
          } ${
            gateway.status === GatewayStatus.Connected ? 'gateway-status-indicator connected' : ''
          }`} />
          <span className={`text-sm font-medium ${config.color}`}>
            {config.label}
          </span>
        </div>
        {gateway.autoConnect && (
          <span className="text-xs text-gray-400">自动连接</span>
        )}
      </div>

      {/* 网关信息 */}
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-white mb-1">
          {gateway.name}
        </h3>
        <p className="text-sm text-gray-400 truncate">{gateway.url}</p>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        {!isActive && (
          <button
            onClick={handleSetActive}
            className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            设为活跃
          </button>
        )}
        <button
          onClick={handleConnect}
          className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            gateway.status === GatewayStatus.Connected
              ? 'text-white bg-red-600 hover:bg-red-700'
              : 'text-white bg-green-600 hover:bg-green-700'
          }`}
          disabled={gateway.status === GatewayStatus.Connecting}
        >
          {gateway.status === GatewayStatus.Connecting
            ? '连接中...'
            : gateway.status === GatewayStatus.Connected
            ? '断开'
            : '连接'}
        </button>
        {onEdit && (
          <button
            onClick={() => onEdit(gateway)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
            title="编辑"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(gateway)}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-md transition-colors"
            title="删除"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
