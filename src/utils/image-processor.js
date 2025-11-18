/**
 * 圖像處理工具
 * 提供可選的圖像記憶功能
 */

import crypto from 'crypto';

/**
 * 生成圖像內容的哈希值（用於去重）
 * @param {Buffer|string} imageData - 圖像數據或 base64 字符串
 * @returns {string} SHA256 哈希值
 */
export function generateImageHash(imageData) {
  let buffer;

  if (typeof imageData === 'string') {
    // Base64 字符串
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
  } else if (Buffer.isBuffer(imageData)) {
    buffer = imageData;
  } else {
    throw new Error('Invalid image data: must be Buffer or base64 string');
  }

  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * 創建圖像 modality 對象
 * @param {Object} options - 圖像選項
 * @param {string} options.uri - 圖像 URI（URL 或 data URI）
 * @param {Array<number>} [options.embedding] - 圖像特徵向量（可選）
 * @param {Array<string>} [options.tags] - 圖像標籤（可選）
 * @param {string} [options.description] - 圖像描述（可選）
 * @param {Object} [options.metadata] - 額外元數據（可選）
 * @returns {Object} 標準化的圖像 modality
 */
export function createImageModality(options) {
  const { uri, embedding, tags, description, metadata = {} } = options;

  if (!uri || typeof uri !== 'string') {
    throw new Error('Image URI is required');
  }

  const modality = {
    type: 'image',
    uri: uri.trim()
  };

  // 添加特徵（如果提供）
  if (embedding || tags || description) {
    modality.features = {};

    if (Array.isArray(embedding) && embedding.length > 0) {
      if (!embedding.every(v => Number.isFinite(v))) {
        throw new Error('Embedding must contain only finite numbers');
      }
      modality.features.embedding = embedding;
    }

    if (Array.isArray(tags) && tags.length > 0) {
      modality.features.tags = tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim());
    }

    if (typeof description === 'string' && description.trim()) {
      modality.features.description = description.trim();
    }
  }

  // 添加元數據（如果提供）
  if (Object.keys(metadata).length > 0) {
    modality.metadata = {
      ...metadata,
      processedAt: new Date().toISOString()
    };
  }

  // 如果是 base64 圖像，生成哈希用於去重
  if (uri.startsWith('data:image/')) {
    try {
      const hash = generateImageHash(uri);
      if (!modality.metadata) {
        modality.metadata = {};
      }
      modality.metadata.contentHash = hash;
    } catch (error) {
      console.warn('Failed to generate image hash:', error.message);
    }
  }

  return modality;
}

/**
 * 從圖像 URL 創建簡單的 modality
 * @param {string} imageUrl - 圖像 URL
 * @param {Array<string>} [tags] - 可選標籤
 * @returns {Object} 圖像 modality
 */
export function createImageModalityFromUrl(imageUrl, tags = []) {
  return createImageModality({
    uri: imageUrl,
    tags
  });
}

/**
 * 驗證圖像 modality 的完整性
 * @param {Object} modality - modality 對象
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateImageModality(modality) {
  const errors = [];

  if (!modality || typeof modality !== 'object') {
    errors.push('Modality must be an object');
    return { valid: false, errors };
  }

  if (modality.type !== 'image') {
    errors.push('Modality type must be "image"');
  }

  if (!modality.uri || typeof modality.uri !== 'string') {
    errors.push('Modality must have a valid URI');
  }

  if (modality.features) {
    if (typeof modality.features !== 'object') {
      errors.push('Features must be an object');
    } else {
      if (modality.features.embedding) {
        if (!Array.isArray(modality.features.embedding)) {
          errors.push('Embedding must be an array');
        } else if (!modality.features.embedding.every(v => Number.isFinite(v))) {
          errors.push('Embedding must contain only finite numbers');
        }
      }

      if (modality.features.tags) {
        if (!Array.isArray(modality.features.tags)) {
          errors.push('Tags must be an array');
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 比較兩個圖像是否可能重複（基於哈希）
 * @param {Object} modality1 - 第一個 modality
 * @param {Object} modality2 - 第二個 modality
 * @returns {boolean} 是否可能是重複圖像
 */
export function areImagesDuplicate(modality1, modality2) {
  if (!modality1 || !modality2) {
    return false;
  }

  // 檢查 URI 是否完全相同
  if (modality1.uri === modality2.uri) {
    return true;
  }

  // 檢查內容哈希
  const hash1 = modality1.metadata?.contentHash;
  const hash2 = modality2.metadata?.contentHash;

  if (hash1 && hash2 && hash1 === hash2) {
    return true;
  }

  return false;
}

/**
 * 從 modalities 列表中移除重複的圖像
 * @param {Array<Object>} modalities - modalities 列表
 * @returns {Array<Object>} 去重後的列表
 */
export function deduplicateImageModalities(modalities) {
  if (!Array.isArray(modalities)) {
    return [];
  }

  const imageModalities = modalities.filter(m => m.type === 'image');
  const otherModalities = modalities.filter(m => m.type !== 'image');

  const uniqueImages = [];
  const seenHashes = new Set();
  const seenUris = new Set();

  for (const modality of imageModalities) {
    const hash = modality.metadata?.contentHash;
    const uri = modality.uri;

    // 檢查哈希去重
    if (hash && seenHashes.has(hash)) {
      continue;
    }

    // 檢查 URI 去重
    if (seenUris.has(uri)) {
      continue;
    }

    uniqueImages.push(modality);

    if (hash) {
      seenHashes.add(hash);
    }
    seenUris.add(uri);
  }

  return [...uniqueImages, ...otherModalities];
}

export default {
  generateImageHash,
  createImageModality,
  createImageModalityFromUrl,
  validateImageModality,
  areImagesDuplicate,
  deduplicateImageModalities
};
