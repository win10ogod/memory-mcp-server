/**
 * Jieba 中文分词封装
 * 提供关键词提取功能
 */

import jieba from '@node-rs/jieba';

/**
 * 从文本中提取关键词
 * @param {string} text - 要提取关键词的文本
 * @param {number} num - 要提取的关键词数量
 * @returns {Array<{word: string, weight: number}>} 关键词和权重数组
 */
export function extractKeywords(text, num) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  try {
    // 使用 jieba.extract 方法提取关键词
    const keywords = jieba.extract(text, num);
    // 权重乘以 5 以匹配原始实现的比例
    return keywords.map(({ keyword, weight }) => ({
      word: keyword,
      weight: weight * 5
    }));
  } catch (error) {
    console.error('Error extracting keywords:', error);
    return [];
  }
}

/**
 * 对文本进行分词
 * @param {string} text - 要分词的文本
 * @returns {string[]} 分词结果
 */
export function cut(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  try {
    return jieba.cut(text);
  } catch (error) {
    console.error('Error cutting text:', error);
    return [];
  }
}

export default {
  extractKeywords,
  cut
};

