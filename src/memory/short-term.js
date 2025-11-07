/**
 * 短期记忆核心逻辑
 * 基于关键词相关性、时间衰减和分数的动态记忆管理系统
 */

import { extractKeywords } from '../nlp/jieba.js';
import { createContextSnapshot } from '../nlp/keywords.js';
import { normalizeModalities } from './modalities.js';

// --- 常量定义 ---
const RELEVANCE_THRESHOLD = 5;      // 激活相关记忆的阈值
const SCORE_INCREMENT_TOP = 5;      // 高相关记忆分数增加值
const SCORE_INCREMENT_NEXT = 2;     // 次相关记忆分数增加值
// -- 时间衰减 --
const TIME_DECAY_FACTOR_EXP = 2e-9; // 时间衰减因子（指数模型）
const MAX_TIME_PENALTY = 15;        // 时间衰减造成的最大分数惩罚值
// -- 随机选择权重 --
const BASE_RANDOM_WEIGHT = 1;         // 基础权重
const RANDOM_WEIGHT_RECENCY_FACTOR = 1.7; // 近期性权重因子
const RANDOM_WEIGHT_SCORE_FACTOR = 1.1;   // 分数权重因子
const MAX_SCORE_FOR_RANDOM_WEIGHT = 50;   // 用于计算随机权重的最高分数上限
// -- 关键词提取 --
const KEYWORD_MIN_WEIGHT = 0.8;       // 提取关键词的最低权重阈值
// -- 清理 --
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 清理间隔（1天）
const MEMORY_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 记忆最大存活时间（1年）
const CLEANUP_MIN_SCORE_THRESHOLD = -5; // 清理时的最低分数阈值
const MIN_RETAINED_MEMORIES = 512;    // 清理后最少保留的记忆数量
// -- 激活逻辑去重/过滤 --
const MIN_TIME_DIFFERENCE_ANY_MS = 10 * 60 * 1000; // 10分钟
const MIN_TIME_DIFFERENCE_SAME_CONVERSATION_MS = 20 * 60 * 1000; // 20分钟
const MAX_TOP_RELEVANT = 2; // 最多选几条最相关
const MAX_NEXT_RELEVANT = 1; // 最多选几条次相关
const MAX_RANDOM_FLASHBACK = 2; // 最多选几条随机

const TRANSCRIPT_KEYWORD_WEIGHT = 0.6;
const MAX_TRANSCRIPT_KEYWORDS = 24;

function getModalityEmbedding(modality) {
  if (!modality || typeof modality !== 'object') {
    return null;
  }

  const features = modality.features;
  if (!features || typeof features !== 'object') {
    return null;
  }

  const candidates = [features.embedding, features.vector, features.featureVector];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.every(value => Number.isFinite(value))) {
      return candidate;
    }
  }

  return null;
}

function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
    return 0;
  }

  const length = Math.min(vecA.length, vecB.length);
  if (length === 0) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  let usedDimensions = 0;

  for (let i = 0; i < length; i++) {
    const a = Number(vecA[i]);
    const b = Number(vecB[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      continue;
    }
    dot += a * b;
    magA += a * a;
    magB += b * b;
    usedDimensions++;
  }

  if (usedDimensions === 0 || magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function collectModalityKeywords(modalities) {
  const collected = [];

  if (!Array.isArray(modalities)) {
    return collected;
  }

  for (const modality of modalities) {
    if (!modality || typeof modality !== 'object') {
      continue;
    }

    const keywordSources = [];

    if (Array.isArray(modality.keywords)) {
      keywordSources.push(...modality.keywords);
    }

    if (modality.features && typeof modality.features === 'object') {
      const featureKeywords = modality.features.keywords || modality.features.tags;
      if (Array.isArray(featureKeywords)) {
        keywordSources.push(...featureKeywords);
      }
    }

    for (const kw of keywordSources) {
      if (typeof kw === 'string') {
        collected.push({ word: kw, weight: 1 });
      } else if (kw && typeof kw === 'object') {
        const word = typeof kw.word === 'string'
          ? kw.word
          : (typeof kw.term === 'string' ? kw.term : null);
        if (!word) {
          continue;
        }
        const weight = Number.isFinite(kw.weight)
          ? kw.weight
          : (Number.isFinite(kw.score) ? kw.score : 1);
        collected.push({ word, weight });
      }
    }

    if (typeof modality.transcript === 'string' && modality.transcript.trim()) {
      const extracted = extractKeywords(modality.transcript, MAX_TRANSCRIPT_KEYWORDS);
      for (const kw of extracted) {
        collected.push({ word: kw.word, weight: kw.weight * TRANSCRIPT_KEYWORD_WEIGHT });
      }
    }
  }

  return collected;
}

function calculateModalityVectorScore(memoryModalities, queryModalities) {
  if (!Array.isArray(memoryModalities) || !Array.isArray(queryModalities) || !memoryModalities.length || !queryModalities.length) {
    return 0;
  }

  let totalScore = 0;
  let comparisons = 0;

  for (const memoryModality of memoryModalities) {
    const memoryEmbedding = getModalityEmbedding(memoryModality);
    if (!memoryEmbedding) {
      continue;
    }

    for (const queryModality of queryModalities) {
      if (queryModality.type && memoryModality.type && queryModality.type !== memoryModality.type) {
        continue;
      }

      const queryEmbedding = getModalityEmbedding(queryModality);
      if (!queryEmbedding) {
        continue;
      }

      const similarity = cosineSimilarity(memoryEmbedding, queryEmbedding);
      if (Number.isFinite(similarity)) {
        totalScore += similarity;
        comparisons++;
      }
    }
  }

  if (comparisons === 0) {
    return 0;
  }

  return totalScore / comparisons;
}

/**
 * 短期记忆管理器
 */
export class ShortTermMemoryManager {
  constructor() {
    this.memories = [];
    this.lastCleanupTime = Date.now();
  }

  /**
   * 加载记忆数据
   * @param {Array} memories - 记忆数组
   */
  loadMemories(memories) {
    if (!Array.isArray(memories)) {
      console.warn('[ShortTermMemory] Expected memories to be an array when loading, received:', typeof memories);
      this.memories = [];
      return;
    }

    const normalizedMemories = [];

    memories.forEach((mem, index) => {
      if (!mem || typeof mem !== 'object') {
        console.warn(`[ShortTermMemory] Skipping memory #${index}: invalid entry`);
        return;
      }

      const text = typeof mem.text === 'string' ? mem.text : '';
      if (!text.trim()) {
        console.warn(`[ShortTermMemory] Skipping memory #${index}: missing text content`);
        return;
      }

      let timeStampSource = mem.time_stamp ?? mem.timestamp ?? mem.timeStamp;
      let parsedTimestamp = timeStampSource ? new Date(timeStampSource) : new Date();
      if (!(parsedTimestamp instanceof Date) || Number.isNaN(parsedTimestamp.getTime())) {
        console.warn(`[ShortTermMemory] Memory #${index} has invalid timestamp, defaulting to current time`);
        parsedTimestamp = new Date();
      }

      let keywords = [];
      if (Array.isArray(mem.keywords)) {
        keywords = mem.keywords
          .map((kw, kwIndex) => {
            if (!kw || typeof kw.word !== 'string') {
              console.warn(`[ShortTermMemory] Memory #${index} keyword #${kwIndex} is invalid, skipping`);
              return null;
            }

            const weight = Number.isFinite(kw.weight) ? kw.weight : 1;
            return { word: kw.word, weight };
          })
          .filter(Boolean);
      } else {
        console.warn(`[ShortTermMemory] Memory #${index} missing keywords array, defaulting to empty list`);
      }

      const score = Number.isFinite(mem.score) ? mem.score : 0;
      const conversationId = typeof mem.conversation_id === 'string' ? mem.conversation_id : 'default';

      const modalities = normalizeModalities(mem.modalities ?? mem.attachments ?? []);

      normalizedMemories.push({
        ...mem,
        text,
        keywords,
        score,
        conversation_id: conversationId,
        time_stamp: parsedTimestamp,
        modalities,
        attachments: modalities
      });
    });

    this.memories = normalizedMemories;
  }

  /**
   * 获取当前所有记忆
   * @returns {Array}
   */
  getMemories() {
    return this.memories;
  }

  /**
   * 提取消息的关键词
   * @param {Array<{role: string, content: string}>} messages - 消息数组
   * @param {Object} [weights] - 角色权重配置
   * @returns {Promise<Array<{word: string, weight: number}>>}
   */
  async extractMessageKeywords(messages, weights = {}) {
    const keywordMap = {};

    for (const message of messages) {
      const text = message.content;
      if (!text || !text.trim()) continue;

      // 根据角色应用权重倍数
      const multiplier = weights[message.role] || 1.0;

      const keywords = extractKeywords(text, 72);
      for (const kw of keywords) {
        keywordMap[kw.word] = kw.weight * multiplier + (keywordMap[kw.word] || 0);
      }
    }

    return Object.entries(keywordMap)
      .map(([word, weight]) => ({ word, weight }))
      .filter(kw => kw.weight >= KEYWORD_MIN_WEIGHT)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 72);
  }

  /**
   * 计算单个记忆的相关性分数
   * @param {Object} memory - 记忆条目
   * @param {Array<{word: string, weight: number}>} currentKeywords - 当前关键词
   * @param {number} currentTimeStamp - 当前时间戳
   * @returns {number} 相关性分数
   */
  calculateRelevance(memory, currentKeywords, currentTimeStamp, options = {}) {
    let relevanceScore = 0;

    const queryModalities = Array.isArray(options.queryModalities)
      ? options.queryModalities
      : normalizeModalities(options.attachments ?? []);

    const memoryModalities = Array.isArray(memory.modalities)
      ? memory.modalities
      : (Array.isArray(memory.attachments) ? normalizeModalities(memory.attachments) : []);

    // 关键词匹配分数
    const memoryKeywordsArray = Array.isArray(memory.keywords)
      ? memory.keywords.filter(kw => kw && typeof kw.word === 'string')
      : [];
    const modalityKeywords = collectModalityKeywords(memoryModalities);
    const memoryKeywordMap = new Map();
    for (const kw of [...memoryKeywordsArray, ...modalityKeywords]) {
      if (!kw || typeof kw.word !== 'string') {
        continue;
      }
      const baseWeight = Number.isFinite(kw.weight) ? kw.weight : 1;
      const existing = memoryKeywordMap.get(kw.word);
      if (existing) {
        existing.weight += baseWeight;
      } else {
        memoryKeywordMap.set(kw.word, { word: kw.word, weight: baseWeight });
      }
    }

    let keywordMatchScore = 0;

    for (const currentKw of currentKeywords) {
      if (!currentKw || typeof currentKw.word !== 'string') {
        continue;
      }
      if (!memoryKeywordMap.has(currentKw.word)) {
        continue;
      }
      const memoryKw = memoryKeywordMap.get(currentKw.word);
      const currentWeight = Number.isFinite(currentKw.weight) ? currentKw.weight : 1;
      const memoryWeight = Number.isFinite(memoryKw?.weight) ? memoryKw.weight : 0;
      keywordMatchScore += currentWeight + memoryWeight;
    }
    relevanceScore += keywordMatchScore;

    // 时间衰减惩罚
    const memoryTime = memory.time_stamp instanceof Date ? memory.time_stamp.getTime() : 0;
    const timeDiff = Math.max(0, currentTimeStamp - (Number.isFinite(memoryTime) ? memoryTime : 0));
    const timePenalty = MAX_TIME_PENALTY * (1 - Math.exp(-timeDiff * TIME_DECAY_FACTOR_EXP));
    relevanceScore -= timePenalty;

    // 加上记忆自身分数
    const memoryScore = Number.isFinite(memory.score) ? memory.score : 0;
    relevanceScore += memoryScore;

    // 模态向量相似度
    const vectorScore = calculateModalityVectorScore(memoryModalities, queryModalities);
    if (Number.isFinite(vectorScore) && vectorScore !== 0) {
      const vectorWeight = Number.isFinite(options.modalityVectorWeight)
        ? options.modalityVectorWeight
        : 10;
      relevanceScore += vectorScore * vectorWeight;
    }

    return relevanceScore;
  }

  /**
   * 加权随机选择一个项
   * @template T
   * @param {T[]} items - 待选择项
   * @param {number[]} weights - 权重
   * @returns {T | null}
   */
  selectOneWeightedRandom(items, weights) {
    if (!items?.length || items.length !== weights.length) {
      return null;
    }

    const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
    
    if (totalWeight <= 0) {
      return items.length ? items[Math.floor(Math.random() * items.length)] : null;
    }

    const randomVal = Math.random() * totalWeight;
    let cumulativeWeight = 0;

    for (let i = 0; i < items.length; i++) {
      const weight = Math.max(0, weights[i]);
      cumulativeWeight += weight;
      if (randomVal <= cumulativeWeight) {
        return items[i];
      }
    }

    return items[items.length - 1];
  }

  /**
   * 搜索相关记忆
   * @param {Array<{role: string, content: string}>} recentMessages - 最近的消息
   * @param {string} conversationId - 当前对话 ID
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>} 搜索结果
   */
  async searchRelevantMemories(recentMessages, conversationId, options = {}) {
    const currentTimeStamp = Date.now();

    const queryModalities = normalizeModalities(options.queryModalities ?? options.attachments ?? []);

    // 提取当前对话的关键词
    const messageKeywords = await this.extractMessageKeywords(recentMessages, options.roleWeights);
    const modalityKeywords = collectModalityKeywords(queryModalities);
    const currentKeywords = [...messageKeywords, ...modalityKeywords];

    const searchOptions = { ...options, queryModalities };
    if ('attachments' in searchOptions) {
      delete searchOptions.attachments;
    }

    // 计算所有记忆的相关性
    const scoredMemories = this.memories
      .map((mem, index) => ({
        memory: mem,
        relevance: this.calculateRelevance(mem, currentKeywords, currentTimeStamp, searchOptions),
        index
      }))
      .filter(item => item.relevance >= RELEVANCE_THRESHOLD)
      .sort((a, b) => b.relevance - a.relevance);

    // 选择相关和次相关记忆
    const selectedIndices = new Set();
    const finalTopRelevant = [];
    const finalNextRelevant = [];
    const allSelectedRelevantMemories = [];

    for (const candidateMemory of scoredMemories) {
      if (finalTopRelevant.length >= MAX_TOP_RELEVANT && finalNextRelevant.length >= MAX_NEXT_RELEVANT) {
        break;
      }

      const isFromSameConversation = candidateMemory.memory.conversation_id === conversationId;
      const timeDiffSinceMemory = currentTimeStamp - candidateMemory.memory.time_stamp.getTime();

      // 跳过同对话的近期记忆
      if (isFromSameConversation && timeDiffSinceMemory < MIN_TIME_DIFFERENCE_SAME_CONVERSATION_MS) {
        continue;
      }

      // 检查是否与已选记忆时间过近
      let isTooCloseToSelected = false;
      for (const selectedMem of allSelectedRelevantMemories) {
        if (Math.abs(candidateMemory.memory.time_stamp.getTime() - selectedMem.memory.time_stamp.getTime()) < MIN_TIME_DIFFERENCE_ANY_MS) {
          isTooCloseToSelected = true;
          break;
        }
      }

      if (isTooCloseToSelected) continue;

      // 分配到 Top 或 Next
      if (finalTopRelevant.length < MAX_TOP_RELEVANT) {
        finalTopRelevant.push(candidateMemory);
        allSelectedRelevantMemories.push(candidateMemory);
        selectedIndices.add(candidateMemory.index);
      } else if (finalNextRelevant.length < MAX_NEXT_RELEVANT) {
        finalNextRelevant.push(candidateMemory);
        allSelectedRelevantMemories.push(candidateMemory);
        selectedIndices.add(candidateMemory.index);
      }
    }

    // 随机闪回选择
    const finalRandomFlashback = [];
    let availableForRandomPool = this.memories
      .map((mem, index) => ({ memory: mem, index }))
      .filter(item => !selectedIndices.has(item.index));

    for (let i = 0; i < MAX_RANDOM_FLASHBACK && availableForRandomPool.length; i++) {
      const currentCandidates = availableForRandomPool.filter(candidate => {
        const isFromSameConversation = candidate.memory.conversation_id === conversationId;
        const timeDiffSinceMemory = currentTimeStamp - candidate.memory.time_stamp.getTime();

        if (isFromSameConversation && timeDiffSinceMemory < MIN_TIME_DIFFERENCE_SAME_CONVERSATION_MS) {
          return false;
        }

        const allPreviouslySelected = [...allSelectedRelevantMemories, ...finalRandomFlashback];
        for (const selectedItem of allPreviouslySelected) {
          if (Math.abs(candidate.memory.time_stamp.getTime() - selectedItem.memory.time_stamp.getTime()) < MIN_TIME_DIFFERENCE_ANY_MS) {
            return false;
          }
        }

        return true;
      });

      if (!currentCandidates.length) break;

      // 计算权重
      const weights = currentCandidates.map(item => {
        const ageFactor = Math.max(0, 1 - (currentTimeStamp - item.memory.time_stamp.getTime()) / MEMORY_TTL_MS);
        const cappedScore = Math.max(0, Math.min(item.memory.score, MAX_SCORE_FOR_RANDOM_WEIGHT));
        const normalizedScoreFactor = MAX_SCORE_FOR_RANDOM_WEIGHT > 0 ? cappedScore / MAX_SCORE_FOR_RANDOM_WEIGHT : 0;
        const weight = BASE_RANDOM_WEIGHT + 
                      ageFactor * RANDOM_WEIGHT_RECENCY_FACTOR + 
                      normalizedScoreFactor * RANDOM_WEIGHT_SCORE_FACTOR;
        return Math.max(0, weight);
      });

      const selectedRandomItem = this.selectOneWeightedRandom(currentCandidates, weights);

      if (selectedRandomItem) {
        selectedRandomItem.relevance = this.calculateRelevance(selectedRandomItem.memory, currentKeywords, currentTimeStamp, searchOptions);
        finalRandomFlashback.push(selectedRandomItem);
        availableForRandomPool = availableForRandomPool.filter(item => item.index !== selectedRandomItem.index);
      } else {
        break;
      }
    }

    // 强化被激活的记忆
    finalTopRelevant.forEach(item => {
      const memoryToUpdate = this.memories[item.index];
      if (memoryToUpdate) {
        memoryToUpdate.score = Math.min(memoryToUpdate.score + SCORE_INCREMENT_TOP, 100);
      }
    });
    finalNextRelevant.forEach(item => {
      const memoryToUpdate = this.memories[item.index];
      if (memoryToUpdate) {
        memoryToUpdate.score = Math.min(memoryToUpdate.score + SCORE_INCREMENT_NEXT, 100);
      }
    });

    return {
      topRelevant: finalTopRelevant,
      nextRelevant: finalNextRelevant,
      randomFlashback: finalRandomFlashback
    };
  }

  /**
   * 添加新记忆
   * @param {Array<{role: string, content: string}>} messages - 消息数组
   * @param {string} conversationId - 对话 ID
   * @param {Object} [options] - 选项
   * @returns {Promise<boolean>} 是否成功添加
   */
  async addMemory(messages, conversationId, options = {}) {
    if (!messages || messages.length === 0) {
      return false;
    }

    // 提取关键词
    const keywords = await this.extractMessageKeywords(messages, options.roleWeights);

    // 创建上下文快照
    const contextSnapshot = createContextSnapshot(messages);

    if (!contextSnapshot.trim()) {
      console.warn('Skipping empty memory');
      return false;
    }

    // 添加新记忆
    const lastMessage = messages[messages.length - 1];
    const modalities = normalizeModalities(options.modalities ?? options.attachments ?? []);

    this.memories.push({
      time_stamp: new Date(lastMessage.timestamp || Date.now()),
      text: contextSnapshot,
      keywords: keywords,
      score: 0,
      conversation_id: conversationId,
      modalities,
      attachments: modalities
    });

    return true;
  }

  /**
   * 删除匹配的记忆
   * @param {string|RegExp} pattern - 匹配模式
   * @returns {number} 删除的数量
   */
  deleteMemories(pattern) {
    const oldLength = this.memories.length;
    
    if (pattern instanceof RegExp) {
      this.memories = this.memories.filter(mem => !pattern.test(mem.text));
    } else {
      this.memories = this.memories.filter(mem => !mem.text.includes(pattern));
    }

    return oldLength - this.memories.length;
  }

  /**
   * 清理旧的或不相关的记忆
   * @param {number} [currentTimeStamp] - 当前时间戳
   * @returns {number} 清理的数量
   */
  cleanup(currentTimeStamp = Date.now()) {
    const initialCount = this.memories.length;
    const oneYearAgo = currentTimeStamp - MEMORY_TTL_MS;

    const passingMemories = [];
    const failingMemories = [];

    for (const mem of this.memories) {
      const relevance = this.calculateRelevance(mem, [], currentTimeStamp, {});
      mem._relevance = relevance;

      if (mem.time_stamp.getTime() < oneYearAgo) {
        failingMemories.push(mem);
      } else if (relevance >= CLEANUP_MIN_SCORE_THRESHOLD) {
        passingMemories.push(mem);
      } else {
        failingMemories.push(mem);
      }
    }

    if (passingMemories.length >= MIN_RETAINED_MEMORIES) {
      this.memories = passingMemories;
    } else {
      const neededFromFailing = MIN_RETAINED_MEMORIES - passingMemories.length;
      failingMemories.sort((a, b) => b._relevance - a._relevance);
      const supplementaryMemories = failingMemories.slice(0, neededFromFailing);
      this.memories = [...passingMemories, ...supplementaryMemories];
    }

    // 清理临时属性
    for (const mem of this.memories) {
      delete mem._relevance;
    }

    this.lastCleanupTime = currentTimeStamp;
    const removed = initialCount - this.memories.length;
    
    if (removed > 0) {
      console.log(`[Memory] Cleanup: removed ${removed} entries, ${this.memories.length} remaining`);
    }

    return removed;
  }

  /**
   * 检查是否需要清理
   * @returns {boolean}
   */
  shouldCleanup() {
    return (Date.now() - this.lastCleanupTime) > CLEANUP_INTERVAL_MS;
  }

  /**
   * 获取记忆统计信息
   * @returns {Object}
   */
  getStats() {
    const now = Date.now();
    const conversationCounts = {};
    let totalScore = 0;
    let maxScore = -Infinity;
    let minScore = Infinity;

    for (const mem of this.memories) {
      conversationCounts[mem.conversation_id] = (conversationCounts[mem.conversation_id] || 0) + 1;
      totalScore += mem.score;
      maxScore = Math.max(maxScore, mem.score);
      minScore = Math.min(minScore, mem.score);
    }

    return {
      total: this.memories.length,
      conversationCounts,
      avgScore: this.memories.length > 0 ? totalScore / this.memories.length : 0,
      maxScore: this.memories.length > 0 ? maxScore : 0,
      minScore: this.memories.length > 0 ? minScore : 0,
      oldestMemory: this.memories.length > 0 
        ? Math.min(...this.memories.map(m => m.time_stamp.getTime()))
        : null,
      newestMemory: this.memories.length > 0 
        ? Math.max(...this.memories.map(m => m.time_stamp.getTime()))
        : null,
      lastCleanup: this.lastCleanupTime
    };
  }

  /**
   * 获取最频繁的对话 ID
   * @returns {string|null}
   */
  getMostFrequentConversation() {
    if (this.memories.length === 0) return null;

    const counts = {};
    for (const mem of this.memories) {
      counts[mem.conversation_id] = (counts[mem.conversation_id] || 0) + 1;
    }

    let maxCount = 0;
    let mostFrequent = null;
    for (const [id, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = id;
      }
    }

    return mostFrequent;
  }
}

export default ShortTermMemoryManager;

