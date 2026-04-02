/**
 * 預篩層 — 向後兼容介面
 * 主邏輯已移至 announcementRuleEngine.ts
 * 本檔保留型別匯出與舊版呼叫介面
 */

export interface PreFilterResult {
  pass: boolean;
  detectedKeywords: string[];
  hintType: 'rule' | 'campaign' | 'script' | 'notice' | 'unknown';
  scopeHint: 'group' | 'facility' | 'multi_facility' | 'global';
  passReason: 'keyword' | 'supervisor_length' | 'focus_group_length' | 'needs_ai_review' | 'rule_matched' | 'none';
}

// 保留舊版呼叫介面（可能仍被其他模組使用）
export function preFilterMessage(
  text: string,
  isFromSupervisor: boolean,
  isFocusGroup: boolean,
): PreFilterResult {
  if (!text || text.trim().length < 4) {
    return { pass: false, detectedKeywords: [], hintType: 'unknown', scopeHint: 'group', passReason: 'none' };
  }
  // 直接通過，由 ruleEngine 進行真正的決策
  return { pass: true, detectedKeywords: [], hintType: 'unknown', scopeHint: 'group', passReason: 'none' };
}
