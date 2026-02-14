import React, { useState } from 'react';
import { GatewayConfig, GatewayStatus } from '../../types';
import { useGatewayStore } from '../../stores/gatewayStore';
import { generateUUID } from '../../lib/protocol';

interface GatewayFormProps {
  gateway?: GatewayConfig;
  onCancel?: () => void;
  onSave?: () => void;
}

export const GatewayForm: React.FC<GatewayFormProps> = ({
  gateway,
  onCancel,
  onSave,
}) => {
  const { addGateway, updateGateway } = useGatewayStore();
  const [formData, setFormData] = useState({
    name: gateway?.name || '',
    url: gateway?.url || 'ws://127.0.0.1:18789',
    token: gateway?.token || '',
    autoConnect: gateway?.autoConnect || false,
    defaultModel: gateway?.defaultModel || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = '请输入网关名称';
    } else {
      // 重名校验
      const gateways = useGatewayStore.getState().gateways;
      const isDuplicate = gateways.some(g => 
        g.name.toLowerCase() === formData.name.trim().toLowerCase() && 
        g.id !== gateway?.id
      );
      if (isDuplicate) {
        newErrors.name = '该网关名称已存在，请使用其他名称';
      }
    }

    if (!formData.url.trim()) {
      newErrors.url = '请输入网关地址';
    } else {
      try {
        new URL(formData.url);
      } catch {
        newErrors.url = '请输入有效的 URL 地址';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const gatewayData: GatewayConfig = {
        id: gateway?.id || generateUUID(),
        name: formData.name.trim(),
        url: formData.url.trim(),
        token: formData.token.trim() || undefined,
        status: gateway?.status || GatewayStatus.Disconnected,
        autoConnect: formData.autoConnect,
        defaultModel: formData.defaultModel.trim() || undefined,
      };

      if (gateway) {
        // 更新网关时，调用 store 的 updateGateway
        // 注意：store 的 updateGateway 只需要传入更新的字段
        await updateGateway(gateway.id, gatewayData);
      } else {
        await addGateway(gatewayData);
      }

      onSave?.();
    } catch (error) {
      console.error('保存网关失败:', error);
      setErrors({ ...errors, submit: '保存失败，请重试' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    // 清除对应字段的错误
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
          网关名称 *
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className={`w-full px-3 py-2 bg-gray-800 border rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.name ? 'border-red-500' : 'border-gray-700'
          }`}
          placeholder="例如: 本地 OpenClaw"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-400">{errors.name}</p>
        )}
      </div>

      <div>
        <label htmlFor="url" className="block text-sm font-medium text-gray-300 mb-1">
          网关地址 *
        </label>
        <input
          type="text"
          id="url"
          name="url"
          value={formData.url}
          onChange={handleChange}
          className={`w-full px-3 py-2 bg-gray-800 border rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.url ? 'border-red-500' : 'border-gray-700'
          }`}
          placeholder="ws://127.0.0.1:18789"
        />
        {errors.url && (
          <p className="mt-1 text-sm text-red-400">{errors.url}</p>
        )}
      </div>

      <div>
        <label htmlFor="token" className="block text-sm font-medium text-gray-300 mb-1">
          认证令牌（可选）
        </label>
        <textarea
          id="token"
          name="token"
          value={formData.token}
          onChange={handleChange}
          rows={3}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="输入认证令牌..."
        />
        <p className="mt-1 text-sm text-gray-500">
          如果网关需要认证，请输入令牌
        </p>
      </div>

      <div>
        <label htmlFor="defaultModel" className="block text-sm font-medium text-gray-300 mb-1">
          默认模型（可选）
        </label>
        <input
          type="text"
          id="defaultModel"
          name="defaultModel"
          value={formData.defaultModel}
          onChange={handleChange}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例如: claude-sonnet-4"
        />
        <p className="mt-1 text-sm text-gray-500">
          该网关下 Agent 的默认模型，Agent 可单独覆盖
        </p>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="autoConnect"
          name="autoConnect"
          checked={formData.autoConnect}
          onChange={handleChange}
          className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-700 rounded focus:ring-2 focus:ring-blue-500"
        />
        <label htmlFor="autoConnect" className="ml-2 text-sm text-gray-300">
          自动连接
        </label>
      </div>

      {errors.submit && (
        <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-md">
          <p className="text-sm text-red-400">{errors.submit}</p>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? '保存中...' : gateway ? '保存' : '添加'}
        </button>
      </div>
    </form>
  );
};
