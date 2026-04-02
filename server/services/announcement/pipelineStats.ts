/**
 * 商用等級 Pipeline 統計
 */

export interface PipelineStats {
  date: string;
  totalReceived: number;
  hardExcluded: number;
  enteredRuleEngine: number;
  dropped: number;
  ruleMatched: number;
  needsAiReview: number;
  ruleHits: Record<string, number>;
  byGroup: Record<string, { drop: number; ruleMatched: number; aiSent: number; stored: number }>;
  bySpeaker: Record<string, { drop: number; ruleMatched: number; aiSent: number }>;
  aiCalls: number;
  aiTimeouts: number;
  aiIgnore: number;
  aiNonIgnore: number;
  aiTotalLatencyMs: number;
  estimatedTokens: number;
  stored: number;
  approvalBySource: Record<'rule_engine' | 'ai', { approved: number; rejected: number }>;
}

let stats: PipelineStats = newDayStats();

function newDayStats(): PipelineStats {
  return {
    date: todayKey(),
    totalReceived: 0, hardExcluded: 0, enteredRuleEngine: 0,
    dropped: 0, ruleMatched: 0, needsAiReview: 0,
    ruleHits: {}, byGroup: {}, bySpeaker: {},
    aiCalls: 0, aiTimeouts: 0, aiIgnore: 0, aiNonIgnore: 0,
    aiTotalLatencyMs: 0, estimatedTokens: 0, stored: 0,
    approvalBySource: { rule_engine: { approved: 0, rejected: 0 }, ai: { approved: 0, rejected: 0 } },
  };
}

function todayKey(): string { return new Date().toISOString().slice(0, 10); }
function resetIfNewDay(): void { if (stats.date !== todayKey()) stats = newDayStats(); }

export function incReceived(): void { resetIfNewDay(); stats.totalReceived++; }
export function incHardExcluded(): void { resetIfNewDay(); stats.hardExcluded++; }
export function incRuleEngine(): void { resetIfNewDay(); stats.enteredRuleEngine++; }

export function incDecision(decision: 'drop' | 'rule_matched' | 'needs_ai_review', params: {
  groupId: string; speakerType: string; matchedRules?: string[];
}): void {
  resetIfNewDay();
  const { groupId, speakerType, matchedRules = [] } = params;
  if (decision === 'drop') stats.dropped++;
  else if (decision === 'rule_matched') stats.ruleMatched++;
  else stats.needsAiReview++;
  if (!stats.byGroup[groupId]) stats.byGroup[groupId] = { drop: 0, ruleMatched: 0, aiSent: 0, stored: 0 };
  if (decision === 'drop') stats.byGroup[groupId].drop++;
  else if (decision === 'rule_matched') stats.byGroup[groupId].ruleMatched++;
  else stats.byGroup[groupId].aiSent++;
  if (!stats.bySpeaker[speakerType]) stats.bySpeaker[speakerType] = { drop: 0, ruleMatched: 0, aiSent: 0 };
  if (decision === 'drop') stats.bySpeaker[speakerType].drop++;
  else if (decision === 'rule_matched') stats.bySpeaker[speakerType].ruleMatched++;
  else stats.bySpeaker[speakerType].aiSent++;
  for (const rule of matchedRules) stats.ruleHits[rule] = (stats.ruleHits[rule] ?? 0) + 1;
}

export function incAiCall(params: { latencyMs: number; isIgnore: boolean; isTimeout?: boolean }): void {
  resetIfNewDay();
  stats.aiCalls++;
  if (params.isTimeout) stats.aiTimeouts++;
  if (params.isIgnore) stats.aiIgnore++; else stats.aiNonIgnore++;
  stats.aiTotalLatencyMs += params.latencyMs;
  stats.estimatedTokens += 150;
}

export function incStored(groupId: string): void {
  resetIfNewDay(); stats.stored++;
  if (stats.byGroup[groupId]) stats.byGroup[groupId].stored++;
}

export function incApproval(source: 'rule_engine' | 'ai', action: 'approved' | 'rejected'): void {
  resetIfNewDay();
  if (action === 'approved') stats.approvalBySource[source].approved++;
  else stats.approvalBySource[source].rejected++;
}

export interface PipelineStatsView extends PipelineStats {
  hardExcludeRate: string; dropRate: string; ruleMatchRate: string; aiRate: string;
  aiAvgLatencyMs: string; aiIgnoreRate: string;
  approvalPrecisionBySource: Record<string, string>;
  topTokenWasteSources: Array<{ groupId: string; aiSent: number }>;
}

export function getPipelineStats(): PipelineStatsView {
  resetIfNewDay();
  const entered = stats.enteredRuleEngine || 1;
  const aiCalls = stats.aiCalls || 1;
  const topWaste = Object.entries(stats.byGroup)
    .sort((a, b) => b[1].aiSent - a[1].aiSent).slice(0, 5)
    .map(([groupId, d]) => ({ groupId, aiSent: d.aiSent }));
  const precisionBySource: Record<string, string> = {};
  for (const [src, d] of Object.entries(stats.approvalBySource)) {
    const total = d.approved + d.rejected;
    precisionBySource[src] = total > 0 ? `${((d.approved / total) * 100).toFixed(1)}%` : 'N/A';
  }
  return {
    ...stats,
    hardExcludeRate: `${((stats.hardExcluded / (stats.totalReceived || 1)) * 100).toFixed(1)}%`,
    dropRate: `${((stats.dropped / entered) * 100).toFixed(1)}%`,
    ruleMatchRate: `${((stats.ruleMatched / entered) * 100).toFixed(1)}%`,
    aiRate: `${((stats.needsAiReview / entered) * 100).toFixed(1)}%`,
    aiAvgLatencyMs: `${(stats.aiTotalLatencyMs / aiCalls).toFixed(0)}ms`,
    aiIgnoreRate: `${((stats.aiIgnore / aiCalls) * 100).toFixed(1)}%`,
    approvalPrecisionBySource: precisionBySource,
    topTokenWasteSources: topWaste,
  };
}

// 向後兼容
export function inc(key: string): void {
  resetIfNewDay();
  if (key === 'totalChecked') stats.totalReceived++;
  else if (key === 'gptClassified') stats.aiCalls++;
  else if (key === 'stored') stats.stored++;
}
