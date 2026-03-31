import React, { useEffect, useState } from 'react';
import { useGatewayStore } from '../../stores/gatewayStore';
import { useRoomStore } from '../../stores/roomStore';
import { getMessageImportStatus, triggerMessageImport, validateRoomMessagesAgainstDb, type MessageImportStatus } from '../../lib/storage';
import { useTemplateStore } from '../../stores/templateStore';

interface ConfigHomePageProps {
  onOpenTemplates: () => void;
  onOpenAgents: () => void;
  onOpenSync: () => void;
}

export const ConfigHomePage: React.FC<ConfigHomePageProps> = ({
  onOpenTemplates,
  onOpenAgents,
  onOpenSync,
}) => {
  const gateways = useGatewayStore((state) => state.gateways);
  const activeGatewayId = useGatewayStore((state) => state.activeGatewayId);
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const templates = useTemplateStore((state) => state.templates);
  const [messageImportStatus, setMessageImportStatus] = useState<MessageImportStatus>(() => getMessageImportStatus());
  const [messageValidationSummary, setMessageValidationSummary] = useState<string>('');
  const configuredAgentCount = gateways.reduce((count, gateway) => {
    return count + Object.keys(gateway.agentConfigs || {}).length;
  }, 0);
  const connectedGatewayCount = gateways.filter((gateway) => gateway.status === 'connected').length;
  const recentTemplates = [...templates]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3);
  const activeGateway = gateways.find((gateway) => gateway.id === activeGatewayId) || gateways[0] || null;
  const recentAgentEntry = gateways
    .flatMap((gateway) =>
      Object.entries(gateway.agentConfigs || {}).map(([agentId, config]) => ({
        gatewayName: gateway.name,
        gatewayId: gateway.id,
        agentId,
        templateAppliedAt: config.templateAppliedAt || 0,
      })),
    )
    .sort((a, b) => b.templateAppliedAt - a.templateAppliedAt)[0];
  const nextAction = templates.length === 0
    ? {
        title: '先创建一组模板',
        detail: '模板还是空的，先搭基线，后面 Agent 才能快速绑定。',
        cta: '去模板工作台',
        action: onOpenTemplates,
      }
    : configuredAgentCount === 0
      ? {
          title: '把模板绑定到 Agent',
          detail: '你已经有模板资产了，下一步应该把它们映射到具体 Agent。',
          cta: '去 Agent 配置',
          action: onOpenAgents,
        }
      : connectedGatewayCount === 0
        ? {
            title: '先读取远端状态',
            detail: '本地配置已经有了，但还没连上可同步的网关，先检查同步目标。',
            cta: '去网关同步',
            action: onOpenSync,
          }
        : {
            title: '继续推进当前配置流',
            detail: '本地模板、Agent 映射和网关都已经准备好，适合直接做差异确认和推送。',
            cta: '打开网关同步',
            action: onOpenSync,
          };

  const actionCards = [
    {
      label: '模板资产',
      title: '整理模板库',
      detail: '创建、复制、生成模板，统一维护 SOUL.md / TOOLS.md 基线。',
      meta: `${templates.length} 个模板`,
      action: onOpenTemplates,
      cta: '进入模板工作台',
    },
    {
      label: 'Agent 映射',
      title: '绑定到具体 Agent',
      detail: '选择网关与 Agent，把模板真正映射到运行身份，再按需做本地差异化。',
      meta: `${configuredAgentCount} 个 Agent 已配置`,
      action: onOpenAgents,
      cta: '进入 Agent 配置',
    },
    {
      label: '远端同步',
      title: '确认差异再推送',
      detail: '读取远端文件、核对块级差异、确认影响范围后再写入网关。',
      meta: `${connectedGatewayCount}/${gateways.length} 个网关在线`,
      action: onOpenSync,
      cta: '进入网关同步',
    },
  ];
  const workflowSteps = [
    {
      step: '01',
      title: '先选模板',
      detail: templates.length > 0 ? `当前已有 ${templates.length} 个模板，可继续优化复用。` : '当前还没有模板，建议先创建第一批模板。',
      done: templates.length > 0,
    },
    {
      step: '02',
      title: '再进 Agent',
      detail: configuredAgentCount > 0 ? `已有 ${configuredAgentCount} 个 Agent 本地配置。` : '还没有 Agent 绑定关系，下一步应建立模板映射。',
      done: configuredAgentCount > 0,
    },
    {
      step: '03',
      title: '最后同步',
      detail: connectedGatewayCount > 0 ? `当前有 ${connectedGatewayCount} 个网关在线，可继续做差异确认。` : '还没有在线网关，先连通同步目标。',
      done: connectedGatewayCount > 0,
    },
  ];

  useEffect(() => {
    setMessageImportStatus(getMessageImportStatus());
    const timer = window.setInterval(() => {
      setMessageImportStatus(getMessageImportStatus());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleValidateActiveRoom = async () => {
    if (!activeRoomId) {
      setMessageValidationSummary('当前没有活跃房间');
      return;
    }

    const report = await validateRoomMessagesAgainstDb(activeRoomId);
    setMessageValidationSummary(
      `房间 ${activeRoomId}：源 ${report.expected_count} / DB ${report.db_count} / 缺失 ${report.missing_ids.length} / 额外 ${report.extra_ids.length} / 不一致 ${report.mismatched_ids.length}`,
    );
  };

  return (
    <div className="studio-page">
      <section className="studio-home-intro">
        <div className="studio-shell-label">配置中心</div>
        <div className="studio-title mt-3">配置首页</div>
        <div className="studio-subtitle mt-3 studio-home-summary">
          这里只回答一个问题：你现在下一步要去哪一站工作。模板、Agent、同步三条主线足够，其它信息退到辅助层。
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={nextAction.action} className="studio-primary-btn">
            {nextAction.cta}
          </button>
          {recentAgentEntry && (
            <button type="button" onClick={onOpenAgents} className="studio-secondary-btn">
              继续上次 Agent
            </button>
          )}
          <button type="button" onClick={onOpenSync} className="studio-secondary-btn">
            查看同步队列
          </button>
        </div>
      </section>

      <section className="studio-section-card mt-5">
        <div className="studio-shell-label">主入口</div>
        <div className="studio-strong mt-3 text-lg font-semibold">从任务进入，不从看板猜测</div>
        <div className="mt-4 space-y-1">
          {actionCards.map((card) => (
            <button key={card.label} type="button" onClick={card.action} className="studio-entry-row">
              <div className="min-w-0">
                <div className="studio-strong text-sm font-semibold">{card.title}</div>
                <div className="studio-muted mt-1 text-xs leading-6">{card.detail}</div>
              </div>
              <div className="studio-entry-row-meta">
                <span className="studio-chip">{card.meta}</span>
                <span className="studio-entry-link">{card.cta}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="studio-surface-card">
          <div className="studio-shell-label">推荐下一步</div>
          <div className="studio-strong mt-3 text-lg font-semibold">{nextAction.title}</div>
          <div className="studio-subtitle mt-2">{nextAction.detail}</div>
          <div className="mt-4 space-y-3">
            {workflowSteps.map((step) => (
              <div key={step.step} className={`studio-flow-step ${step.done ? 'is-done' : ''}`}>
                <div className="studio-flow-index">{step.step}</div>
                <div>
                  <div className="studio-strong text-sm font-semibold">{step.title}</div>
                  <div className="studio-muted mt-1 text-xs leading-6">
                    {step.detail}
                  </div>
                </div>
                <div className={`studio-chip ${step.done ? 'studio-chip-success' : 'studio-chip-warn'}`}>
                  {step.done ? '已就绪' : '待推进'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="studio-surface-card">
          <div className="studio-shell-label">辅助信息</div>
          <div className="studio-strong mt-3 text-lg font-semibold">当前配置上下文</div>
          <div className="mt-4 space-y-3">
            {recentAgentEntry && (
              <button type="button" onClick={onOpenAgents} className="studio-quick-row">
                <div>
                  <div className="studio-strong text-sm font-semibold">继续上次 Agent</div>
                  <div className="studio-muted mt-1 text-xs">
                    {recentAgentEntry.gatewayName} / {recentAgentEntry.agentId}
                  </div>
                </div>
                <span className="studio-entry-link">返回 Agent 工作台</span>
              </button>
            )}
            <div className="studio-list-row">
              <div className="studio-strong text-sm font-semibold">当前网关</div>
              <div className="studio-muted mt-1 text-xs">{activeGateway?.name || '未配置'}</div>
            </div>
            <div className="studio-list-row">
              <div className="studio-strong text-sm font-semibold">最近模板</div>
              <div className="mt-2 space-y-2">
                {recentTemplates.length > 0 ? recentTemplates.map((template) => (
                  <button key={template.id} type="button" onClick={onOpenTemplates} className="studio-quick-row">
                    <div>
                      <div className="studio-strong text-sm font-semibold">{template.name}</div>
                      <div className="studio-muted mt-1 text-xs">
                        {template.selectedSkills.length} 个 Skills
                      </div>
                    </div>
                    <span className="studio-entry-link">打开</span>
                  </button>
                )) : (
                  <div className="studio-meta-text">还没有最近模板记录。</div>
                )}
              </div>
            </div>
            <div className="studio-list-row">
              <div className="studio-strong text-sm font-semibold">消息导入调试</div>
              <div className="mt-2 space-y-2">
                <div className="studio-meta-text">
                  运行中：{messageImportStatus.running ? '是' : '否'} · 待处理：{messageImportStatus.pendingRooms.length} · 已导入房间：{messageImportStatus.importedRooms} · 已导入消息：{messageImportStatus.importedMessages}
                </div>
                <div className="studio-meta-text">
                  失败房间：{messageImportStatus.failedRooms} · 抽样不一致：{messageImportStatus.sampleMismatches} · 活跃房间：{messageImportStatus.activeRoomId || '无'}
                </div>
                {messageImportStatus.lastImportedRoomId && (
                  <div className="studio-meta-text">
                    最近导入：{messageImportStatus.lastImportedRoomId}
                  </div>
                )}
                {messageImportStatus.lastError && (
                  <div className="studio-meta-text text-[#fda4af]">
                    最近错误：{messageImportStatus.lastError}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => triggerMessageImport()} className="studio-secondary-btn">
                    触发全量后台导入
                  </button>
                  <button type="button" onClick={() => void handleValidateActiveRoom()} className="studio-secondary-btn">
                    校验当前房间
                  </button>
                </div>
                {messageValidationSummary && (
                  <div className="studio-meta-text">{messageValidationSummary}</div>
                )}
              </div>
            </div>
            <div className="studio-list-row">
              <div className="studio-strong text-sm font-semibold">最近一页消息灰度切读评估</div>
              <div className="studio-meta-text mt-2">
                当前结论：暂不启用。原因是后台导入和校验刚建立，先把导入稳定性和观测跑稳，再切最近一页读路径更安全。
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="studio-home-note mt-5">
        <div className="studio-home-note-item">
          <div className="studio-shell-label">当前逻辑</div>
          <div className="studio-meta-text mt-2">模板先于 Agent，Agent 先于同步。</div>
        </div>
        <div className="studio-home-note-item">
          <div className="studio-shell-label">不再展示</div>
          <div className="studio-meta-text mt-2">大指标卡、解释型看板、重复状态摘要。</div>
        </div>
      </div>
    </div>
  );
};
