# 圖像記憶功能指南

本文檔說明如何使用 Memory MCP Server 的圖像記憶功能。

## 概述

圖像記憶功能允許您：
- 存儲帶有圖像的記憶
- 使用圖像嵌入（embeddings）進行相似度搜索
- 自動去重相同的圖像
- 添加圖像標籤和描述

## 快速開始

### 1. 創建圖像 Modality

```javascript
import { createImageModality } from './src/utils/image-processor.js';

// 基本用法 - 僅 URL
const imageModality = createImageModality({
  uri: 'https://example.com/photo.jpg'
});

// 完整用法 - 包含嵌入和標籤
const fullImageModality = createImageModality({
  uri: 'https://example.com/photo.jpg',
  embedding: [0.1, 0.2, 0.3, ...], // 512/768/1024 維向量
  tags: ['vacation', 'beach', 'sunset'],
  description: 'Beautiful sunset at the beach during vacation',
  metadata: {
    width: 1920,
    height: 1080,
    format: 'JPEG'
  }
});
```

### 2. 在記憶中使用圖像

```javascript
// 短期記憶
await shortTermManager.addMemory(
  [
    { role: 'user', content: 'Check out this photo!' },
    { role: 'assistant', content: 'Beautiful picture!' }
  ],
  'user_123',
  {
    modalities: [imageModality]
  }
);

// 長期記憶
await longTermManager.addMemory({
  name: 'vacation_photo_2024',
  prompt: 'Vacation photo from summer 2024',
  trigger: 'match_keys(context.messages, ["vacation", "photo"], "any")',
  modalities: [fullImageModality]
});
```

## 功能詳解

### 圖像嵌入（Embeddings）

圖像嵌入是圖像的數值表示，用於計算圖像相似度。

```javascript
const imageWithEmbedding = createImageModality({
  uri: 'https://example.com/cat.jpg',
  embedding: clipEmbedding,  // 來自 CLIP 或其他模型的嵌入
  tags: ['cat', 'animal', 'pet']
});
```

**支持的嵌入來源**：
- CLIP (OpenAI)
- ResNet features
- Custom CNN embeddings
- 任何數值向量

### 圖像去重

系統自動檢測並移除重複的圖像：

```javascript
import { deduplicateImageModalities } from './src/utils/image-processor.js';

const modalities = [
  createImageModalityFromUrl('https://example.com/a.jpg'),
  createImageModalityFromUrl('https://example.com/b.jpg'),
  createImageModalityFromUrl('https://example.com/a.jpg'), // 重複！
];

// 自動在存儲時去重
// 3 個圖像 -> 2 個唯一圖像
```

**去重方法**：
1. **URL 比對** - 相同 URL 視為重複
2. **內容哈希** - 對於 base64 圖像，計算 SHA256 哈希

### Base64 圖像

支持 data URI 格式的圖像：

```javascript
const base64Image = createImageModality({
  uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...',
  tags: ['screenshot', 'diagram']
});

// 自動生成內容哈希用於去重
console.log(base64Image.metadata.contentHash);
// -> 'a1b2c3d4e5f6...'
```

### 圖像驗證

驗證圖像 modality 的完整性：

```javascript
import { validateImageModality } from './src/utils/image-processor.js';

const validation = validateImageModality(imageModality);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  // ['Embedding must be an array', ...]
}
```

## 相似度搜索

使用圖像嵌入進行語義搜索：

```javascript
// 搜索時提供查詢圖像
const searchResults = await shortTermManager.searchRelevantMemories(
  [{ role: 'user', content: 'Show me beach photos' }],
  'user_123',
  {
    queryModalities: [queryImageModality],
    modalityVectorWeight: 10  // 調整嵌入權重
  }
);
```

**相似度計算**：
- 使用餘弦相似度（Cosine Similarity）
- 0.0 = 完全不相似
- 1.0 = 完全相同
- 結果自動與關鍵詞匹配和時間衰減結合

## 最佳實踐

### 1. 選擇合適的嵌入模型

```javascript
// ✓ 好 - 使用語義嵌入
const semanticEmbedding = await getCLIPEmbedding(imageUrl);

// ✗ 避免 - 隨機數值
const randomEmbedding = Array(512).fill(0).map(() => Math.random());
```

### 2. 添加描述性標籤

```javascript
// ✓ 好 - 具體且相關
tags: ['golden-retriever', 'park', 'sunny-day']

// ✗ 避免 - 過於泛化
tags: ['image', 'photo', 'thing']
```

### 3. 使用適當的元數據

```javascript
// ✓ 好 - 有用的元數據
metadata: {
  capturedAt: '2024-07-17T10:30:00Z',
  location: 'Central Park',
  camera: 'iPhone 13',
  width: 4032,
  height: 3024
}
```

### 4. 處理大型圖像

```javascript
// 對於大型圖像，考慮使用 URL 而非 base64
// ✓ 好 - URL 引用
uri: 'https://cdn.example.com/large-image.jpg'

// ⚠️ 謹慎 - base64 會增加記憶大小
uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...' // 可能很大
```

## 示例：完整工作流

```javascript
import { createImageModality } from './src/utils/image-processor.js';
import { ShortTermMemoryManager } from './src/memory/short-term.js';
import { StorageManager } from './src/memory/storage.js';

// 1. 創建圖像 modality
const photoModality = createImageModality({
  uri: 'https://photos.example.com/vacation-2024/beach-sunset.jpg',
  embedding: await getImageEmbedding(imageUrl),
  tags: ['vacation', 'beach', 'sunset', '2024'],
  description: 'Beautiful sunset at Malibu Beach',
  metadata: {
    location: 'Malibu Beach, CA',
    date: '2024-07-17',
    photographer: 'John Doe'
  }
});

// 2. 添加到記憶
const manager = new ShortTermMemoryManager();
const storage = new StorageManager('user_123');

await manager.addMemory(
  [
    { role: 'user', content: 'Here is a photo from my vacation' },
    { role: 'assistant', content: 'What a beautiful sunset!' }
  ],
  'user_123',
  {
    modalities: [photoModality]
  }
);

// 3. 保存（自動優化和去重）
await storage.saveShortTermMemories(manager.getMemories());

// 4. 稍後搜索
const results = await manager.searchRelevantMemories(
  [{ role: 'user', content: 'Show me my vacation photos' }],
  'user_123',
  {
    queryModalities: [vacationQueryImage],
    modalityVectorWeight: 15
  }
);

console.log('Found memories:', results.topRelevant);
```

## 故障排除

### 問題：圖像未被識別為重複

**原因**：不同的 URL 或沒有內容哈希

**解決方案**：
```javascript
// 使用 base64 以啟用內容哈希去重
const base64Image = createImageModality({
  uri: 'data:image/jpeg;base64,...'
});
```

### 問題：相似度搜索不準確

**原因**：嵌入質量差或權重不當

**解決方案**：
```javascript
// 1. 使用高質量嵌入（CLIP, etc.）
// 2. 調整向量權重
searchOptions.modalityVectorWeight = 20; // 增加圖像重要性
```

### 問題：記憶文件太大

**原因**：存儲了大型 base64 圖像

**解決方案**：
```javascript
// 使用 URL 而非 base64
// 或使用外部圖像存儲服務
const imageModality = createImageModality({
  uri: 'https://cdn.example.com/optimized-image.jpg'
});
```

## API 參考

### createImageModality(options)

創建標準化的圖像 modality 對象。

**參數**：
- `uri` (string, required): 圖像 URI（URL 或 data URI）
- `embedding` (number[], optional): 圖像特徵向量
- `tags` (string[], optional): 圖像標籤
- `description` (string, optional): 圖像描述
- `metadata` (object, optional): 額外元數據

**返回**：標準化的 modality 對象

### deduplicateImageModalities(modalities)

從列表中移除重複的圖像。

**參數**：
- `modalities` (array): modalities 列表

**返回**：去重後的列表

### validateImageModality(modality)

驗證圖像 modality 的結構。

**參數**：
- `modality` (object): 要驗證的 modality

**返回**：`{valid: boolean, errors: string[]}`

## 下一步

- 查看 [DATA_OPTIMIZATION.md](./DATA_OPTIMIZATION.md) 了解數據優化
- 查看 [../README.md](../README.md) 了解完整功能
- 運行 `test-image-and-optimization.js` 查看更多示例
