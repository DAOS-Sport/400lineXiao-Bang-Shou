/**
 * 公告分類器 — 僅用於灰區訊息
 * 主分類器：Gemini 2.5 Flash Lite（成本約為 GPT-4o-mini 的 2/3）
 *
 * 環境變數：
 * - GEMINI_API_KEY（必填）
 * - ANNOUNCEMENT_CLASSIFIER_MODEL（選填，預設 gemini-2.5-flash-lite）
 */

import { announcementClassifierSystemPrompt } from '../../prompts/announcementClassifier';
import { type PreFilterResult } from './announcementPreFilterService';

export interface ExtractedJson {
  who?: string;
  what?: string;
  when?: string;
  where?: string;
  thing?: string;
  originalQuote?: string;
  [key: string]: any;
}

export interface ClassificationResult {
  candidateType: string;
  scopeType: string;
  title: string;
  summary: string;
  confidence: number;
  reasoningTags: string[];
  needsAck?: boolean;
  // 升級版新增欄位
  appliesToRoles?: string[];
  startAt?: string | null;
  endAt?: string | null;
  recommendedAction?: string | null;
  recommendedReply?: string | null;
  badExample?: string | null;
  extractedJson?: ExtractedJson | null;
  priority?: string;
}

const TIMEOUT_MS = 18_000;
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
]);
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

// Pass 1 — 純程式門檻（不呼叫 LLM）
// 只要任一條件成立就放行進入 Pass 2（LLM）
const PASS1_KEYWORDS = [
  '公告', '規定', '統一', '提醒', '注意', '請各位', '從今天起', '即日起',
  '暫停', '恢復', '異動', '報名', '活動', '優惠', '折扣', '不可', '禁止',
  '必須', '一律', '請改成', '請不要', '請改說', 'SOP', '流程', '新規定',
];

export function passGate(params: {
  text: string;
  isFromSupervisor: boolean;
}): boolean {
  const { text, isFromSupervisor } = params;
  if (isFromSupervisor) return true;
  if (text.length >= 20) return true;
  if (PASS1_KEYWORDS.some(kw => text.includes(kw))) return true;
  return false;
}

export async function classifyAnnouncement(
  text: string,
  groupName: string,
  isFromSupervisor: boolean,
  preFilter: Pick<PreFilterResult, 'detectedKeywords' | 'passReason'>,
): Promise<ClassificationResult | null> {
  // Pass 1 gate
  if (!passGate({ text, isFromSupervisor })) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ [公告分類] GEMINI_API_KEY 未設定');
    return null;
  }

  const envModel = process.env.ANNOUNCEMENT_CLASSIFIER_MODEL ?? DEFAULT_MODEL;
  const model = ALLOWED_MODELS.has(envModel) ? envModel : DEFAULT_MODEL;

  const userContent = [
    `來源群組：${groupName}`,
    `發話者是否為主管：${isFromSupervisor ? '是' : '否'}`,
    `預篩命中詞：${preFilter.detectedKeywords.join('、') || '（無）'}`,
    `訊息：`,
    text,
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: announcementClassifierSystemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          maxOutputTokens: 800,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error(`❌ [公告分類] Gemini API ${resp.status}:`, errText.substring(0, 300));
      return null;
    }

    const data: any = await resp.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      console.error('❌ [公告分類] Gemini 回傳空內容');
      return null;
    }

    return JSON.parse(raw) as ClassificationResult;
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      console.error('❌ [公告分類] Gemini 逾時（18s）');
    } else {
      console.error('❌ [公告分類] Gemini 失敗:', err?.message);
    }
    return null;
  }
}
