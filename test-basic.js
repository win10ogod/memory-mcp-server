/**
 * Basic functionality test
 * Tests core memory operations without requiring MCP client
 */

import { ShortTermMemoryManager } from './src/memory/short-term.js';
import { LongTermMemoryManager } from './src/memory/long-term.js';
import { StorageManager } from './src/memory/storage.js';
import { extractKeywords } from './src/nlp/jieba.js';
import { matchKeys, createContextSnapshot } from './src/nlp/keywords.js';

console.log('🧪 Running basic functionality tests...\n');

// Test 1: NLP - Jieba keyword extraction
console.log('Test 1: Jieba Keyword Extraction');
try {
  const keywords = extractKeywords('我喜欢吃披萨和喝咖啡，这是我最喜欢的食物', 5);
  console.log('✓ Keywords extracted:', keywords.slice(0, 3).map(k => k.word).join(', '));
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 2: NLP - Keyword matching
console.log('\nTest 2: Keyword Matching');
try {
  const messages = [
    { role: 'user', content: '我的生日是7月17日' },
    { role: 'assistant', content: '好的，我记住了！' }
  ];
  const matches = matchKeys(messages, ['生日', 'birthday'], 'any');
  console.log('✓ Keyword matches found:', matches);
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 3: Short-term memory - Add and search
console.log('\nTest 3: Short-term Memory Operations');
try {
  const stManager = new ShortTermMemoryManager();
  
  // Add memory
  await stManager.addMemory(
    [
      { role: 'user', content: '我喜欢吃披萨', timestamp: Date.now() },
      { role: 'assistant', content: '好的！', timestamp: Date.now() }
    ],
    'test-conversation'
  );
  
  console.log('✓ Memory added, total:', stManager.getMemories().length);
  
  // Search memory
  const searchResults = await stManager.searchRelevantMemories(
    [{ role: 'user', content: '我喜欢什么食物' }],
    'test-conversation'
  );
  
  console.log('✓ Search complete, found relevant:', 
    searchResults.topRelevant.length + searchResults.nextRelevant.length);
  
  // Get stats
  const stats = stManager.getStats();
  console.log('✓ Stats retrieved, total memories:', stats.total);
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 4: Long-term memory - Add and trigger
console.log('\nTest 4: Long-term Memory Operations');
try {
  const ltManager = new LongTermMemoryManager();
  
  // Add memory
  const addResult = await ltManager.addMemory({
    name: 'birthday-memory',
    prompt: '用户的生日是7月17日',
    trigger: 'match_keys(context.messages, ["生日", "birthday"], "any")',
    createdContext: '测试上下文'
  });
  
  if (addResult.success) {
    console.log('✓ Long-term memory added');
  } else {
    throw new Error(addResult.error);
  }
  
  // Test trigger activation
  const context = {
    messages: [
      { role: 'user', content: '我的生日是什么时候？' }
    ],
    conversation_id: 'test',
    participants: {}
  };
  
  const searchResults = await ltManager.searchAndActivateMemories(context);
  console.log('✓ Trigger evaluation complete, activated:', searchResults.activated.length);
  
  // List memories
  const names = ltManager.listMemoryNames();
  console.log('✓ Memory list retrieved:', names.length, 'memories');
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 5: Storage operations
console.log('\nTest 5: Storage Operations');
try {
  const storage = new StorageManager('test-storage');
  
  // Test paths
  const stPath = storage.getShortTermPath();
  const ltPath = storage.getLongTermPath();
  
  console.log('✓ Storage paths generated');
  console.log('  Short-term:', stPath);
  console.log('  Long-term:', ltPath);
} catch (error) {
  console.error('✗ Failed:', error.message);
}

// Test 6: Context snapshot
console.log('\nTest 6: Context Snapshot');
try {
  const messages = [
    { role: 'user', content: '你好', name: 'User' },
    { role: 'assistant', content: '你好！', name: 'Assistant' }
  ];
  
  const snapshot = createContextSnapshot(messages);
  console.log('✓ Context snapshot created');
  console.log('  Preview:', snapshot.substring(0, 50) + '...');
} catch (error) {
  console.error('✗ Failed:', error.message);
}

console.log('\n✅ Basic functionality tests complete!\n');
console.log('Next steps:');
console.log('1. Run: npm install');
console.log('2. Configure MCP client (see example-config.json)');
console.log('3. Test with actual MCP client (see TESTING.md)');

