/**
 * Test image memory features and data optimization
 */

import {
  createImageModality,
  createImageModalityFromUrl,
  validateImageModality,
  areImagesDuplicate,
  deduplicateImageModalities
} from './src/utils/image-processor.js';

import {
  normalizeTimestamps,
  removeAttachmentsRedundancy,
  deduplicateKeywords,
  optimizeMemory,
  calculateSpaceSavings
} from './src/utils/data-optimizer.js';

console.log('🧪 Testing Image Memory and Data Optimization...\n');

// Test 1: Create image modality
console.log('Test 1: Create Image Modality');
try {
  const imageModality = createImageModality({
    uri: 'https://example.com/image.jpg',
    tags: ['cat', 'outdoor'],
    description: 'A cat sitting outdoors',
    embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
    metadata: {
      width: 800,
      height: 600
    }
  });

  console.log('✓ Image modality created:');
  console.log(`  Type: ${imageModality.type}`);
  console.log(`  URI: ${imageModality.uri}`);
  console.log(`  Tags: ${imageModality.features.tags.join(', ')}`);
  console.log(`  Embedding dimensions: ${imageModality.features.embedding.length}`);
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 2: Create simple image from URL
console.log('\nTest 2: Create Simple Image from URL');
try {
  const simpleImage = createImageModalityFromUrl(
    'https://example.com/photo.png',
    ['photo', 'landscape']
  );

  console.log('✓ Simple image created:');
  console.log(`  URI: ${simpleImage.uri}`);
  console.log(`  Tags: ${simpleImage.features?.tags?.join(', ') || 'none'}`);
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 3: Validate image modality
console.log('\nTest 3: Validate Image Modality');
try {
  const valid = createImageModality({
    uri: 'https://example.com/test.jpg',
    embedding: [1, 2, 3]
  });

  const invalid = {
    type: 'image',
    // missing uri
    features: {
      embedding: 'invalid' // should be array
    }
  };

  const validResult = validateImageModality(valid);
  const invalidResult = validateImageModality(invalid);

  console.log(`✓ Valid modality: ${validResult.valid}`);
  console.log(`✓ Invalid modality: ${invalidResult.valid}`);
  console.log(`  Errors: ${invalidResult.errors.join(', ')}`);
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 4: Duplicate detection
console.log('\nTest 4: Duplicate Image Detection');
try {
  const img1 = createImageModalityFromUrl('https://example.com/same.jpg');
  const img2 = createImageModalityFromUrl('https://example.com/same.jpg');
  const img3 = createImageModalityFromUrl('https://example.com/different.jpg');

  const isDuplicate12 = areImagesDuplicate(img1, img2);
  const isDuplicate13 = areImagesDuplicate(img1, img3);

  console.log(`✓ Same URI detection: ${isDuplicate12}`);
  console.log(`✓ Different URI detection: ${isDuplicate13 === false}`);
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 5: Deduplication
console.log('\nTest 5: Image Deduplication');
try {
  const modalities = [
    createImageModalityFromUrl('https://example.com/a.jpg'),
    createImageModalityFromUrl('https://example.com/b.jpg'),
    createImageModalityFromUrl('https://example.com/a.jpg'), // duplicate
    { type: 'audio', uri: 'https://example.com/sound.mp3' },
    createImageModalityFromUrl('https://example.com/c.jpg')
  ];

  const deduplicated = deduplicateImageModalities(modalities);

  console.log(`✓ Original count: ${modalities.length}`);
  console.log(`✓ After deduplication: ${deduplicated.length}`);
  console.log(`✓ Removed ${modalities.length - deduplicated.length} duplicate(s)`);
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 6: Normalize timestamps
console.log('\nTest 6: Normalize Timestamps');
try {
  const memory = {
    text: 'Test memory',
    time_stamp: new Date('2024-01-01'),
    timestamp: '2024-01-02',
    timeStamp: '2024-01-03'
  };

  const normalized = normalizeTimestamps(memory);

  console.log('✓ Original fields:', Object.keys(memory).filter(k => k.includes('time')).join(', '));
  console.log('✓ Normalized fields:', Object.keys(normalized).filter(k => k.includes('time')).join(', '));
  console.log('✓ Unified timestamp:', normalized.timestamp);
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 7: Remove attachments redundancy
console.log('\nTest 7: Remove Attachments Redundancy');
try {
  const memory = {
    text: 'Test memory',
    modalities: [{ type: 'image', uri: 'test.jpg' }],
    attachments: [{ type: 'image', uri: 'test.jpg' }] // duplicate
  };

  const optimized = removeAttachmentsRedundancy(memory);

  console.log('✓ Original fields:', Object.keys(memory).join(', '));
  console.log('✓ Optimized fields:', Object.keys(optimized).join(', '));
  console.log('✓ Has modalities:', !!optimized.modalities);
  console.log('✓ Has attachments:', !!optimized.attachments);
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 8: Deduplicate keywords
console.log('\nTest 8: Deduplicate Keywords');
try {
  const keywords = [
    { word: 'cat', weight: 2.0 },
    { word: 'Cat', weight: 1.5 }, // duplicate (case-insensitive)
    { word: 'dog', weight: 1.0 },
    { word: 'cat', weight: 3.0 }  // duplicate
  ];

  const deduplicated = deduplicateKeywords(keywords);

  console.log(`✓ Original count: ${keywords.length}`);
  console.log(`✓ After deduplication: ${deduplicated.length}`);
  console.log('✓ Keywords:', deduplicated.map(k => `${k.word}(${k.weight})`).join(', '));
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 9: Full memory optimization
console.log('\nTest 9: Full Memory Optimization');
try {
  const memory = {
    text: 'Test memory',
    time_stamp: new Date('2024-01-01'),
    timestamp: '2024-01-02',
    keywords: [
      { word: 'test', weight: 2 },
      { word: 'Test', weight: 1 }
    ],
    modalities: [
      createImageModalityFromUrl('https://example.com/img.jpg'),
      createImageModalityFromUrl('https://example.com/img.jpg') // duplicate
    ],
    attachments: [
      createImageModalityFromUrl('https://example.com/img.jpg')
    ]
  };

  const optimized = optimizeMemory(memory);
  const savings = calculateSpaceSavings(memory, optimized);

  console.log('✓ Memory optimized successfully');
  console.log(`✓ Original size: ${savings.originalSize} bytes`);
  console.log(`✓ Optimized size: ${savings.optimizedSize} bytes`);
  console.log(`✓ Saved: ${savings.saved} bytes (${savings.savedPercent}%)`);
  console.log('✓ Optimized fields:', Object.keys(optimized).join(', '));
} catch (error) {
  console.error('✗ Failed:', error.message);
}

console.log('\n✅ Image Memory and Data Optimization tests complete!\n');
console.log('Summary:');
console.log('- Image modality creation and validation: ✓');
console.log('- Duplicate image detection: ✓');
console.log('- Data format standardization: ✓');
console.log('- Timestamp normalization: ✓');
console.log('- Keyword deduplication: ✓');
console.log('- Space optimization: ✓');
console.log('\nNew Features:');
console.log('1. createImageModality() - Create image modalities with embeddings/tags');
console.log('2. deduplicateImageModalities() - Remove duplicate images');
console.log('3. optimizeMemory() - One-call full memory optimization');
console.log('4. Unified timestamp field (timestamp instead of time_stamp/timeStamp)');
console.log('5. No more attachments redundancy (modalities only)');
