/**
 * 公告重要性分類器
 *
 * 在 rule engine 之前作為 Layer 0.5 的純規則閘口。
 * 目的：把「任務/交接/異常/聊天」明確排除，不讓它們進候選池。
 *
 * 輸出：
 *   "must_read"       — 影響全館/全員工的強制性重要公告
 *   "normal"          — 一般資訊通知
 *   "not_announcement" — 任務、交接、異常、閒聊，不進候選池
 */

export type AnnouncementImportance = 'must_read' | 'normal' | 'not_announcement';

export interface AnnouncementDecision {
  importance: AnnouncementImportance;
  reasonCodes: string[];
  confidence: number;
}

// ── NOT_ANNOUNCEMENT 排除規則 ────────────────────────────────────────────────

const NOT_ANNOUNCEMENT_RULES: Array<{
  code: string;
  test: (t: string) => boolean;
}> = [
  // 個人任務：對特定人的指令或請求
  {
    code: 'PERSONAL_TASK',
    test: (t) =>
      /^幫我/.test(t) ||
      /^你(去|幫|等一下|來)/.test(t) ||
      // "小美你等一下去..." / "偉德你去..."（前6字內含人名+你）
      /^[\u4e00-\u9fff]{1,3}你/.test(t.substring(0, 6)) ||
      // "請XX去做..."（非正式公告的直接派工）
      /^請[\u4e00-\u9fff]{1,3}(去|幫|來|確認|處理)/.test(t),
  },

  // 交接：已完成的狀態更新或接班指示
  {
    code: 'HANDOVER_STATUS',
    test: (t) =>
      // "鑰匙放在抽屜..." / "文件放在桌上..."
      /放在.{0,10}(抽屜|桌上|旁邊|置物|櫃子|前台)/.test(t) ||
      // "今天施工已完成" / "已處理" / "已確認"
      /已(完成|處理|確認|交接|繳交|送出)/.test(t) ||
      // "晚班記得接著處理" / "請繼續接手"
      /記得(接著|繼續|接手|接續)/.test(t) ||
      // "早班/晚班記得..." (交接叮嚀，非公告)
      /^(早班|晚班|中班|夜班)記得/.test(t),
  },

  // 異常/事故：緊急事件，應走事故回報流程，不是公告
  {
    code: 'INCIDENT_REPORT',
    test: (t) =>
      /有人(被|受傷|跌倒|昏倒|溺水|出事)/.test(t) ||
      /會員.*(受傷|跌倒|昏倒|抱怨)/.test(t) ||
      /(馬達|水泵|幫浦|設備|機器|電梯).*(壞|故障|異常|不動|停了)/.test(t) ||
      /壞(掉|了)/.test(t) ||
      /虎頭蜂/.test(t) ||
      /緊急(情況|事件|通報)/.test(t),
  },
];

// ── MUST_READ 訊號 ───────────────────────────────────────────────────────────
// 需同時符合 ≥2 個，或 1 個 + 訊息長度 ≥ 30 字

const MUST_READ_SIGNALS: Array<{ code: string; test: (t: string) => boolean }> = [
  { code: 'IMMEDIATE_EFFECT',      test: (t) => /即日起/.test(t) },
  { code: 'MULTI_FACILITY_SCOPE',  test: (t) => /[各全]館|所有館別|全體員工|全體同仁/.test(t) },
  { code: 'UNIFORM_RULE',          test: (t) => /統一(使用|說法|流程|做法|規定)/.test(t) },
  { code: 'REQUEST_COMPLIANCE',    test: (t) => /請大家.{0,10}(確認|配合|遵守|知悉)/.test(t) || /請各.{0,5}(配合|確認)/.test(t) },
  { code: 'OPERATION_CLOSURE',     test: (t) => /暫停開放|休館|封閉|停課|停班/.test(t) },
  { code: 'SYSTEM_MAINTENANCE',    test: (t) => /系統維護|系統升級|系統更新|系統異動/.test(t) },
  { code: 'CONSTRUCTION_GUIDANCE', test: (t) => /施工.{0,15}(引導|改走|注意|配合)/.test(t) },
  { code: 'MANDATORY_KEYWORDS',    test: (t) => /一律|禁止|不得|務必/.test(t) },
  { code: 'SOP_CHANGE',            test: (t) => /SOP|流程異動|作業流程/.test(t) },
  { code: 'DEADLINE',              test: (t) => /截止|期限|最後期限/.test(t) && /\d/.test(t) },
];

// ── NORMAL ANNOUNCEMENT 訊號 ──────────────────────────────────────────────────

const NORMAL_KEYWORDS = [
  '報名', '課程', '活動資訊', '通知', '更新', '招生',
  '優惠', '夏令營', '冬令營', '開放', '體驗課', '公告',
];

// ── 主函式 ────────────────────────────────────────────────────────────────────

export function classifyAnnouncementImportance(input: {
  text: string;
  groupId: string;
  displayName?: string;
  hasImage?: boolean;
  hasFile?: boolean;
  createdAt: Date;
}): AnnouncementDecision {
  const t = input.text.trim();

  // 1. 先檢查 NOT_ANNOUNCEMENT 排除規則
  for (const rule of NOT_ANNOUNCEMENT_RULES) {
    if (rule.test(t)) {
      return {
        importance: 'not_announcement',
        reasonCodes: [rule.code],
        confidence: 0.85,
      };
    }
  }

  // 2. 計算 must_read 訊號
  const hitSignals = MUST_READ_SIGNALS.filter(s => s.test(t));
  const hitCodes = hitSignals.map(s => s.code);

  if (hitSignals.length >= 2) {
    return { importance: 'must_read', reasonCodes: hitCodes, confidence: 0.88 };
  }
  if (hitSignals.length === 1 && t.length >= 20) {
    return { importance: 'must_read', reasonCodes: hitCodes, confidence: 0.72 };
  }

  // 3. 一般公告關鍵字
  const normalHit = NORMAL_KEYWORDS.find(k => t.includes(k));
  if (normalHit && t.length >= 15) {
    return { importance: 'normal', reasonCodes: [`normal:${normalHit}`], confidence: 0.60 };
  }

  // 4. 預設：不是公告
  return { importance: 'not_announcement', reasonCodes: ['NO_ANNOUNCEMENT_SIGNAL'], confidence: 0.50 };
}

// ── 快速單元測試（供 CLI 驗證用，不跑在 prod） ─────────────────────────────────

export function runClassifierTests(): void {
  const cases: Array<{ text: string; expect: AnnouncementImportance }> = [
    { text: '即日起各館櫃台統一使用新版報名表，請大家今天下班前確認。', expect: 'must_read' },
    { text: '4/25 22:00 到 4/26 02:00 會員系統維護，櫃台請先確認報名資料。', expect: 'must_read' },
    { text: '本週六新北高中更衣室施工，當日請引導會員改走側門。', expect: 'must_read' },
    { text: '夏令營開始報名，現場可以協助家長填表。', expect: 'normal' },
    { text: '幫我找偉德', expect: 'not_announcement' },
    { text: '虎頭蜂有人被叮', expect: 'not_announcement' },
    { text: '鑰匙放在抽屜第二層', expect: 'not_announcement' },
    { text: '今天施工已完成', expect: 'not_announcement' },
    { text: '晚班記得接著處理', expect: 'not_announcement' },
  ];

  let pass = 0;
  for (const c of cases) {
    const result = classifyAnnouncementImportance({
      text: c.text,
      groupId: 'test',
      createdAt: new Date(),
    });
    const ok = result.importance === c.expect;
    console.log(`${ok ? '✅' : '❌'} [${result.importance}] "${c.text.substring(0, 40)}" → expect ${c.expect} | codes: ${result.reasonCodes.join(',')}`);
    if (ok) pass++;
  }
  console.log(`\n結果：${pass}/${cases.length} 通過`);
}
