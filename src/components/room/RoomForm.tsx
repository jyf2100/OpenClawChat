/**
 * 创建房间表单组件
 * 用于创建多网关群聊房间
 */

import React, { useState } from 'react';
import { GatewayConfig } from '../../types';
import { useRoomStore } from '../../stores/roomStore';
import { nanoid } from 'nanoid';

interface RoomFormProps {
  availableGateways: GatewayConfig[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface RoomFormData {
  name: string;
  description: string;
  selectedGateways: string[];
  type: 'channel' | 'private' | 'group';
}

export const RoomForm: React.FC<RoomFormProps> = ({
  availableGateways,
  onSuccess,
  onCancel,
}) => {
  const { addRoom } = useRoomStore();
  const [formData, setFormData] = useState<RoomFormData>({
    name: '',
    description: '',
    selectedGateways: [],
    type: 'group',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RoomFormData, string>>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof RoomFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = '请输入房间名称';
    } else if (formData.name.length < 2 || formData.name.length > 50) {
      newErrors.name = '房间名称长度必须在2-50个字符之间';
    }

    if (formData.selectedGateways.length === 0) {
      newErrors.selectedGateways = '请至少选择一个网关';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // 使用第一个选中的网关作为 gatewayId
    const primaryGatewayId = formData.selectedGateways[0];

    // 创建房间
    addRoom({
      id: `${primaryGatewayId}:${nanoid()}`,
      gatewayId: primaryGatewayId,
      name: formData.name.trim(),
      type: formData.type,
      unreadCount: 0,
      members: formData.selectedGateways,
    });

    // 重置表单
    setFormData({
      name: '',
      description: '',
      selectedGateways: [],
      type: 'group',
    });
    setErrors({});

    onSuccess?.();
  };

  const handleCancel = () => {
    setFormData({
      name: '',
      description: '',
      selectedGateways: [],
      type: 'group',
    });
    setErrors({});
    onCancel?.();
  };

  const toggleGateway = (gatewayId: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedGateways: prev.selectedGateways.includes(gatewayId)
        ? prev.selectedGateways.filter((id) => id !== gatewayId)
        : [...prev.selectedGateways, gatewayId],
    }));
    // 清除错误
    if (errors.selectedGateways) {
      setErrors((prev) => ({ ...prev, selectedGateways: undefined }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          创建多网关房间
        </h3>
      </div>

      {/* 房间名称 */}
      <div>
        <label htmlFor="room-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          房间名称 <span className="text-red-500">*</span>
        </label>
        <input
          id="room-name"
          type="text"
          value={formData.name}
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, name: e.target.value }));
            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder="输入房间名称"
          maxLength={50}
          className={`
            w-full px-3 py-2 rounded-lg border
            focus:outline-none focus:ring-2 focus:ring-indigo-500
            dark:bg-gray-800 dark:border-gray-700
            ${errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}
          `}
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-500">{errors.name}</p>
        )}
      </div>

      {/* 房间描述 */}
      <div>
        <label htmlFor="room-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          房间描述（可选）
        </label>
        <textarea
          id="room-description"
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="描述这个房间的用途..."
          rows={3}
          maxLength={200}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>

      {/* 房间类型 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          房间类型
        </label>
        <div className="flex gap-4">
          {(['channel', 'private', 'group'] as const).map((type) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="room-type"
                value={type}
                checked={formData.type === type}
                onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value as any }))}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                {type === 'channel' ? '频道' : type === 'private' ? '私聊' : '群组'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 选择网关 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          选择网关 <span className="text-red-500">*</span>
        </label>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {availableGateways.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              暂无可用网关
            </p>
          ) : (
            availableGateways.map((gateway) => (
              <label
                key={gateway.id}
                className={`
                  flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                  ${formData.selectedGateways.includes(gateway.id)
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-500'
                    : 'bg-gray-50 dark:bg-gray-800 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}
              >
                <input
                  type="checkbox"
                  checked={formData.selectedGateways.includes(gateway.id)}
                  onChange={() => toggleGateway(gateway.id)}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">{gateway.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{gateway.url}</p>
                </div>
                <div className={`
                  w-2 h-2 rounded-full
                  ${gateway.status === 'connected' ? 'bg-green-500' : 'bg-gray-400'}
                `} />
              </label>
            ))
          )}
        </div>
        {errors.selectedGateways && (
          <p className="mt-1 text-sm text-red-500">{errors.selectedGateways}</p>
        )}
      </div>

      {/* 已选择的网关数量 */}
      {formData.selectedGateways.length > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3">
          <p className="text-sm text-indigo-700 dark:text-indigo-300">
            已选择 {formData.selectedGateways.length} 个网关
          </p>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={availableGateways.length === 0}
          className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          创建房间
        </button>
      </div>
    </form>
  );
};

export default RoomForm;
