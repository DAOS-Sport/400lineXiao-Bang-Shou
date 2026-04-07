/**
 * 公告規則引擎（5層管線）
 *
 * Layer 0 - 硬排除：直接不進公告流程
 * Layer 1 - 規則評分：多維度評分
 * Layer 2 - 三段式決策：drop / rule_matched / needs_ai_review
 */

import { GroupTier, SCOPE_MULTI_FACILITY_KEYWORDS } from './announcementConfig';

// ── 評分維度關鍵字 ──────────────────────────────────────────────────────────

const STRONG_KEYWORDS = [
  '即日起', '一律', '禁止', '不得', '務必', 'SOP', '請統一', '統一說法',
  '禁止說詞', '請各館配合', '全體員工', '休館', '暫停開放', '恢復營運',
  '課程取消', '時段調整', '價格調整', '請轉知', '請知悉', '異動如下', '公告如下',
];

const WEAK_KEYWORDS = [
  '活動', '優惠', '折扣', '通知', '調整', '更新', '修正', '報名', '開放',
  '推廣', '招生', '體驗', '限時', '限量',
];

const TIME_WORDS = [
  '今天', '明天', '本週', '即日起', '截止', '開始', '結束', '延後', '提前',
  '暫停', '恢復', ' 起', '至 ',
];

const AUDIENCE_WORDS = [
  '櫃台', '救生員', '同仁', '員工', '各館', '全體員工', '客人', '會員',
  '主管', '前台', '行政',
];

const ACTION_WORDS = [
  '請', '需', '務必', '記得', '統一', '改為', '停止', '恢復', '配合',
  '確認', '轉知', '回覆', '說明', '不可', '不要',
];

const NOISE_WORDS = [
  '哈哈', '笑死', '辛苦了', '收到', '好的', 'ok', 'OK', '了解', '已知悉',
  '晚安', '早安', '午安', '謝謝', '已', '好啊', '嗯', '喔', 'XD', '哈',
];

// Layer 0 硬排除：短回覆 / 簽到 / 純情緒
const HARD_EXCLUDE_EXACT = new Set([
  '收到', '好', 'ok', 'OK', 'Ok', '已知悉', '哈哈', '好的', '恩', '嗯',
  '了解', '謝謝', '謝', '好啊', '曉得', '知道了', '👍', '😊', '🙏',
  '辛苦了', '早安', '午安', '晚安',
]);

// 結構訊號詞（含有跡象是多句、有主旨）
const STRUCTURE_SIGNALS = [
  '：\n', ':\n', '。\n', '！\n', '。請', '請各', '規定如下', '如下', '說明如下',
  '注意事項', '相關規定', '以下說明',
];

// ── Layer 0 硬排除 ───────────────────────────────────────────────────────────

export interface HardExcludeResult {
  excluded: boolean;
  reason?: string;
}

export function hardExclude(text: string): HardExcludeResult {
  const t = text.trim();

  if (!t || t.length < 4) return { excluded: true, reason: 'too_short' };
  if (t.startsWith('@小幫手')) return { excluded: true, reason: 'ai_command' };
  if (t.startsWith('交辦')) return { excluded: true, reason: 'task_command' };

  // 精確短回覆
  if (HARD_EXCLUDE_EXACT.has(t)) return { excluded: true, reason: 'short_reply' };

  // 4~6 字且含高噪音詞，直接排除
  if (t.length <= 6) {
    const hasNoise = NOISE_WORDS.some(n => t.includes(n));
    if (hasNoise) return { excluded: true, reason: 'short_noise' };
  }

  // 純 emoji 或純符號（無中文、英文字母）
  const hasCJKOrAlpha = /[\u4e00-\u9fff\u3040-\u30ffa-zA-Z]/.test(t);
  if (!hasCJKOrAlpha) return { excluded: true, reason: 'no_cjk_content' };

  return { excluded: false };
}

// ── Layer 1 規則評分 ─────────────────────────────────────────────────────────

export interface RuleScore {
  total: number;
  strongHits: string[];
  weakHits: string[];
  timeHits: string[];
  audienceHits: string[];
  actionHits: string[];
  noiseHits: string[];
  hasStructure: boolean;
  hasTimeSensitivity: boolean;
  hasExplicitAudience: boolean;
  hasExplicitAction: boolean;
  scopeType: 'group' | 'facility' | 'multi_facility' | 'global';
}

export function scoreMessage(text: string): RuleScore {
  const strongHits = STRONG_KEYWORDS.filter(k => text.includes(k));
  const weakHits = WEAK_KEYWORDS.filter(k => text.includes(k));
  const timeHits = TIME_WORDS.filter(k => text.includes(k));
  const audienceHits = AUDIENCE_WORDS.filter(k => text.includes(k));
  const actionHits = ACTION_WORDS.filter(k => text.includes(k));
  const noiseHits = NOISE_WORDS.filter(k => text.includes(k));
  const hasStructure = STRUCTURE_SIGNALS.some(s => text.includes(s));

  // scope 判斷
  let scopeType: RuleScore['scopeType'] = 'group';
  for (const kw of SCOPE_MULTI_FACILITY_KEYWORDS) {
    if (text.includes(kw)) { scopeType = 'multi_facility'; break; }
  }

  // 計分
  let total = 0;
  total += strongHits.length * 10;   // 強關鍵字 +10/個
  total += weakHits.length * 2;      // 弱關鍵字 +2/個
  total += timeHits.length * 3;      // 時間詞 +3/個
  total += audienceHits.length * 3;  // 對象詞 +3/個
  total += actionHits.length * 2;    // 行動詞 +2/個
  if (hasStructure) total += 5;      // 結構訊號 +5
  if (scopeType === 'multi_facility') total += 8; // 跨館 +8
  total -= noiseHits.length * 4;     // 噪音詞 -4/個

  return {
    total: Math.max(0, total),
    strongHits,
    weakHits,
    timeHits,
    audienceHits,
    actionHits,
    noiseHits,
    hasStructure,
    hasTimeSensitivity: timeHits.length > 0,
    hasExplicitAudience: audienceHits.length > 0,
    hasExplicitAction: actionHits.length > 0,
    scopeType,
  };
}

// ── Layer 2 三段式決策 ───────────────────────────────────────────────────────

export type Decision = 'drop' | 'rule_matched' | 'needs_ai_review';
export type SpeakerType = 'vip' | 'supervisor' | 'member';

export interface DecisionResult {
  decision: Decision;
  reason: string;
  score: RuleScore;
  matchedRules: string[];
}

export function makeDecision(params: {
  text: string;
  score: RuleScore;
  speakerType: SpeakerType;
  tier: GroupTier;
}): DecisionResult {
  const { text, score, speakerType, tier } = params;
  const len = text.length;
  const matched: string[] = [];

  // ── 強關鍵字命中 → rule_matched（不送 AI）─────────────────────────────
  if (score.strongHits.length > 0) {
    matched.push(...score.strongHits.map(k => `strong:${k}`));
    return { decision: 'rule_matched', reason: 'strong_keyword', score, matchedRules: matched };
  }

  // ── 三元素至少命中兩項且分數夠高 → rule_matched ───────────────────────
  const triCount = [score.hasTimeSensitivity, score.hasExplicitAudience, score.hasExplicitAction]
    .filter(Boolean).length;

  if (triCount >= 2 && score.total >= 12) {
    matched.push('tri_element_match');
    if (score.hasTimeSensitivity) matched.push('has_time');
    if (score.hasExplicitAudience) matched.push('has_audience');
    if (score.hasExplicitAction) matched.push('has_action');
    return { decision: 'rule_matched', reason: 'tri_element', score, matchedRules: matched };
  }

  // ── 分數足夠高 → rule_matched（依 tier 不同門檻）────────────────────
  // 需有強關鍵字或至少一項元素命中，純弱詞堆分不放行
  const ruleThreshold = tier === 'A' ? 14 : tier === 'B' ? 18 : 25;
  if (score.total >= ruleThreshold && (score.strongHits.length > 0 || triCount >= 1)) {
    matched.push(`score_threshold:${score.total}`);
    return { decision: 'rule_matched', reason: 'score_threshold', score, matchedRules: matched };
  }

  // ── 主管長文 → needs_ai_review ──────────────────────────────────────
  if (speakerType === 'supervisor') {
    if (len >= 40 && score.total >= 8) {
      matched.push('supervisor_long');
      return { decision: 'needs_ai_review', reason: 'supervisor_long', score, matchedRules: matched };
    }
  }

  // ── VIP 條件（半白名單）────────────────────────────────────────────
  if (speakerType === 'vip') {
    const vipPass = len >= 25 ||
      score.strongHits.length > 0 ||
      (score.hasTimeSensitivity && score.hasExplicitAudience) ||
      (score.hasExplicitAudience && score.hasExplicitAction);

    if (!vipPass) return { decision: 'drop', reason: 'vip_not_qualifying', score, matchedRules: [] };

    if (score.total >= 8) {
      matched.push('vip_qualifying_score');
      return { decision: 'rule_matched', reason: 'vip_rule_matched', score, matchedRules: matched };
    }
    matched.push('vip_needs_ai');
    return { decision: 'needs_ai_review', reason: 'vip_needs_ai_review', score, matchedRules: matched };
  }

  // ── 字數門檻（各 tier 成員）→ needs_ai_review ───────────────────────
  const lenThreshold = tier === 'A' ? 25 : tier === 'B' ? 35 : Infinity;
  if (len >= lenThreshold && score.total >= 6) {
    matched.push(`length_threshold:${len}`);
    return { decision: 'needs_ai_review', reason: 'length_threshold', score, matchedRules: matched };
  }

  // ── 其餘全部 drop ──────────────────────────────────────────────────
  return { decision: 'drop', reason: 'no_signal', score, matchedRules: [] };
}
