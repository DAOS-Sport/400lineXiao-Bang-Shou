/**
 * GPT 分類器 — 僅用於灰區訊息，最小輸出模式
 * max_tokens: 220（大幅降低費用）
 */

import OpenAI from 'openai';
import { announcementClassifierSystemPrompt } from '../../prompts/announcementClassifier';
import { type PreFilterResult } from './announcementPreFilterService';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ClassificationResult {
  candidateType: string;
  scopeType: string;
  title: string;
  summary: string;
  confidence: number;
  reasoningTags: string[];
  needsAck?: boolean;
}

const TIMEOUT_MS = 18_000;

export async function classifyAnnouncement(
  text: string,
  groupName: string,
  isFromSupervisor: boolean,
  preFilter: Pick<PreFilterResult, 'detectedKeywords' | 'passReason'>,
): Promise<ClassificationResult | null> {
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
      max_tokens: 220,
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
