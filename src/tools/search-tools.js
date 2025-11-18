/**
 * 高級搜索工具
 * 提供靈活的記憶搜索功能
 */

import { z } from 'zod';
import { extractKeywords } from '../nlp/jieba.js';

/**
 * 創建高級搜索工具
 * @param {Function} getShortTermManager - 獲取短期記憶管理器
 * @param {Function} getLongTermManager - 獲取長期記憶管理器
 * @returns {Array} 工具定義數組
 */
export function createSearchTools(getShortTermManager, getLongTermManager) {
  const tools = [];

  // 高級搜索工具
  tools.push({
    name: 'search_memories',
    description: '使用高級過濾條件搜索記憶。支持關鍵詞、時間範圍、分數過濾等。',
    inputSchema: z.object({
      conversation_id: z.string().describe('對話 ID'),
      query: z.string().optional().describe('搜索查詢文本（將提取關鍵詞）'),
      keywords: z.array(z.string()).optional().describe('直接指定關鍵詞列表'),
      date_from: z.string().optional().describe('起始日期（ISO 格式）'),
      date_to: z.string().optional().describe('結束日期（ISO 格式）'),
      min_score: z.number().optional().describe('最低分數'),
      max_score: z.number().optional().describe('最高分數'),
      limit: z.number().default(20).describe('返回結果數量限制'),
      sort_by: z.enum(['relevance', 'score', 'timestamp']).default('relevance').describe('排序方式'),
      order: z.enum(['asc', 'desc']).default('desc').describe('排序順序'),
      memory_type: z.enum(['short_term', 'long_term', 'both']).default('short_term').describe('搜索的記憶類型')
    }),
    async handler(args) {
      const {
        conversation_id,
        query,
        keywords: providedKeywords,
        date_from,
        date_to,
        min_score,
        max_score,
        limit,
        sort_by,
        order,
        memory_type
      } = args;

      try {
        const results = [];

        // 搜索短期記憶
        if (memory_type === 'short_term' || memory_type === 'both') {
          const manager = await getShortTermManager(conversation_id);
          const memories = manager.getMemories();

          const filtered = await filterMemories(memories, {
            query,
            providedKeywords,
            date_from,
            date_to,
            min_score,
            max_score
          });

          results.push(...filtered.map(m => ({ ...m, memory_type: 'short_term' })));
        }

        // 搜索長期記憶
        if (memory_type === 'long_term' || memory_type === 'both') {
          const manager = await getLongTermManager(conversation_id);
          const memories = manager.getMemories();

          const filtered = await filterMemories(memories, {
            query,
            providedKeywords,
            date_from: date_from,
            date_to: date_to,
            min_score,
            max_score,
            isLongTerm: true
          });

          results.push(...filtered.map(m => ({ ...m, memory_type: 'long_term' })));
        }

        // 排序
        sortResults(results, sort_by, order);

        // 限制結果數量
        const limitedResults = results.slice(0, limit);

        return {
          success: true,
          total_found: results.length,
          returned: limitedResults.length,
          results: limitedResults.map(formatSearchResult)
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  });

  // 統計分析工具
  tools.push({
    name: 'analyze_memory_patterns',
    description: '分析記憶使用模式，提供統計信息和洞察',
    inputSchema: z.object({
      conversation_id: z.string().describe('對話 ID'),
      memory_type: z.enum(['short_term', 'long_term', 'both']).default('both').describe('分析的記憶類型'),
      top_keywords: z.number().default(20).describe('返回最常見關鍵詞的數量')
    }),
    async handler(args) {
      const { conversation_id, memory_type, top_keywords } = args;

      try {
        const analysis = {
          conversation_id,
          timestamp: new Date().toISOString(),
          short_term: null,
          long_term: null
        };

        // 分析短期記憶
        if (memory_type === 'short_term' || memory_type === 'both') {
          const manager = await getShortTermManager(conversation_id);
          analysis.short_term = analyzeMemories(manager.getMemories(), top_keywords);
        }

        // 分析長期記憶
        if (memory_type === 'long_term' || memory_type === 'both') {
          const manager = await getLongTermManager(conversation_id);
          analysis.long_term = analyzeMemories(manager.getMemories(), top_keywords, true);
        }

        return {
          success: true,
          ...analysis
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  });

  return tools;
}

/**
 * 過濾記憶
 * @param {Array} memories - 記憶數組
 * @param {Object} filters - 過濾條件
 * @returns {Promise<Array>} 過濾後的記憶
 */
async function filterMemories(memories, filters) {
  const {
    query,
    providedKeywords,
    date_from,
    date_to,
    min_score,
    max_score,
    isLongTerm
  } = filters;

  let filtered = [...memories];

  // 關鍵詞過濾
  if (query || providedKeywords) {
    let searchKeywords = [];

    if (query) {
      const extracted = extractKeywords(query, 10);
      searchKeywords = extracted.map(kw => kw.word.toLowerCase());
    }

    if (providedKeywords) {
      searchKeywords = [...searchKeywords, ...providedKeywords.map(k => k.toLowerCase())];
    }

    filtered = filtered.filter(mem => {
      const memoryKeywords = (mem.keywords || []).map(kw =>
        (kw.word || kw).toLowerCase()
      );

      return searchKeywords.some(sk => memoryKeywords.includes(sk));
    });
  }

  // 日期範圍過濾
  if (date_from || date_to) {
    const fromTimestamp = date_from ? new Date(date_from).getTime() : 0;
    const toTimestamp = date_to ? new Date(date_to).getTime() : Infinity;

    filtered = filtered.filter(mem => {
      let timestamp;

      if (isLongTerm) {
        timestamp = mem.createdAt ? new Date(mem.createdAt).getTime() : 0;
      } else {
        timestamp = mem.time_stamp ? new Date(mem.time_stamp).getTime() : 0;
      }

      return timestamp >= fromTimestamp && timestamp <= toTimestamp;
    });
  }

  // 分數範圍過濾
  if (min_score !== undefined || max_score !== undefined) {
    const minScoreVal = min_score !== undefined ? min_score : -Infinity;
    const maxScoreVal = max_score !== undefined ? max_score : Infinity;

    filtered = filtered.filter(mem => {
      const score = mem.score || 0;
      return score >= minScoreVal && score <= maxScoreVal;
    });
  }

  return filtered;
}

/**
 * 排序結果
 * @param {Array} results - 結果數組
 * @param {string} sortBy - 排序字段
 * @param {string} order - 排序順序
 */
function sortResults(results, sortBy, order) {
  results.sort((a, b) => {
    let valueA, valueB;

    if (sortBy === 'score') {
      valueA = a.score || 0;
      valueB = b.score || 0;
    } else if (sortBy === 'timestamp') {
      valueA = a.time_stamp ? new Date(a.time_stamp).getTime() : new Date(a.createdAt).getTime();
      valueB = b.time_stamp ? new Date(b.time_stamp).getTime() : new Date(b.createdAt).getTime();
    } else {
      // 默認為相關性（使用分數）
      valueA = a.score || 0;
      valueB = b.score || 0;
    }

    if (order === 'asc') {
      return valueA - valueB;
    } else {
      return valueB - valueA;
    }
  });
}

/**
 * 格式化搜索結果
 * @param {Object} memory - 記憶對象
 * @returns {Object} 格式化後的結果
 */
function formatSearchResult(memory) {
  const result = {
    memory_type: memory.memory_type,
    score: memory.score || 0
  };

  if (memory.memory_type === 'short_term') {
    result.text = memory.text;
    result.timestamp = memory.time_stamp;
    result.keywords = memory.keywords?.slice(0, 5);
    result.conversation_id = memory.conversation_id;
  } else {
    result.name = memory.name;
    result.prompt = memory.prompt;
    result.trigger = memory.trigger;
    result.created_at = memory.createdAt;
  }

  return result;
}

/**
 * 分析記憶模式
 * @param {Array} memories - 記憶數組
 * @param {number} topN - 返回前 N 個關鍵詞
 * @param {boolean} isLongTerm - 是否為長期記憶
 * @returns {Object} 分析結果
 */
function analyzeMemories(memories, topN = 20, isLongTerm = false) {
  const total = memories.length;

  if (total === 0) {
    return {
      total: 0,
      average_score: 0,
      score_distribution: {},
      top_keywords: [],
      time_distribution: {}
    };
  }

  // 計算平均分數
  let totalScore = 0;
  const scoreDistribution = { negative: 0, low: 0, medium: 0, high: 0 };

  for (const mem of memories) {
    const score = mem.score || 0;
    totalScore += score;

    if (score < 0) scoreDistribution.negative++;
    else if (score < 10) scoreDistribution.low++;
    else if (score < 30) scoreDistribution.medium++;
    else scoreDistribution.high++;
  }

  const averageScore = totalScore / total;

  // 統計關鍵詞
  const keywordCounts = new Map();

  for (const mem of memories) {
    const keywords = mem.keywords || [];

    for (const kw of keywords) {
      const word = (kw.word || kw).toLowerCase();
      const weight = kw.weight || 1;

      keywordCounts.set(word, (keywordCounts.get(word) || 0) + weight);
    }
  }

  // 獲取最常見的關鍵詞
  const topKeywords = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count: count.toFixed(2) }));

  // 時間分布
  const timeDistribution = analyzeTimeDistribution(memories, isLongTerm);

  return {
    total,
    average_score: averageScore.toFixed(2),
    score_distribution: scoreDistribution,
    top_keywords: topKeywords,
    time_distribution: timeDistribution
  };
}

/**
 * 分析時間分布
 * @param {Array} memories - 記憶數組
 * @param {boolean} isLongTerm - 是否為長期記憶
 * @returns {Object} 時間分布
 */
function analyzeTimeDistribution(memories, isLongTerm) {
  const now = Date.now();
  const distribution = {
    last_hour: 0,
    last_day: 0,
    last_week: 0,
    last_month: 0,
    older: 0
  };

  for (const mem of memories) {
    let timestamp;

    if (isLongTerm) {
      timestamp = mem.createdAt ? new Date(mem.createdAt).getTime() : 0;
    } else {
      timestamp = mem.time_stamp ? new Date(mem.time_stamp).getTime() : 0;
    }

    const age = now - timestamp;

    if (age < 3600000) distribution.last_hour++;
    else if (age < 86400000) distribution.last_day++;
    else if (age < 604800000) distribution.last_week++;
    else if (age < 2592000000) distribution.last_month++;
    else distribution.older++;
  }

  return distribution;
}

export default createSearchTools;
