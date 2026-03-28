import OpenAI from 'openai';
import { announcementClassifierSystemPrompt } from '../../prompts/announcementClassifier';
import { type PreFilterResult } from './announcementPreFilterService';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ClassificationResult {
  candidateType: string;
  scopeType: string;
  title: string;
  summary: string;
  recommendedAction: string | null;
  badExample: string | null;
  recommendedReply: string | null;
  appliesToRoles: string[];
  startAt: string | null;
  endAt: string | null;
  confidence: number;
  reasoningTags: string[];
}

const CLASSIFICATION_TIMEOUT_MS = 20000;

export async function classifyAnnouncement(
  text: string,
  groupName: string,
  isFromSupervisor: boolean,
  preFilter: PreFilterResult,
): Promise<ClassificationResult | null> {
  const userContent = `
來源群組：${groupName}
發話者是否為主管：${isFromSupervisor ? '是' : '否'}
預篩偵測到的關鍵詞：${preFilter.detectedKeywords.join('、') || '（無）'}
訊息內容：
${text}
`.trim();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLASSIFICATION_TIMEOUT_MS);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: announcementClassifierSystemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    }, { signal: controller.signal as any });

    clearTimeout(timer);

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ClassificationResult;
    return parsed;
  } catch (err: any) {
    console.error('❌ 公告分類 GPT 呼叫失敗:', err.message || err);
    return null;
  }
}
