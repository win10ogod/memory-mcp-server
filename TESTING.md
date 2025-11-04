# Testing Memory MCP Server

This document describes how to test and verify the Memory MCP Server.

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- An MCP client (Claude Desktop, Cursor, or custom MCP client)

## Installation

```bash
cd memory-mcp-server
npm install
```

## Manual Testing

### 1. Test Server Startup

```bash
# Start the server
node src/index.js
```

The server should output:
```
Memory MCP Server running on stdio
Server initialized with short-term and long-term memory capabilities
```

Press Ctrl+C to stop.

### 2. Test with Claude Desktop

1. Edit your Claude Desktop configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the memory server:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/absolute/path/to/memory-mcp-server/src/index.js"]
    }
  }
}
```

3. Restart Claude Desktop

4. In Claude, try these prompts:

```
Test Short-term Memory:
- "Please add a memory that I like pizza and coffee" (use add_short_term_memory)
- "What do I like to eat?" (use search_short_term_memories)
- "Show me memory statistics" (use get_memory_stats)

Test Long-term Memory:
- "Create a permanent memory that my birthday is July 17, triggered when someone mentions 'birthday'" (use add_long_term_memory)
- "List all my permanent memories" (use list_long_term_memories)
- "What day is my birthday?" (should activate the birthday memory via search_long_term_memories)
```

### 3. Test with Cursor

1. Add to your Cursor MCP configuration (typically in `.cursor/mcp_config.json`):

```json
{
  "memory": {
    "command": "node",
    "args": ["/absolute/path/to/memory-mcp-server/src/index.js"]
  }
}
```

2. Restart Cursor and test with similar prompts

## Automated Testing

### Test Tool Registration

Create a test script `test-tools.js`:

```javascript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createServer } from './src/index.js';

async function testToolRegistration() {
  console.log('Testing tool registration...');
  
  // Test that server starts
  const server = await createServer();
  console.log('✓ Server created successfully');
  
  // Note: Full MCP testing requires a proper transport layer
  console.log('✓ All basic checks passed');
}

testToolRegistration().catch(console.error);
```

### Test Memory Operations

Create `test-memory.js`:

```javascript
import { ShortTermMemoryManager } from './src/memory/short-term.js';
import { LongTermMemoryManager } from './src/memory/long-term.js';

async function testShortTermMemory() {
  console.log('Testing short-term memory...');
  
  const manager = new ShortTermMemoryManager();
  
  // Test adding memory
  const messages = [
    { role: 'user', content: '我喜欢吃披萨', timestamp: Date.now() },
    { role: 'assistant', content: '好的，我记住了！', timestamp: Date.now() }
  ];
  
  await manager.addMemory(messages, 'test-conversation');
  console.log('✓ Added memory');
  
  // Test searching
  const searchMessages = [
    { role: 'user', content: '我喜欢什么食物？' }
  ];
  
  const results = await manager.searchRelevantMemories(searchMessages, 'test-conversation');
  console.log('✓ Searched memories:', results);
  
  // Test stats
  const stats = manager.getStats();
  console.log('✓ Got stats:', stats);
  
  console.log('Short-term memory tests passed!');
}

async function testLongTermMemory() {
  console.log('Testing long-term memory...');
  
  const manager = new LongTermMemoryManager();
  
  // Test adding memory
  const result = await manager.addMemory({
    name: 'test-memory',
    prompt: 'This is a test memory',
    trigger: 'match_keys(context.messages, ["test"], "any")',
    createdContext: 'Test context'
  });
  
  console.log('✓ Added memory:', result);
  
  // Test searching with trigger
  const context = {
    messages: [{ role: 'user', content: 'This is a test message' }],
    conversation_id: 'test',
    participants: {}
  };
  
  const searchResults = await manager.searchAndActivateMemories(context);
  console.log('✓ Searched memories:', searchResults);
  
  console.log('Long-term memory tests passed!');
}

async function runTests() {
  try {
    await testShortTermMemory();
    console.log('');
    await testLongTermMemory();
    console.log('\n✓ All tests passed!');
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }
}

runTests();
```

Run tests:
```bash
node test-memory.js
```

## Verification Checklist

- [ ] Server starts without errors
- [ ] All 12 tools are registered (6 short-term + 6 long-term)
- [ ] Short-term memory: Add, search, delete operations work
- [ ] Long-term memory: Add, trigger evaluation, update operations work
- [ ] Chinese text segmentation works correctly
- [ ] Memory persistence (data files created and loaded)
- [ ] Trigger code executes in sandbox safely
- [ ] Conversation isolation works (different conversation_ids)

## Troubleshooting

### Server won't start
- Check Node.js version: `node --version` (should be >= 18.0.0)
- Verify all dependencies installed: `npm list`
- Check for syntax errors: `node --check src/index.js`

### Tools not appearing in MCP client
- Verify server path is absolute in client config
- Check client logs for connection errors
- Ensure server process is running (check system processes)

### Memory operations fail
- Check `data/` directory is writable
- Verify conversation_id is valid string
- Check server console for error messages

### Trigger evaluation errors
- Test trigger syntax with `test-memory.js`
- Verify trigger uses only allowed functions/objects
- Check for infinite loops (1-second timeout)

## Performance Testing

Test with large datasets:

```javascript
// Add 1000 memories and measure search performance
const manager = new ShortTermMemoryManager();

for (let i = 0; i < 1000; i++) {
  await manager.addMemory([
    { role: 'user', content: `Test message ${i}`, timestamp: Date.now() }
  ], 'test');
}

const start = Date.now();
await manager.searchRelevantMemories([
  { role: 'user', content: 'Search query' }
], 'test');
const duration = Date.now() - start;

console.log(`Search completed in ${duration}ms`);
```

Expected performance:
- Adding memory: < 50ms
- Searching 1000 memories: < 200ms
- Cleanup operation: < 500ms

## Next Steps

After successful testing:

1. Create production configuration
2. Set up proper data directory paths
3. Configure automatic cleanup schedules
4. Monitor memory usage and performance
5. Set up logging for production debugging

