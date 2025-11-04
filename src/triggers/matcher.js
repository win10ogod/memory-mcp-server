/**
 * 触发条件匹配引擎
 * 使用 vm2 提供沙箱化的 JS 代码执行环境
 */

import { VM } from 'vm2';
import { matchKeys, matchKeysAll } from '../nlp/keywords.js';

// 默认超时时间（毫秒）
const DEFAULT_TIMEOUT = 1000;

/**
 * 在沙箱中执行 JS 代码
 * @param {string} code - 要执行的 JS 代码
 * @param {Object} context - 执行上下文
 * @param {number} [timeout=DEFAULT_TIMEOUT] - 超时时间
 * @returns {Promise<{result: any, error: Error|null}>}
 */
export async function executeSandboxed(code, context = {}, timeout = DEFAULT_TIMEOUT) {
  try {
    // 创建 VM2 沙箱
    const vm = new VM({
      timeout: timeout,
      allowAsync: true,
      sandbox: {
        ...context,
        // 注入安全的内置对象
        Date: Date,
        Math: Math,
        RegExp: RegExp,
        JSON: JSON,
        Array: Array,
        Object: Object,
        String: String,
        Number: Number,
        Boolean: Boolean
      }
    });

    // 执行代码
    const result = vm.run(code);

    // 返回结果
    return {
      result: result,
      error: null
    };
  } catch (error) {
    // 捕获并返回错误
    return {
      result: null,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * 评估触发条件
 * @param {string} triggerCode - 触发条件的 JS 代码
 * @param {Object} executionContext - 执行上下文
 * @param {Array} executionContext.messages - 消息数组
 * @param {string} executionContext.conversation_id - 对话 ID
 * @param {Object} executionContext.participants - 参与者信息
 * @returns {Promise<boolean>} 是否触发
 */
export async function evaluateTrigger(triggerCode, executionContext) {
  if (!triggerCode || typeof triggerCode !== 'string') {
    console.warn('Invalid trigger code');
    return false;
  }

  try {
    // 准备沙箱上下文
    const sandboxContext = {
      context: executionContext,
      // 注入关键词匹配函数
      match_keys: function(messages, keys, scope = 'any', depth = 4) {
        return matchKeys(messages, keys, scope, depth);
      },
      match_keys_all: function(messages, keys, scope = 'any', depth = 4) {
        return matchKeysAll(messages, keys, scope, depth);
      },
      // 注入安全的内置对象
      Date: Date,
      Math: Math,
      RegExp: RegExp,
      JSON: JSON,
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean
    };

    // 执行触发条件代码
    const { result, error } = await executeSandboxed(triggerCode, sandboxContext);

    if (error) {
      console.error('Error evaluating trigger:', error);
      return false;
    }

    // 将结果转换为布尔值
    return Boolean(result);
  } catch (error) {
    console.error('Unexpected error in evaluateTrigger:', error);
    return false;
  }
}

/**
 * 测试触发条件（用于验证触发条件语法）
 * @param {string} triggerCode - 触发条件的 JS 代码
 * @returns {Promise<{valid: boolean, error: Error|null}>}
 */
export async function testTrigger(triggerCode) {
  try {
    // 使用模拟上下文测试
    const mockContext = {
      messages: [
        { role: 'user', content: 'test message' }
      ],
      conversation_id: 'test',
      participants: {}
    };

    const { error } = await executeSandboxed(triggerCode, {
      context: mockContext,
      match_keys: function() { return 0; },
      match_keys_all: function() { return false; },
      Date: Date,
      Math: Math,
      RegExp: RegExp
    });

    return {
      valid: error === null,
      error: error
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

export default {
  executeSandboxed,
  evaluateTrigger,
  testTrigger
};

