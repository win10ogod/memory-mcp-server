/**
 * 长期记忆核心逻辑
 * 基于触发条件的永久记忆管理系统
 */

import { evaluateTrigger, testTrigger } from '../triggers/matcher.js';
import { normalizeModalities } from './modalities.js';

/**
 * 长期记忆管理器
 */
export class LongTermMemoryManager {
  constructor() {
    this.memories = [];
  }

  /**
   * 加载记忆数据
   * @param {Array} memories - 记忆数组
   */
  loadMemories(memories) {
    if (!Array.isArray(memories)) {
      this.memories = [];
      return;
    }

    this.memories = memories
      .filter(mem => mem && typeof mem === 'object')
      .map(mem => {
        const createdAtSource = mem.createdAt ?? mem.created_at;
        let createdAt = createdAtSource ? new Date(createdAtSource) : new Date();
        if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) {
          createdAt = new Date();
        }

        const updatedAtSource = mem.updatedAt ?? mem.updated_at;
        let updatedAt;
        if (updatedAtSource) {
          const parsedUpdated = new Date(updatedAtSource);
          if (parsedUpdated instanceof Date && !Number.isNaN(parsedUpdated.getTime())) {
            updatedAt = parsedUpdated;
          }
        }

        const modalities = normalizeModalities(mem.modalities ?? mem.attachments ?? []);

        return {
          ...mem,
          createdAt,
          updatedAt,
          modalities,
          attachments: modalities
        };
      });
  }

  /**
   * 获取当前所有记忆
   * @returns {Array}
   */
  getMemories() {
    return this.memories;
  }

  /**
   * 根据名称查找记忆
   * @param {string} name - 记忆名称
   * @returns {Object|null}
   */
  findMemoryByName(name) {
    return this.memories.find(mem => mem.name === name) || null;
  }

  /**
   * 测试触发条件
   * @param {string} triggerCode - 触发条件代码
   * @returns {Promise<{valid: boolean, error: Error|null}>}
   */
  async testTriggerCondition(triggerCode) {
    return await testTrigger(triggerCode);
  }

  /**
   * 搜索并激活相关的长期记忆
   * @param {Object} context - 执行上下文
   * @param {Array} context.messages - 消息数组
   * @param {string} context.conversation_id - 对话 ID
   * @param {Object} context.participants - 参与者信息
   * @returns {Promise<{activated: Array, random: Array}>}
   */
  async searchAndActivateMemories(context) {
    context = context || {};

    const activatedMemories = [];

    const normalizedContextModalities = normalizeModalities(context?.modalities ?? context?.attachments ?? []);
    const evaluationContext = {
      ...context,
      modalities: normalizedContextModalities
    };

    if ('attachments' in evaluationContext || normalizedContextModalities.length > 0) {
      evaluationContext.attachments = normalizedContextModalities;
    }

    // 评估所有记忆的触发条件
    for (const memory of this.memories) {
      try {
        const triggered = await evaluateTrigger(memory.trigger, evaluationContext);
        if (triggered) {
          activatedMemories.push(memory);
        }
      } catch (error) {
        console.error(`Error evaluating trigger for memory "${memory.name}":`, error);
      }
    }

    // 随机选择 2 个记忆（不包括已激活的）
    const randomMemories = this.getRandomMemories(2, activatedMemories.map(m => m.name));

    return {
      activated: activatedMemories,
      random: randomMemories
    };
  }

  /**
   * 获取随机记忆
   * @param {number} count - 数量
   * @param {string[]} [excludeNames] - 要排除的记忆名称
   * @returns {Array}
   */
  getRandomMemories(count, excludeNames = []) {
    const availableMemories = this.memories.filter(
      mem => !excludeNames.includes(mem.name)
    );

    if (availableMemories.length === 0) {
      return [];
    }

    // 随机打乱
    const shuffled = [...availableMemories].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * 添加新的长期记忆
   * @param {Object} memory - 记忆对象
   * @param {string} memory.trigger - 触发条件（JS 代码）
   * @param {string} memory.prompt - 记忆内容
   * @param {string} memory.name - 记忆名称
   * @param {string} [memory.createdContext] - 创建时的上下文
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async addMemory(memory) {
    // 验证必需字段
    if (!memory.name || !memory.trigger || !memory.prompt) {
      return {
        success: false,
        error: 'Missing required fields: name, trigger, or prompt'
      };
    }

    // 测试触发条件是否有效
    const testResult = await this.testTriggerCondition(memory.trigger);
    if (!testResult.valid) {
      return {
        success: false,
        error: `Invalid trigger condition: ${testResult.error?.message || 'Unknown error'}`
      };
    }

    // 如果同名记忆已存在，删除旧的
    const existingIndex = this.memories.findIndex(mem => mem.name === memory.name);
    if (existingIndex !== -1) {
      this.memories.splice(existingIndex, 1);
    }

    // 添加新记忆
    const modalities = normalizeModalities(memory.modalities ?? memory.attachments ?? []);

    this.memories.push({
      trigger: memory.trigger,
      prompt: memory.prompt,
      name: memory.name,
      createdAt: new Date(),
      createdContext: memory.createdContext || '',
      modalities,
      attachments: modalities
    });

    return { success: true };
  }

  /**
   * 更新已有的长期记忆
   * @param {string} name - 记忆名称
   * @param {Object} updates - 要更新的字段
   * @param {string} [updates.trigger] - 新的触发条件
   * @param {string} [updates.prompt] - 新的内容
   * @param {string} [updates.updatedContext] - 更新时的上下文
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updateMemory(name, updates) {
    const memoryIndex = this.memories.findIndex(mem => mem.name === name);
    
    if (memoryIndex === -1) {
      return {
        success: false,
        error: `Memory "${name}" not found`
      };
    }

    // 如果更新触发条件，先验证
    if (updates.trigger) {
      const testResult = await this.testTriggerCondition(updates.trigger);
      if (!testResult.valid) {
        return {
          success: false,
          error: `Invalid trigger condition: ${testResult.error?.message || 'Unknown error'}`
        };
      }
    }

    const memory = this.memories[memoryIndex];

    // 应用更新
    if (updates.trigger !== undefined) memory.trigger = updates.trigger;
    if (updates.prompt !== undefined) memory.prompt = updates.prompt;
    if (updates.updatedContext !== undefined) memory.updatedContext = updates.updatedContext;

    if (updates.modalities !== undefined || updates.attachments !== undefined) {
      const modalities = normalizeModalities(updates.modalities ?? updates.attachments ?? []);
      memory.modalities = modalities;
      memory.attachments = modalities;
    }
    
    memory.updatedAt = new Date();

    return { success: true };
  }

  /**
   * 删除长期记忆
   * @param {string} name - 记忆名称
   * @returns {boolean} 是否成功删除
   */
  deleteMemory(name) {
    const initialLength = this.memories.length;
    this.memories = this.memories.filter(mem => mem.name !== name);
    return this.memories.length < initialLength;
  }

  /**
   * 列出所有记忆名称
   * @returns {string[]}
   */
  listMemoryNames() {
    return this.memories.map(mem => mem.name);
  }

  /**
   * 格式化记忆内容
   * @param {Object} memory - 记忆对象
   * @returns {string}
   */
  formatMemory(memory) {
    const parts = [
      `记忆名称：${memory.name}`,
      `内容：${memory.prompt}`,
      `创建于：${memory.createdAt.toLocaleString()}`
    ];

    if (memory.updatedAt) {
      parts.push(`更新于：${memory.updatedAt.toLocaleString()}`);
    }

    return parts.join('\n');
  }

  /**
   * 格式化记忆上下文
   * @param {Object} memory - 记忆对象
   * @returns {string}
   */
  formatMemoryContext(memory) {
    if (!memory) {
      return '找不到指定的记忆。';
    }

    const contextParts = [];

    if (memory.createdContext) {
      contextParts.push(`创建时上下文：\n${memory.createdContext}`);
    }

    if (memory.updatedContext) {
      contextParts.push(`更新时上下文：\n${memory.updatedContext}`);
    }

    if (contextParts.length === 0) {
      return `记忆 "${memory.name}" 没有附带任何上下文信息。`;
    }

    return `记忆 "${memory.name}" 的上下文信息：\n${contextParts.join('\n\n')}`;
  }

  /**
   * 格式化激活的记忆为文本
   * @param {Array} activatedMemories - 激活的记忆数组
   * @param {Array} randomMemories - 随机记忆数组
   * @returns {string}
   */
  formatActivatedMemories(activatedMemories, randomMemories) {
    const parts = [];

    if (activatedMemories.length > 0) {
      const activatedText = activatedMemories.map(mem => this.formatMemory(mem)).join('\n\n');
      parts.push(`<activated-memories>\n${activatedText}\n</activated-memories>`);
    }

    if (randomMemories.length > 0) {
      const randomText = randomMemories.map(mem => this.formatMemory(mem)).join('\n\n');
      parts.push(`<random-memories>\n${randomText}\n</random-memories>`);
    }

    if (parts.length === 0) {
      return '';
    }

    return `<long-term-memories>\n${parts.join('\n\n')}\n</long-term-memories>`;
  }

  /**
   * 获取记忆统计信息
   * @returns {Object}
   */
  getStats() {
    const now = Date.now();
    let oldestCreation = Infinity;
    let newestCreation = -Infinity;
    let oldestUpdate = Infinity;
    let newestUpdate = -Infinity;
    let updateCount = 0;

    for (const mem of this.memories) {
      const created = mem.createdAt.getTime();
      oldestCreation = Math.min(oldestCreation, created);
      newestCreation = Math.max(newestCreation, created);

      if (mem.updatedAt) {
        updateCount++;
        const updated = mem.updatedAt.getTime();
        oldestUpdate = Math.min(oldestUpdate, updated);
        newestUpdate = Math.max(newestUpdate, updated);
      }
    }

    return {
      total: this.memories.length,
      updatedCount: updateCount,
      oldestCreation: this.memories.length > 0 ? oldestCreation : null,
      newestCreation: this.memories.length > 0 ? newestCreation : null,
      oldestUpdate: updateCount > 0 ? oldestUpdate : null,
      newestUpdate: updateCount > 0 ? newestUpdate : null
    };
  }
}

export default LongTermMemoryManager;

