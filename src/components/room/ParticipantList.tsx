/**
 * 参与者列表组件
 * 显示房间内的所有参与者（网关）
 */

import React from 'react';
import { GatewayConfig } from '../../types';

interface ParticipantListProps {
  participants: string[];
  availableGateways: GatewayConfig[];
  onRemove?: (gatewayId: string) => void;
}

export const ParticipantList: React.FC<ParticipantListProps> = ({
  participants,
  availableGateways,
  onRemove,
}) => {
  // 获取参与者详细信息
  const participantDetails = React.useMemo(() => {
    return participants.map((gatewayId) => {
      const gateway = availableGateways.find((g) => g.id === gatewayId);
      return {
        id: gatewayId,
        name: gateway?.name || gatewayId,
        status: gateway?.status || 'disconnected',
        url: gateway?.url,
      };
    });
  }, [participants, availableGateways]);

  // 分组：在线和离线
  const onlineParticipants = participantDetails.filter((p) => p.status === 'connected');
  const offlineParticipants = participantDetails.filter((p) => p.status !== 'connected');

  if (participantDetails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
        <p className="text-sm text-gray-500 dark:text-gray-400">暂无参与者</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 统计信息 */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            共 {participantDetails.length} 个参与者
          </span>
          <span className="text-green-600 dark:text-green-400">
            {onlineParticipants.length} 在线
          </span>
        </div>
      </div>

      {/* 参与者列表 */}
      <div className="flex-1 overflow-y-auto">
        {/* 在线参与者 */}
        {onlineParticipants.length > 0 && (
          <div className="p-2">
            <h4 className="px-2 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
              在线
            </h4>
            <div className="space-y-1">
              {onlineParticipants.map((participant) => (
                <ParticipantItem
                  key={participant.id}
                  participant={participant}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </div>
        )}

        {/* 离线参与者 */}
        {offlineParticipants.length > 0 && (
          <div className="p-2">
            <h4 className="px-2 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
              离线
            </h4>
            <div className="space-y-1">
              {offlineParticipants.map((participant) => (
                <ParticipantItem
                  key={participant.id}
                  participant={participant}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface ParticipantItemProps {
  participant: {
    id: string;
    name: string;
    status: string;
    url?: string;
  };
  onRemove?: (id: string) => void;
}

const ParticipantItem: React.FC<ParticipantItemProps> = ({ participant, onRemove }) => {
  const isOnline = participant.status === 'connected';

  return (
    <div
      className={`
        group flex items-center gap-3 p-2 rounded-lg
        ${isOnline ? 'bg-green-50 dark:bg-green-900/10' : 'bg-gray-50 dark:bg-gray-800'}
      `}
    >
      {/* 头像 */}
      <div className={`
        relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
        ${isOnline ? 'bg-green-500' : 'bg-gray-400'}
      `}>
        <span className="text-white text-xs font-medium">
          {participant.name.charAt(0).toUpperCase()}
        </span>
        {/* 在线指示器 */}
        <div className={`
          absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800
          ${isOnline ? 'bg-green-500' : 'bg-gray-400'}
        `} />
      </div>

      {/* 信息 */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
          {participant.name}
        </p>
        {participant.url && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {participant.url}
          </p>
        )}
      </div>

      {/* 状态标签 */}
      <span className={`
        px-2 py-1 rounded-full text-xs font-medium
        ${isOnline
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
        }
      `}>
        {isOnline ? '在线' : '离线'}
      </span>

      {/* 移除按钮 */}
      {onRemove && (
        <button
          onClick={() => onRemove(participant.id)}
          className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-opacity"
          title="移除参与者"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ParticipantList;
