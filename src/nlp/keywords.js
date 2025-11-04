/**
 * 关键词匹配与处理
 * 提供关键词匹配、文本简化等功能
 */

/**
 * 转义正则表达式特殊字符
 * @param {string} string - 要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 基础关键词匹配
 * @param {string} content - 要匹配的内容
 * @param {(string|RegExp)[]} keys - 关键词数组
 * @param {Function} [matcher] - 自定义匹配器函数
 * @returns {number} 匹配到的关键词数量
 */
export function baseMatchKeys(content, keys, matcher) {
  if (!content || !keys || keys.length === 0) {
    return 0;
  }

  // 将关键词转换为正则表达式
  keys.forEach(key => {
    if (key instanceof RegExp) {
      key.lastIndex = 0;
    }
  });

  const regexKeys = keys.map(key => {
    if (key instanceof RegExp) {
      return key;
    }
    // 如果包含中文字符，不使用单词边界匹配
    const hasChinese = /\p{Unified_Ideograph}/u.test(key);
    const pattern = hasChinese 
      ? escapeRegExp(key) 
      : `\\b${escapeRegExp(key)}\\b`;
    return new RegExp(pattern, 'ugi');
  });

  // 使用自定义匹配器或默认匹配器
  if (matcher) {
    return matcher(content, regexKeys);
  }

  // 默认匹配器：返回匹配的关键词数量
  return regexKeys.filter(regex => content.match(regex)).length;
}

/**
 * 检查内容中是否包含所有指定的关键词
 * @param {string} content - 要匹配的内容
 * @param {(string|RegExp)[]} keys - 关键词数组
 * @returns {boolean} 是否所有关键词都匹配
 */
export function baseMatchKeysAll(content, keys) {
  return baseMatchKeys(content, keys, (content, regexKeys) => {
    return regexKeys.every(regex => content.match(regex));
  });
}

/**
 * 计算内容中关键词的出现次数
 * @param {string} content - 要匹配的内容
 * @param {(string|RegExp)[]} keys - 关键词数组
 * @returns {number} 关键词出现的总次数
 */
export function baseMatchKeysCount(content, keys) {
  return baseMatchKeys(content, keys, (content, regexKeys) => {
    return regexKeys.reduce((total, regex) => {
      const matches = content.match(regex);
      return total + (matches ? matches.length : 0);
    }, 0);
  });
}

/**
 * 在消息数组中匹配关键词
 * @param {Array<{role: string, content: string, name?: string}>} messages - 消息数组
 * @param {(string|RegExp)[]} keys - 关键词数组
 * @param {'any'|'user'|'assistant'|'system'} [scope='any'] - 匹配范围
 * @param {number} [depth=4] - 搜索深度
 * @returns {number} 匹配到的关键词数量
 */
export function matchKeys(messages, keys, scope = 'any', depth = 4) {
  if (!messages || messages.length === 0) {
    return 0;
  }

  // 获取最近的消息
  const recentMessages = messages.slice(-depth);

  // 根据范围过滤消息
  let filteredMessages = recentMessages;
  if (scope !== 'any') {
    filteredMessages = recentMessages.filter(msg => msg.role === scope);
  }

  // 统计所有匹配的关键词
  let totalMatches = 0;
  for (const message of filteredMessages) {
    if (message.content) {
      totalMatches += baseMatchKeys(message.content, keys);
    }
  }

  return totalMatches;
}

/**
 * 检查消息数组中是否所有关键词都匹配
 * @param {Array<{role: string, content: string, name?: string}>} messages - 消息数组
 * @param {(string|RegExp)[]} keys - 关键词数组
 * @param {'any'|'user'|'assistant'|'system'} [scope='any'] - 匹配范围
 * @param {number} [depth=4] - 搜索深度
 * @returns {boolean} 是否所有关键词都匹配
 */
export function matchKeysAll(messages, keys, scope = 'any', depth = 4) {
  if (!messages || messages.length === 0 || !keys || keys.length === 0) {
    return false;
  }

  // 获取最近的消息
  const recentMessages = messages.slice(-depth);

  // 根据范围过滤消息
  let filteredMessages = recentMessages;
  if (scope !== 'any') {
    filteredMessages = recentMessages.filter(msg => msg.role === scope);
  }

  // 合并所有内容
  const combinedContent = filteredMessages
    .map(msg => msg.content || '')
    .join(' ');

  return baseMatchKeysAll(combinedContent, keys);
}

/**
 * 创建消息的上下文快照
 * @param {Array<{role: string, content: string, name?: string}>} messages - 消息数组
 * @param {number} [depth] - 要包含的消息数量
 * @returns {string} 格式化的上下文快照
 */
export function createContextSnapshot(messages, depth) {
  if (!messages || messages.length === 0) {
    return '';
  }

  const selectedMessages = depth ? messages.slice(-depth) : messages;
  
  return selectedMessages
    .map(msg => {
      const speaker = msg.name || msg.role;
      return `${speaker}: ${msg.content || ''}`;
    })
    .join('\n');
}

export default {
  baseMatchKeys,
  baseMatchKeysAll,
  baseMatchKeysCount,
  matchKeys,
  matchKeysAll,
  createContextSnapshot
};

