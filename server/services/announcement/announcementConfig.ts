/**
 * 公告管線全域設定
 * 可調整群組分級、VIP 名單、字數門檻
 */

// ── 群組 Tier ────────────────────────────────────────────────────────────────
// A：高營運相關（值班/櫃台/場館）
// B：中度相關
// C：低優先/觀察群組
export type GroupTier = 'A' | 'B' | 'C';

export const GROUP_TIER_MAP: Record<string, GroupTier> = {
  C66a4b3bb3fbc3dcf52d42626ec512484: 'A', // 新北高中游泳池&運動中心
  C6f6f163895d5b528a6ab044015e1a37b: 'A', // 三重商工游泳池&籃球場
  C2dc6991e51074dd47d5d275d568318f7: 'A', // 三民高中游泳池
  C9b3c5dfe2e005adafd2ed914714a1930: 'A', // 松山國小室內溫水游泳池
  C50c2a9623a78cc5f5e9f39557e3abfe6: 'A', // 竹科戶外游泳池
  C360be1fe6ea876a4df3ca0497bca4e3b: 'A', // 竹科高爾夫/網球&籃球
  Cc2100498c7c5627c1e86e93f7c4eb817: 'A', // 駿斯-三蘆區櫃台
  C2dd9a5fce7c276f2cbfdd02c2342661c: 'B', // 三民排班群
  Ce936c6bebb59b8b5683ffbcf97bf20de: 'B', // 原授權群組
  Cf7ab973766c258e5b4b4f040d35b2175: 'C', // 駿斯IT技術群（觀察）
};

// ── 場館名稱對照 ────────────────────────────────────────────────────────────
export const GROUP_FACILITY_MAP: Record<string, string> = {
  C66a4b3bb3fbc3dcf52d42626ec512484: '新北高中游泳池&運動中心',
  C6f6f163895d5b528a6ab044015e1a37b: '三重商工游泳池&籃球場',
  C2dc6991e51074dd47d5d275d568318f7: '三民高中游泳池',
  C9b3c5dfe2e005adafd2ed914714a1930: '松山國小室內溫水游泳池',
  C50c2a9623a78cc5f5e9f39557e3abfe6: '竹科戶外游泳池',
  C360be1fe6ea876a4df3ca0497bca4e3b: '竹科高爾夫/網球&籃球',
  C2dd9a5fce7c276f2cbfdd02c2342661c: '三民排班群',
  Ce936c6bebb59b8b5683ffbcf97bf20de: '原授權群組',
  Cf7ab973766c258e5b4b4f040d35b2175: '駿斯IT技術群',
  Cc2100498c7c5627c1e86e93f7c4eb817: '駿斯-三蘆區櫃台',
};

// ── 公告歸納重點群組 ─────────────────────────────────────────────────────────
export const FOCUS_GROUP_IDS = new Set(Object.keys(GROUP_TIER_MAP));

// ── VIP 半白名單 ─────────────────────────────────────────────────────────────
// VIP 訊息需符合至少一項條件才進公告流程（不再全抓全送 GPT）
export const VIP_USERS: Record<string, string> = {
  'U8fd0e4be4e44a1304f9fa2e9855f4559': '陳柏榮',
};

// ── 字數門檻 ─────────────────────────────────────────────────────────────────
export const LENGTH_THRESHOLD = {
  supervisor: 40,   // 主管需 >= 40 字（長文才送）
  vip: 25,          // VIP 半白名單長文門檻
  tierA: 25,        // A 級群組一般成員
  tierB: 35,        // B 級群組一般成員
  tierC: Infinity,  // C 級：字數不放行，只接受強規則命中
} as const;

// ── 主管職稱關鍵字 ───────────────────────────────────────────────────────────
export const SUPERVISOR_KEYWORDS = [
  '主任', '主管', '館長', '組長', '督導', '總監', '經理', '副理',
  '主席', '前台主管', '服務台',
];

// ── needsAck 規則 ────────────────────────────────────────────────────────────
// 以下 candidateType 預設 needsAck = true
export const NEEDS_ACK_TYPES = new Set(['rule', 'script']);

// ── scope 升級關鍵字 ─────────────────────────────────────────────────────────
export const SCOPE_MULTI_FACILITY_KEYWORDS = [
  '全館', '各館', '所有館別', '全公司', '統一規定', '全部適用', '全員', '全體員工',
];
