/**
 * 數據格式優化工具
 * 用於標準化和優化記憶數據結構
 */

/**
 * 標準化時間戳字段
 * 將所有時間戳統一為 ISO 字符串格式
 * @param {Object} memory - 記憶對象
 * @returns {Object} 標準化後的記憶對象
 */
export function normalizeTimestamps(memory) {
  if (!memory || typeof memory !== 'object') {
    return memory;
  }

  const normalized = { ...memory };

  // 統一短期記憶的時間戳
  if (normalized.time_stamp !== undefined) {
    const timestamp = new Date(normalized.time_stamp);
    if (!isNaN(timestamp.getTime())) {
      normalized.timestamp = timestamp.toISOString();
    }
    delete normalized.time_stamp;
    delete normalized.timeStamp;
  } else if (normalized.timeStamp !== undefined) {
    const timestamp = new Date(normalized.timeStamp);
    if (!isNaN(timestamp.getTime())) {
      normalized.timestamp = timestamp.toISOString();
    }
    delete normalized.timeStamp;
  }

  return normalized;
}

/**
 * 移除冗餘的 attachments 字段
 * 只保留 modalities，移除重複的 attachments
 * @param {Object} memory - 記憶對象
 * @returns {Object} 優化後的記憶對象
 */
export function removeAttachmentsRedundancy(memory) {
  if (!memory || typeof memory !== 'object') {
    return memory;
  }

  const optimized = { ...memory };

  // 如果有 modalities，移除 attachments
  if (optimized.modalities !== undefined) {
    delete optimized.attachments;
  } else if (optimized.attachments !== undefined) {
    // 如果只有 attachments，重命名為 modalities
    optimized.modalities = optimized.attachments;
    delete optimized.attachments;
  }

  return optimized;
}

/**
 * 去除關鍵詞重複
 * 合併並去重記憶和 modality 中的關鍵詞
 * @param {Array<{word: string, weight: number}>} keywords - 關鍵詞列表
 * @returns {Array<{word: string, weight: number}>} 去重後的關鍵詞
 */
export function deduplicateKeywords(keywords) {
  if (!Array.isArray(keywords)) {
    return [];
  }

  const keywordMap = new Map();

  for (const kw of keywords) {
    if (!kw || typeof kw.word !== 'string') {
      continue;
    }

    const word = kw.word.trim().toLowerCase();
    if (!word) {
      continue;
    }

    const weight = Number.isFinite(kw.weight) ? kw.weight : 1;

    if (keywordMap.has(word)) {
      // 如果關鍵詞已存在，取最大權重
      const existing = keywordMap.get(word);
      existing.weight = Math.max(existing.weight, weight);
    } else {
      keywordMap.set(word, { word: kw.word, weight });
    }
  }

  return Array.from(keywordMap.values())
    .sort((a, b) => b.weight - a.weight);
}

/**
 * 優化記憶對象
 * 應用所有優化策略
 * @param {Object} memory - 記憶對象
 * @param {Object} [options] - 優化選項
 * @param {boolean} [options.normalizeTimestamps=true] - 是否標準化時間戳
 * @param {boolean} [options.removeAttachmentsRedundancy=true] - 是否移除 attachments 冗餘
 * @param {boolean} [options.deduplicateKeywords=true] - 是否去重關鍵詞
 * @returns {Object} 優化後的記憶對象
 */
export function optimizeMemory(memory, options = {}) {
  if (!memory || typeof memory !== 'object') {
    return memory;
  }

  const {
    normalizeTimestamps: shouldNormalizeTimestamps = true,
    removeAttachmentsRedundancy: shouldRemoveAttachmentsRedundancy = true,
    deduplicateKeywords: shouldDeduplicateKeywords = true
  } = options;

  let optimized = { ...memory };

  // 標準化時間戳
  if (shouldNormalizeTimestamps) {
    optimized = normalizeTimestamps(optimized);
  }

  // 移除 attachments 冗餘
  if (shouldRemoveAttachmentsRedundancy) {
    optimized = removeAttachmentsRedundancy(optimized);
  }

  // 去重關鍵詞
  if (shouldDeduplicateKeywords && Array.isArray(optimized.keywords)) {
    optimized.keywords = deduplicateKeywords(optimized.keywords);
  }

  return optimized;
}

/**
 * 批量優化記憶列表
 * @param {Array<Object>} memories - 記憶列表
 * @param {Object} [options] - 優化選項
 * @returns {Array<Object>} 優化後的記憶列表
 */
export function optimizeMemories(memories, options = {}) {
  if (!Array.isArray(memories)) {
    return [];
  }

  return memories.map(memory => optimizeMemory(memory, options));
}

/**
 * 計算優化節省的空間
 * @param {Object} original - 原始數據
 * @param {Object} optimized - 優化後的數據
 * @returns {{originalSize: number, optimizedSize: number, saved: number, savedPercent: number}}
 */
export function calculateSpaceSavings(original, optimized) {
  const originalSize = JSON.stringify(original).length;
  const optimizedSize = JSON.stringify(optimized).length;
  const saved = originalSize - optimizedSize;
  const savedPercent = originalSize > 0 ? (saved / originalSize) * 100 : 0;

  return {
    originalSize,
    optimizedSize,
    saved,
    savedPercent: Math.round(savedPercent * 100) / 100
  };
}

/**
 * 遷移舊格式數據到新格式
 * @param {Object} legacyMemory - 舊格式記憶
 * @returns {Object} 新格式記憶
 */
export function migrateLegacyFormat(legacyMemory) {
  if (!legacyMemory || typeof legacyMemory !== 'object') {
    return legacyMemory;
  }

  const migrated = optimizeMemory(legacyMemory, {
    normalizeTimestamps: true,
    removeAttachmentsRedundancy: true,
    deduplicateKeywords: true
  });

  // 添加遷移元數據
  if (!migrated._migrated) {
    migrated._migrated = {
      at: new Date().toISOString(),
      version: '0.2.0'
    };
  }

  return migrated;
}

export default {
  normalizeTimestamps,
  removeAttachmentsRedundancy,
  deduplicateKeywords,
  optimizeMemory,
  optimizeMemories,
  calculateSpaceSavings,
  migrateLegacyFormat
};
