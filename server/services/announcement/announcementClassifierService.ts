/**
 * GPT 分類器 — 僅用於灰區訊息
 * max_tokens: 600（升級版 Prompt 輸出更豐富）
 */

import OpenAI from 'openai';
import { announcementClassifierSystemPrompt } from '../../prompts/announcementClassifier';
import { type PreFilterResult } from './announcementPreFilterService';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

// Pass 1 — 純程式門檻（不呼叫 GPT）
// 只要任一條件成立就放行進入 Pass 2（GPT）
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
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: announcementClassifierSystemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    }, { signal: controller.signal as any });

    clearTimeout(timer);

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    return JSON.parse(raw) as ClassificationResult;
  } catch (err: any) {
    clearTimeout(timer);
    console.error('❌ [公告分類] GPT 失敗:', err?.message);
    return null;
  }
}
