import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GatewayConfig, AgentsListResult, SessionsListResult, GatewayAgentRow, AgentConfig } from '../../types';
import { AgentFileEditor } from './AgentFileEditor';

interface AgentConfigPageProps {
  gateway: GatewayConfig;
  onBack: () => void;
  request: <T = any>(gatewayId: string, method: string, params?: any) => Promise<T>;
  getStatus: (gatewayId: string) => string;
  connect: (url: string, token: string, gatewayId: string) => Promise<void>;
}

export const AgentConfigPage: React.FC<AgentConfigPageProps> = ({
  gateway,
  onBack,
  request,
  getStatus,
  connect,
}) => {
  const [agents, setAgents] = useState<GatewayAgentRow[]>([]);
  const [defaultAgentId, setDefaultAgentId] = useState<string>(''); // 服务端的 defaultId
  const [serverDefaultModel, setServerDefaultModel] = useState<string>(''); // 服务端的默认模型
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [agentConfigs, setAgentConfigs] = useState<Record<string, AgentConfig>>({});

  // 使用 ref 防止重复执行
  const initializedRef = useRef(false);

  // 自动连接网关并加载 agent 列表（只执行一次）
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const ensureConnectedAndLoad = async () => {
      const status = getStatus(gateway.id);
      console.log('[AgentConfigPage] 网关状态:', gateway.id, status);

      if (status === 'connected') {
        // 已连接，直接加载
        setLoading(true);
        try {
          // 同时获取 agent 列表和默认模型配置
          const [agentsResult, sessionsResult] = await Promise.all([
            request<AgentsListResult>(gateway.id, 'agents.list', {}),
            request<SessionsListResult>(gateway.id, 'sessions.list', { limit: 1 }),
          ]);
          setAgents(agentsResult.agents || []);
          setDefaultAgentId(agentsResult.defaultId || agentsResult.mainKey || 'main');
          // 从服务端获取默认模型
          if (sessionsResult.defaults?.model) {
            setServerDefaultModel(sessionsResult.defaults.model);
          }
          console.log('[AgentConfigPage] 加载成功, agents:', agentsResult, 'defaults:', sessionsResult.defaults);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError(errorMsg);
          console.error('[AgentConfigPage] 加载 agent 列表失败:', err);
        } finally {
          setLoading(false);
        }
      } else if (status === 'disconnected' || status === 'error') {
        // 需要先连接
        if (!gateway.token) {
          setError('网关未配置 Token，无法连接');
          setLoading(false);
          return;
        }
        setConnecting(true);
        try {
          console.log('[AgentConfigPage] 正在连接网关:', gateway.id);
          await connect(gateway.url, gateway.token || '', gateway.id);
          // 等待连接状态更新
          await new Promise<void>((resolve) => {
            const check = () => {
              if (getStatus(gateway.id) === 'connected') {
                resolve();
              } else {
                setTimeout(check, 100);
              }
            };
            check();
          });
          console.log('[AgentConfigPage] 网关已连接');
          // 同时获取 agent 列表和默认模型配置
          const [agentsResult, sessionsResult] = await Promise.all([
            request<AgentsListResult>(gateway.id, 'agents.list', {}),
            request<SessionsListResult>(gateway.id, 'sessions.list', { limit: 1 }),
          ]);
          setAgents(agentsResult.agents || []);
          setDefaultAgentId(agentsResult.defaultId || agentsResult.mainKey || 'main');
          if (sessionsResult.defaults?.model) {
            setServerDefaultModel(sessionsResult.defaults.model);
          }
          console.log('[AgentConfigPage] 加载成功, defaults:', sessionsResult.defaults);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError(`连接失败: ${errorMsg}`);
          console.error('[AgentConfigPage] 连接网关失败:', err);
        } finally {
          setConnecting(false);
          setLoading(false);
        }
      } else if (status === 'connecting') {
        // 正在连接，等待连接完成
        setConnecting(true);
        await new Promise<void>((resolve) => {
          const check = () => {
            const currentStatus = getStatus(gateway.id);
            if (currentStatus === 'connected') {
              resolve();
            } else if (currentStatus === 'error' || currentStatus === 'disconnected') {
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        });
        setConnecting(false);
        const finalStatus = getStatus(gateway.id);
        if (finalStatus === 'connected') {
          try {
            const [agentsResult, sessionsResult] = await Promise.all([
              request<AgentsListResult>(gateway.id, 'agents.list', {}),
              request<SessionsListResult>(gateway.id, 'sessions.list', { limit: 1 }),
            ]);
            setAgents(agentsResult.agents || []);
            setDefaultAgentId(agentsResult.defaultId || agentsResult.mainKey || 'main');
            if (sessionsResult.defaults?.model) {
              setServerDefaultModel(sessionsResult.defaults.model);
            }
            console.log('[AgentConfigPage] 加载成功, defaults:', sessionsResult.defaults);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            setError(errorMsg);
            console.error('[AgentConfigPage] 加载 agent 列表失败:', err);
          }
        } else {
          setError('网关连接失败');
        }
        setLoading(false);
      }
    };

    ensureConnectedAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway.id]); // 只依赖 gateway.id，确保只在网关变化时执行

  // 初始化 agentConfigs（仅在 agents 变化时执行）
  const prevAgentsRef = useRef<GatewayAgentRow[]>([]);
  useEffect(() => {
    // 只在 agents 实际变化时才更新
    if (agents.length === 0 || prevAgentsRef.current === agents) return;
    prevAgentsRef.current = agents;

    // 合并已有的配置和 agent 列表
    const existingConfigs = gateway.agentConfigs || {};
    const newConfigs: Record<string, AgentConfig> = {};

    agents.forEach(agent => {
      newConfigs[agent.id] = existingConfigs[agent.id] || {
        agentId: agent.id,
        useDefaultModel: true,
      };
    });

    setAgentConfigs(newConfigs);
  }, [agents, gateway.agentConfigs]);

  const handleToggleExpand = useCallback((agentId: string) => {
    setExpandedAgentId(prev => prev === agentId ? null : agentId);
  }, []);

  const handleAgentConfigChange = useCallback((agentId: string, config: AgentConfig) => {
    setAgentConfigs(prev => ({
      ...prev,
      [agentId]: config,
    }));
  }, []);

  const getAgentModel = useCallback((agentId: string) => {
    const config = agentConfigs[agentId];
    const effectiveDefaultModel = serverDefaultModel || gateway.defaultModel || '未设置';
    if (!config) return effectiveDefaultModel;

    if (config.useDefaultModel !== false && !config.model) {
      return effectiveDefaultModel;
    }
    return config.model || effectiveDefaultModel;
  }, [agentConfigs, gateway.defaultModel, serverDefaultModel]);

  const getAgentName = useCallback((agent: GatewayAgentRow) => {
    return agent.name || agent.identity?.name || agent.id;
  }, []);

  if (loading || connecting) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 p-4 border-b border-gray-700">
          <button
            onClick={onBack}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-white">
            {gateway.name} - Agent 配置
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="flex items-center gap-2">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>{connecting ? '正在连接网关...' : '加载中...'}</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 p-4 border-b border-gray-700">
          <button
            onClick={onBack}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-white">
            {gateway.name} - Agent 配置
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={onBack}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-700">
        <button
          onClick={onBack}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-white">
          {gateway.name} - Agent 配置
        </h2>
      </div>

      {/* 网关默认模型提示 */}
      <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700">
        <span className="text-sm text-gray-400">网关默认模型: </span>
        <span className="text-sm font-medium text-white">
          {serverDefaultModel || gateway.defaultModel || '未设置'}
        </span>
        {serverDefaultModel && !gateway.defaultModel && (
          <span className="text-xs text-gray-500 ml-2">(来自服务端)</span>
        )}
      </div>

      {/* Agent 列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {agents.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <p>该网关没有 Agent</p>
          </div>
        ) : (
          agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden"
            >
              {/* Agent 头部 */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-700/30 transition-colors"
                onClick={() => handleToggleExpand(agent.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <div>
                    <span className="text-white font-medium">{getAgentName(agent)}</span>
                    <div className="text-sm text-gray-400">
                      模型: {getAgentModel(agent.id)}
                      {agentConfigs[agent.id]?.useDefaultModel !== false && !agentConfigs[agent.id]?.model && (
                        <span className="text-gray-500 ml-1">(跟随网关)</span>
                      )}
                    </div>
                  </div>
                </div>
                <button className="text-gray-400 hover:text-white transition-colors">
                  <svg
                    className={`w-5 h-5 transform transition-transform ${
                      expandedAgentId === agent.id ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Agent 配置详情（展开时显示） */}
              {expandedAgentId === agent.id && (
                <div className="border-t border-gray-700">
                  <AgentFileEditor
                    gatewayId={gateway.id}
                    agentId={defaultAgentId || agent.id}
                    agentConfig={agentConfigs[agent.id] || { agentId: agent.id, useDefaultModel: true }}
                    defaultModel={serverDefaultModel || gateway.defaultModel}
                    request={request}
                    onConfigChange={(config) => handleAgentConfigChange(agent.id, config)}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
