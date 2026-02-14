import React, { useState, useEffect, useCallback } from 'react';
import { AgentConfig, AgentFileConfig } from '../../types';

interface AgentFileEditorProps {
  gatewayId: string;
  agentId: string;
  agentConfig: AgentConfig;
  defaultModel?: string;
  request: <T = any>(gatewayId: string, method: string, params?: any) => Promise<T>;
  onConfigChange: (config: AgentConfig) => void;
}

// 文件配置项定义
const FILE_CONFIGS = [
  { key: 'soulMd' as const, name: 'SOUL.md', label: '人格定义', description: '定义 Agent 的核心人格和行为准则' },
  { key: 'agentsMd' as const, name: 'AGENTS.md', label: '工作区指令', description: '工作区级别的指令和规则' },
  { key: 'userMd' as const, name: 'USER.md', label: '用户档案', description: '用户偏好和档案信息' },
  { key: 'toolsMd' as const, name: 'TOOLS.md', label: '工具配置', description: 'Agent 可用的工具配置' },
  { key: 'heartbeatMd' as const, name: 'HEARTBEAT.md', label: '心跳任务', description: '定时执行的心跳任务' },
];

export const AgentFileEditor: React.FC<AgentFileEditorProps> = ({
  gatewayId,
  agentId,
  agentConfig,
  defaultModel,
  request,
  onConfigChange,
}) => {
  const [useDefaultModel, setUseDefaultModel] = useState(agentConfig.useDefaultModel !== false);
  const [customModel, setCustomModel] = useState(agentConfig.model || '');
  const [files, setFiles] = useState<AgentFileConfig>(agentConfig.files || {});
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 同步配置到父组件（仅在状态变化时同步，不在挂载时）
  const prevConfigRef = React.useRef<AgentConfig | null>(null);

  useEffect(() => {
    const newConfig: AgentConfig = {
      agentId,
      useDefaultModel,
      model: useDefaultModel ? undefined : customModel,
      files,
    };

    // 只在配置实际变化时才调用 onConfigChange
    if (prevConfigRef.current &&
        (prevConfigRef.current.useDefaultModel !== newConfig.useDefaultModel ||
         prevConfigRef.current.model !== newConfig.model ||
         JSON.stringify(prevConfigRef.current.files) !== JSON.stringify(newConfig.files))) {
      onConfigChange(newConfig);
    }
    prevConfigRef.current = newConfig;
  }, [useDefaultModel, customModel, files, agentId, onConfigChange]);

  // 显示状态消息
  const showStatus = useCallback((type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 3000);
  }, []);

  // 从服务端加载所有文件
  const handleLoadFromServer = useCallback(async () => {
    setLoading(true);
    setStatusMessage(null);

    try {
      const newFiles: AgentFileConfig = {};

      for (const fileConfig of FILE_CONFIGS) {
        try {
          const result = await request<{ file?: { content?: string }; content?: string }>(gatewayId, 'agents.files.get', {
            agentId,
            name: fileConfig.name,
          });
          // 内容在 result.file.content 或 result.content 中
          const content = result?.file?.content || result?.content || '';
          if (content) {
            newFiles[fileConfig.key] = content;
          }
        } catch (err) {
          // 文件不存在时忽略错误
          console.log(`[AgentFileEditor] 文件 ${fileConfig.name} 不存在或加载失败:`, err);
        }
      }

      setFiles(newFiles);
      showStatus('success', '已从服务端加载配置');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showStatus('error', `加载失败: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }, [gatewayId, agentId, request, showStatus]);

  // 推送所有文件到服务端
  const handlePushToServer = useCallback(async () => {
    setSaving(true);
    setStatusMessage(null);

    try {
      // 只推送有内容的文件
      for (const fileConfig of FILE_CONFIGS) {
        const content = files[fileConfig.key];
        if (content !== undefined && content !== '') {
          await request(gatewayId, 'agents.files.set', {
            agentId,
            name: fileConfig.name,
            content,
          });
        }
      }

      showStatus('success', '配置已推送到服务端');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showStatus('error', `推送失败: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  }, [gatewayId, agentId, files, request, showStatus]);

  // 处理文件内容变化
  const handleFileChange = useCallback((key: keyof AgentFileConfig, content: string) => {
    setFiles(prev => ({
      ...prev,
      [key]: content,
    }));
  }, []);

  // 处理模型设置变化
  const handleUseDefaultModelChange = useCallback((value: boolean) => {
    setUseDefaultModel(value);
    if (value) {
      setCustomModel('');
    }
  }, []);

  return (
    <div className="p-4 space-y-4">
      {/* 模型设置 */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300">模型设置</h4>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`model-${agentId}`}
              checked={useDefaultModel}
              onChange={() => handleUseDefaultModelChange(true)}
              className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">
              跟随网关默认 {defaultModel && `(${defaultModel})`}
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`model-${agentId}`}
              checked={!useDefaultModel}
              onChange={() => handleUseDefaultModelChange(false)}
              className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">自定义:</span>
            <input
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              disabled={useDefaultModel}
              placeholder="例如: claude-opus-4"
              className={`flex-1 px-2 py-1 text-sm bg-gray-800 border rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                useDefaultModel ? 'border-gray-700 opacity-50 cursor-not-allowed' : 'border-gray-600'
              }`}
            />
          </label>
        </div>
      </div>

      {/* 文件配置 */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300">文件配置</h4>
        <div className="space-y-1">
          {FILE_CONFIGS.map((fileConfig) => (
            <div key={fileConfig.key} className="border border-gray-700 rounded-md overflow-hidden">
              {/* 文件头部 */}
              <div
                className="flex items-center justify-between px-3 py-2 bg-gray-800/50 cursor-pointer hover:bg-gray-700/50 transition-colors"
                onClick={() => setExpandedFile(expandedFile === fileConfig.key ? null : fileConfig.key)}
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`w-4 h-4 text-gray-400 transform transition-transform ${
                      expandedFile === fileConfig.key ? 'rotate-90' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-sm font-medium text-white">{fileConfig.name}</span>
                  <span className="text-xs text-gray-500">({fileConfig.label})</span>
                </div>
                {files[fileConfig.key] && (
                  <span className="text-xs text-green-400">已配置</span>
                )}
              </div>

              {/* 文件内容编辑器 */}
              {expandedFile === fileConfig.key && (
                <div className="p-3 border-t border-gray-700">
                  <p className="text-xs text-gray-500 mb-2">{fileConfig.description}</p>
                  <textarea
                    value={files[fileConfig.key] || ''}
                    onChange={(e) => handleFileChange(fileConfig.key, e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    placeholder={`输入 ${fileConfig.name} 内容...`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 状态消息 */}
      {statusMessage && (
        <div className={`p-3 rounded-md text-sm ${
          statusMessage.type === 'success'
            ? 'bg-green-500/10 text-green-400 border border-green-500/30'
            : 'bg-red-500/10 text-red-400 border border-red-500/30'
        }`}>
          {statusMessage.text}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleLoadFromServer}
          disabled={loading || saving}
          className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading && (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {loading ? '加载中...' : '从服务端加载'}
        </button>
        <button
          onClick={handlePushToServer}
          disabled={loading || saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving && (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {saving ? '推送中...' : '推送到服务端'}
        </button>
      </div>
    </div>
  );
};
