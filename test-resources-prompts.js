/**
 * Test Resources and Prompts functionality
 */

import { createResources } from './src/resources/index.js';
import { createPrompts } from './src/prompts/index.js';
import { ShortTermMemoryManager } from './src/memory/short-term.js';
import { LongTermMemoryManager } from './src/memory/long-term.js';
import { StorageManager } from './src/memory/storage.js';

console.log('🧪 Testing Resources and Prompts...\n');

// Mock manager getters
const managers = new Map();

async function getShortTermManager(convId) {
  if (!managers.has(`st-${convId}`)) {
    const m = new ShortTermMemoryManager();
    const storage = new StorageManager(convId);
    const memories = await storage.loadShortTermMemories();
    m.loadMemories(memories);
    managers.set(`st-${convId}`, m);
  }
  return managers.get(`st-${convId}`);
}

async function getLongTermManager(convId) {
  if (!managers.has(`lt-${convId}`)) {
    const m = new LongTermMemoryManager();
    const storage = new StorageManager(convId);
    const memories = await storage.loadLongTermMemories();
    m.loadMemories(memories);
    managers.set(`lt-${convId}`, m);
  }
  return managers.get(`lt-${convId}`);
}

function getStorageManager(convId) {
  if (!managers.has(`s-${convId}`)) {
    managers.set(`s-${convId}`, new StorageManager(convId));
  }
  return managers.get(`s-${convId}`);
}

// Test Resources
console.log('Test 1: Resources - List');
try {
  const { resources, readResource } = createResources(
    getShortTermManager,
    getLongTermManager,
    getStorageManager
  );

  console.log(`✓ Found ${resources.length} resources:`);
  resources.forEach(r => {
    console.log(`  - ${r.name} (${r.uri})`);
  });

  // Test reading overview
  console.log('\nTest 2: Resources - Read Overview');
  const overview = await readResource('memory://stats/overview');
  const overviewData = JSON.parse(overview.contents[0].text);
  console.log('✓ Overview retrieved:');
  console.log(`  Conversations: ${overviewData.system.conversations_count}`);
  console.log(`  Status: ${overviewData.status}`);

  // Test reading best practices guide
  console.log('\nTest 3: Resources - Read Best Practices Guide');
  const guide = await readResource('memory://guide/best-practices');
  const guideText = guide.contents[0].text;
  console.log('✓ Best practices guide retrieved');
  console.log(`  Length: ${guideText.length} characters`);
  console.log(`  Preview: ${guideText.substring(0, 100)}...`);
} catch (error) {
  console.error('✗ Resources test failed:', error.message);
}

// Test Prompts
console.log('\nTest 4: Prompts - List');
try {
  const { prompts, getPrompt } = createPrompts();

  console.log(`✓ Found ${prompts.length} prompts:`);
  prompts.forEach(p => {
    console.log(`  - ${p.name}: ${p.description}`);
  });

  // Test getting a prompt
  console.log('\nTest 5: Prompts - Get "remember-user-info"');
  const prompt = await getPrompt('remember-user-info', {
    info_type: 'birthday',
    information: 'July 17, 1990',
    conversation_id: 'user_123'
  });

  console.log('✓ Prompt generated successfully');
  console.log(`  Messages: ${prompt.messages.length}`);
  console.log(`  First message role: ${prompt.messages[0].role}`);
  console.log(`  Preview: ${prompt.messages[1].content.text.substring(0, 100)}...`);

  // Test another prompt
  console.log('\nTest 6: Prompts - Get "recall-context"');
  const recallPrompt = await getPrompt('recall-context', {
    current_topic: 'favorite food',
    conversation_id: 'user_123'
  });

  console.log('✓ Recall prompt generated successfully');
  console.log(`  Messages: ${recallPrompt.messages.length}`);

  // Test create-reminder prompt
  console.log('\nTest 7: Prompts - Get "create-reminder"');
  const reminderPrompt = await getPrompt('create-reminder', {
    reminder_content: 'Annual team meeting',
    trigger_condition: 'first Monday of January',
    conversation_id: 'team_chat'
  });

  console.log('✓ Reminder prompt generated successfully');
  console.log(`  Messages: ${reminderPrompt.messages.length}`);

  // Test analyze-conversation prompt
  console.log('\nTest 8: Prompts - Get "analyze-conversation"');
  const analyzePrompt = await getPrompt('analyze-conversation', {
    conversation_id: 'user_123'
  });

  console.log('✓ Analyze prompt generated successfully');
  console.log(`  Messages: ${analyzePrompt.messages.length}`);

} catch (error) {
  console.error('✗ Prompts test failed:', error.message);
}

console.log('\n✅ Resources and Prompts tests complete!\n');
console.log('Available Resources:');
console.log('- memory://stats/overview - System overview and health');
console.log('- memory://conversations/list - List all conversations');
console.log('- memory://stats/conversation/{id} - Conversation details');
console.log('- memory://guide/best-practices - Usage guide');
console.log('\nAvailable Prompts:');
console.log('- remember-user-info - Store user information');
console.log('- recall-context - Search for relevant memories');
console.log('- create-reminder - Create conditional reminders');
console.log('- analyze-conversation - Analyze and suggest memories');
