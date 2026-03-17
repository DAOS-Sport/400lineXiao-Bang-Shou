import type { Skill, SkillTool, QuickReplyItem } from './types';

// 匯入所有 Skills
import { taskSkill } from './skills/taskSkill';
import { interviewSkill } from './skills/interviewSkill';
import { waterQualitySkill } from './skills/waterQualitySkill';
import { weatherSkill } from './skills/weatherSkill';
import { employeeSkill } from './skills/employeeSkill';
import { surveySkill } from './skills/surveySkill';
import { systemSkill } from './skills/systemSkill';
import { clockInSkill } from './skills/clockInSkill';

class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getByCategory(category: 'internal' | 'external'): Skill[] {
    return this.getAllSkills().filter(s => s.category === category);
  }

  /**
   * 組合所有 skill 的描述，注入 system prompt
   * 自動按 category 分組顯示
   */
  buildSystemPromptContext(): string {
    const internal = this.getByCategory('internal');
    const external = this.getByCategory('external');

    let context = '';

    if (internal.length > 0) {
      context += '【內部模組 — 可在 LINE 聊天中直接操作】\n\n';
      internal.forEach(skill => {
        context += `## ${skill.name}\n`;
        context += `${skill.description}\n\n`;
        context += `${skill.usage}\n\n`;
        context += '---\n\n';
      });
    }

    if (external.length > 0) {
      context += '【外部系統 — 獨立部署的子系統】\n\n';
      external.forEach(skill => {
        context += `## ${skill.name}`;
        if (skill.status === 'coming-soon') {
          context += '（開發中）';
        }
        context += '\n';
        if (skill.externalUrl) {
          context += `系統網址：${skill.externalUrl}\n`;
        }
        context += `${skill.description}\n\n`;
        context += `${skill.usage}\n\n`;
        context += '---\n\n';
      });
    }

    return context;
  }

  /**
   * 收集所有 skill 的 tools，用於 function calling
   */
  getAllTools(): SkillTool[] {
    const tools: SkillTool[] = [];
    this.getAllSkills().forEach(skill => {
      if (skill.tools) {
        tools.push(...skill.tools);
      }
    });
    return tools;
  }

  /**
   * 根據 tool name 找到對應 handler 並執行
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    for (const skill of this.getAllSkills()) {
      if (!skill.tools) continue;
      const tool = skill.tools.find(t => t.name === toolName);
      if (tool) {
        return await tool.handler(args);
      }
    }
    return `工具 ${toolName} 不存在`;
  }

  /**
   * 根據匹配到的 skill ID，取得相關的 Quick Reply 按鈕
   */
  getQuickRepliesForSkill(skillId: string): QuickReplyItem[] {
    const skill = this.skills.get(skillId);
    return skill?.quickReplies || [];
  }

  /**
   * 取得預設的 Quick Reply 按鈕（每次都附帶）
   */
  getDefaultQuickReplies(): QuickReplyItem[] {
    return [
      { label: '📋 功能總覽', text: '@小幫手 有哪些功能？' },
      { label: '❓ 其他問題', text: '@小幫手 ' },
    ];
  }

  /**
   * 根據 AI 回覆內容，自動偵測相關的 skill 並產生 Quick Reply
   */
  generateQuickReplies(responseText: string): QuickReplyItem[] {
    const replies: QuickReplyItem[] = [];

    // 根據回覆內容中的關鍵字，附加相關 skill 的 Quick Reply
    for (const skill of this.getAllSkills()) {
      if (skill.id === 'system') continue; // system skill 的 quick replies 只在問總覽時用
      const matched = skill.keywords.some(kw =>
        responseText.includes(kw)
      );
      if (matched && skill.quickReplies) {
        replies.push(...skill.quickReplies);
      }
    }

    // 加上預設按鈕
    const defaults = this.getDefaultQuickReplies();

    // 合併並去重，最多 13 個（LINE 限制）
    const combined = [...replies, ...defaults];
    const seen = new Set<string>();
    const unique = combined.filter(qr => {
      if (seen.has(qr.text)) return false;
      seen.add(qr.text);
      return true;
    });

    return unique.slice(0, 13);
  }
}

// 建立並註冊所有 Skills
export const skillRegistry = new SkillRegistry();

// 內部模組
skillRegistry.register(taskSkill);
skillRegistry.register(interviewSkill);
skillRegistry.register(waterQualitySkill);
skillRegistry.register(weatherSkill);
skillRegistry.register(employeeSkill);
skillRegistry.register(surveySkill);
skillRegistry.register(systemSkill);

// 外部系統
skillRegistry.register(clockInSkill);
