import OpenAI from 'openai';
import crypto from 'crypto';
import { db } from '../../db';
import { interviewAuthorizedUsers, auditLogs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { skillRegistry } from './skillRegistry';
import type { AgentResponse, QuickReplyItem } from './types';

// ========== 雙模型設定 ==========

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// ========== Rate Limiting ==========

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 分鐘

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(userId);

  if (!record || now - record.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

// ========== System Prompt ==========

function buildSystemPrompt(): string {
  return `你是「駿斯小助理」的 AI 智能客服，專門協助公司員工了解和使用駿斯小助理 LINE Bot 系統及相關外部系統。

你具備以下知識：

${skillRegistry.buildSystemPromptContext()}

回答規則：
1. 使用繁體中文回答
2. 回答要簡潔實用，控制在 500 字以內
3. 適當引用具體的指令格式，讓用戶可以直接複製使用
4. 如果需要查詢即時資料，使用提供的工具
5. 如果問題不在你的知識範圍內，建議聯繫系統管理員或 IT 技術群
6. 不要執行任何修改操作，只提供查詢和指導
7. 區分內部模組和外部系統，給予正確的操作指引
8. 回答語氣親切專業，像一位有經驗的同事在幫忙`;
}

// ========== Tool 定義轉換 ==========

function getToolDefinitionsForGemini(): any[] {
  return skillRegistry.getAllTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: tool.parameters,
      required: [],
    }
  }));
}

function getToolDefinitionsForOpenAI(): any[] {
  return skillRegistry.getAllTools().map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters,
        required: [],
      }
    }
  }));
}

// ========== Gemini API 呼叫 ==========

const GEMINI_TIMEOUT_MS = 20_000; // 20 秒，LINE reply token 30 秒內必須回覆

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function callGemini(question: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY 未設定');
  }

  const tools = getToolDefinitionsForGemini();
  const requestBody: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: question }]
      }
    ],
    systemInstruction: {
      parts: [{ text: buildSystemPrompt() }]
    },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 800,
    }
  };

  // 只在有 tools 時加入
  if (tools.length > 0) {
    requestBody.tools = [{
      functionDeclarations: tools
    }];
  }

  const response = await fetchWithTimeout(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  }, GEMINI_TIMEOUT_MS);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 錯誤 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];

  if (!candidate?.content?.parts) {
    throw new Error('Gemini 回覆格式異常');
  }

  // 處理 function calling
  for (const part of candidate.content.parts) {
    if (part.functionCall) {
      const { name, args } = part.functionCall;
      console.log(`🔧 Gemini function call: ${name}`, args);

      const toolResult = await skillRegistry.executeTool(name, args || {});

      // 將 tool 結果送回 Gemini 進行最終回覆（剩餘時間內）
      const followUpBody: any = {
        contents: [
          {
            role: 'user',
            parts: [{ text: question }]
          },
          {
            role: 'model',
            parts: [{ functionCall: { name, args: args || {} } }]
          },
          {
            role: 'function',
            parts: [{
              functionResponse: {
                name,
                response: { result: toolResult }
              }
            }]
          }
        ],
        systemInstruction: {
          parts: [{ text: buildSystemPrompt() }]
        },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 800,
        }
      };

      const followUpResponse = await fetchWithTimeout(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(followUpBody),
      }, GEMINI_TIMEOUT_MS);

      if (!followUpResponse.ok) {
        // fallback: 直接回傳 tool 結果
        return toolResult;
      }

      const followUpData = await followUpResponse.json();
      const followUpText = followUpData.candidates?.[0]?.content?.parts?.[0]?.text;
      return followUpText || toolResult;
    }
  }

  // 純文字回覆
  const textPart = candidate.content.parts.find((p: any) => p.text);
  return textPart?.text || '抱歉，我無法理解您的問題，請試試其他提問方式。';
}

// ========== OpenAI API 呼叫（備援） ==========

async function callOpenAI(question: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 未設定');
  }

  const tools = getToolDefinitionsForOpenAI();
  const messages: any[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: question }
  ];

  const requestOptions: any = {
    model: 'gpt-4o',
    messages,
    temperature: 0.3,
    max_tokens: 1000,
  };

  if (tools.length > 0) {
    requestOptions.tools = tools;
  }

  const response = await openai.chat.completions.create(requestOptions);
  const choice = response.choices[0];

  // 處理 function calling
  if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    const toolCall = choice.message.tool_calls[0];
    const { name, arguments: argsStr } = toolCall.function;
    const args = JSON.parse(argsStr || '{}');

    console.log(`🔧 OpenAI function call: ${name}`, args);
    const toolResult = await skillRegistry.executeTool(name, args);

    // 將 tool 結果送回 GPT 進行最終回覆
    messages.push(choice.message);
    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: toolResult,
    });

    const followUpResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
      max_tokens: 1000,
    });

    return followUpResponse.choices[0].message.content || toolResult;
  }

  return choice.message.content || '抱歉，我無法理解您的問題，請試試其他提問方式。';
}

// ========== 主要服務 ==========

class AiAgentService {

  /**
   * 檢查用戶是否有 AI 客服權限
   */
  async isAuthorizedForAiAgent(userId: string): Promise<{ authorized: boolean; userName?: string }> {
    try {
      const [user] = await db.select()
        .from(interviewAuthorizedUsers)
        .where(eq(interviewAuthorizedUsers.userId, userId));

      if (!user) {
        return { authorized: false };
      }

      const isActive = user.isActive === 'true' || user.isActive === 't';
      const canUse = user.canUseAiAgent === 'true' || user.canUseAiAgent === 't';

      return {
        authorized: isActive && canUse,
        userName: user.userName,
      };
    } catch (error) {
      console.error('❌ AI 客服權限檢查失敗:', error);
      return { authorized: false };
    }
  }

  /**
   * 處理用戶查詢 — 主要入口
   */
  async handleQuery(userId: string, question: string): Promise<AgentResponse> {
    const startTime = Date.now();
    let modelUsed = 'none';

    try {
      // 1. 權限檢查
      const { authorized, userName } = await this.isAuthorizedForAiAgent(userId);
      if (!authorized) {
        await this.logAudit('warning', 'ai_agent_unauthorized', '未授權用戶嘗試使用 AI 客服', {
          userId,
          question: question.substring(0, 50),
        });
        return {
          text: '⚠️ 抱歉，您目前沒有使用 AI 智能客服的權限。\n如需開通，請聯繫系統管理員。',
          quickReplies: [],
        };
      }

      // 2. Rate Limiting
      if (!checkRateLimit(userId)) {
        return {
          text: '⏳ 您的查詢頻率過高，請稍等幾分鐘後再試。\n（每 15 分鐘最多 10 次查詢）',
          quickReplies: [],
        };
      }

      // 3. 呼叫 AI 模型（Gemini 為主，GPT-4o 備援）
      let responseText: string;

      try {
        responseText = await callGemini(question);
        modelUsed = 'gemini-2.5-flash';
        console.log(`✅ Gemini 回覆成功 (${Date.now() - startTime}ms)`);
      } catch (geminiError) {
        console.warn('⚠️ Gemini 失敗，切換到 GPT-4o:', (geminiError as Error).message);

        try {
          responseText = await callOpenAI(question);
          modelUsed = 'gpt-4o';
          console.log(`✅ GPT-4o 備援回覆成功 (${Date.now() - startTime}ms)`);
        } catch (openaiError) {
          console.error('❌ GPT-4o 也失敗:', (openaiError as Error).message);
          throw new Error('所有 AI 模型都無法回應');
        }
      }

      // 4. 產生 Quick Reply
      const quickReplies = skillRegistry.generateQuickReplies(responseText);

      // 5. 記錄 Audit Log
      await this.logAudit('info', 'ai_agent', 'AI 智能客服回覆', {
        userId,
        userName,
        question: question.substring(0, 100),
        model: modelUsed,
        responseLength: responseText.length,
        latencyMs: Date.now() - startTime,
      });

      return { text: responseText, quickReplies };

    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error('❌ AI 客服處理失敗:', errorMsg);

      await this.logAudit('error', 'ai_agent', 'AI 智能客服處理失敗', {
        userId,
        question: question.substring(0, 100),
        error: errorMsg,
        latencyMs: Date.now() - startTime,
      });

      return {
        text: '❌ 智能客服暫時無法使用，請稍後再試。\n如持續發生問題，請聯繫系統管理員。',
        quickReplies: skillRegistry.getDefaultQuickReplies(),
      };
    }
  }

  /**
   * 記錄 Audit Log
   */
  private async logAudit(level: string, category: string, message: string, details: Record<string, unknown>): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        level,
        category,
        message,
        details,
      });
    } catch (error) {
      console.error('❌ Audit log 寫入失敗:', error);
    }
  }
}

export const aiAgentService = new AiAgentService();
