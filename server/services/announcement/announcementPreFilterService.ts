const RULE_KEYWORDS = [
  '即日起', '請統一', '不得', '禁止', '務必', '一律', '通知大家',
  '規定', 'SOP', '請各位', '從今以後', '請注意', '特此通知', '依規定',
  '不可以', '嚴禁', '需要統一', '請確認', '提醒大家', '統一',
];

const CAMPAIGN_KEYWORDS = [
  '活動', '優惠', '折扣', '期間', '報名', '特價', '贈送',
  '限時', '限量', '招生', '免費', '體驗', '開放', '推廣',
];

const SCRIPT_KEYWORDS = [
  '統一說法', '客人若問', '請這樣回覆', '回覆方式', '話術',
  '請勿這樣回', '遇到客人', '客戶問', '可以這樣說', '請回答',
  '標準說詞', '禁止說詞',
];

const NOTICE_KEYWORDS = [
  '公告', '通知', '注意事項', '請知悉', '請轉知', '最新消息',
  '異動', '調整', '更新', '改變', '變更', '修正',
];

const SCOPE_UPGRADE_KEYWORDS = [
  '全館', '所有館別', '全公司', '統一規定', '全部適用',
  '各館', '總公司', '全體員工', '全員',
];

export interface PreFilterResult {
  pass: boolean;
  detectedKeywords: string[];
  hintType: 'rule' | 'campaign' | 'script' | 'notice' | 'unknown';
  scopeHint: 'group' | 'facility' | 'multi_facility' | 'global';
}

export function preFilterMessage(text: string, isFromSupervisor: boolean): PreFilterResult {
  if (!text || text.trim().length < 8) {
    return { pass: false, detectedKeywords: [], hintType: 'unknown', scopeHint: 'group' };
  }

  const detected: string[] = [];
  let hintType: PreFilterResult['hintType'] = 'unknown';

  for (const kw of RULE_KEYWORDS) {
    if (text.includes(kw)) { detected.push(kw); hintType = 'rule'; }
  }
  for (const kw of CAMPAIGN_KEYWORDS) {
    if (text.includes(kw)) { detected.push(kw); if (hintType === 'unknown') hintType = 'campaign'; }
  }
  for (const kw of SCRIPT_KEYWORDS) {
    if (text.includes(kw)) { detected.push(kw); if (hintType === 'unknown') hintType = 'script'; }
  }
  for (const kw of NOTICE_KEYWORDS) {
    if (text.includes(kw)) { detected.push(kw); if (hintType === 'unknown') hintType = 'notice'; }
  }

  let scopeHint: PreFilterResult['scopeHint'] = 'group';
  for (const kw of SCOPE_UPGRADE_KEYWORDS) {
    if (text.includes(kw)) { scopeHint = 'multi_facility'; break; }
  }

  const hasKeyword = detected.length > 0;
  const pass = isFromSupervisor
    ? (hasKeyword || text.length >= 30)
    : hasKeyword;

  return { pass, detectedKeywords: [...new Set(detected)], hintType, scopeHint };
}
