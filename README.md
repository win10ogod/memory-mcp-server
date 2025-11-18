# Memory MCP Server

A Model Context Protocol (MCP) server providing dynamic short-term and long-term memory management with Chinese language support.

<a href="https://glama.ai/mcp/servers/@win10ogod/memory-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@win10ogod/memory-mcp-server/badge" alt="Memory Server MCP server" />
</a>

## Overview

This MCP server implements a sophisticated memory system extracted from the GentianAphrodite project, offering:

- **Short-term Memory**: Keyword-based, time-decayed dynamic memory with relevance scoring
- **Long-term Memory**: Trigger-based permanent memories with JS code execution for flexible activation
- **Chinese Language Support**: Built-in jieba segmentation for optimal Chinese text processing
- **Multiple Conversations**: Isolated memory spaces per conversation ID

## Features

### Short-term Memory

- 🔍 **Keyword Extraction**: Uses TF-IDF with jieba for Chinese text
- ⏰ **Time Decay**: Exponential time decay model for memory relevance
- 📊 **Relevance Scoring**: Dynamic scoring based on keyword matching, time, and activation history
- 🎲 **Smart Selection**: Three-tier selection (top relevant, next relevant, random flashback)
- 🧹 **Auto Cleanup**: Automatic removal of old or irrelevant memories (configurable)
- 🖼️ **Image Memory**: Optional image embeddings for visual similarity search

### Long-term Memory

- 🎯 **Trigger Conditions**: JavaScript code execution for flexible memory activation
- 🔒 **Sandboxed Execution**: Using Node.js built-in vm module for secure JS code evaluation
- 🎰 **Random Recall**: Serendipitous memory activation for context enrichment
- 📝 **Context Tracking**: Records creation and update contexts
- 🖼️ **Multimodal Support**: Images, audio, and custom embeddings

### Data Optimization

- 📉 **Space Saving**: 30-40% reduction in storage size
- 🔄 **Auto Deduplication**: Removes duplicate keywords and images
- ⏱️ **Timestamp Normalization**: Unified timestamp format (ISO 8601)
- 🗜️ **Smart Compression**: Eliminates redundant `attachments` field

## Installation

```bash
# Clone or download this directory
cd memory-mcp-server

# Install dependencies
npm install

# Make the server executable (Unix/Linux/Mac)
chmod +x src/index.js
```

## Usage

### With Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

### With Cursor or other MCP clients

Configure according to your client's MCP server setup instructions, pointing to `src/index.js`.

## MCP Features

This server implements the full Model Context Protocol specification with:
- **Tools**: 13 tools for memory management
- **Resources**: 4 resources for system inspection
- **Prompts**: 4 prompt templates for common memory tasks

## Available Tools

### Short-term Memory Tools

#### `add_short_term_memory`
Add a new short-term memory from conversation messages.

**Parameters:**
- `messages` (array): Recent conversation messages with role and content
- `conversation_id` (string): Unique conversation identifier
- `roleWeights` (object, optional): Custom weights for different roles

**Example:**
```json
{
  "messages": [
    {"role": "user", "content": "My birthday is July 17, 1990"},
    {"role": "assistant", "content": "I'll remember that!"}
  ],
  "conversation_id": "user_123",
  "roleWeights": {
    "user": 2.7,
    "assistant": 2.0,
    "system": 1.0
  }
}
```

#### `search_short_term_memories`
Search for relevant memories based on current context.

**Parameters:**
- `recentMessages` (array): Recent messages to search against
- `conversation_id` (string): Current conversation ID
- `roleWeights` (object, optional): Role weights

**Returns:** Top relevant, next relevant, and random flashback memories

#### `delete_short_term_memories`
Delete memories matching a pattern.

**Parameters:**
- `pattern` (string): Keyword or regex pattern (e.g., "/pattern/i")
- `conversation_id` (string): Conversation ID

#### `get_memory_stats`
Get statistics about short-term memories.

#### `cleanup_memories`
Manually trigger memory cleanup (removes old/low-relevance memories).

#### `get_frequent_conversation`
Get the most frequently mentioned conversation ID.

### Long-term Memory Tools

#### `add_long_term_memory`
Add a permanent memory with a trigger condition.

**Parameters:**
- `name` (string): Unique memory name
- `prompt` (string): Memory content
- `trigger` (string): JavaScript code for activation condition
- `conversation_id` (string, optional): Conversation ID to store the memory under (defaults to "default")
- `createdContext` (string, optional): Context description
- `recentMessages` (array, optional): Auto-generate context from messages

**Trigger Examples:**
```javascript
// Activate when "birthday" is mentioned
"match_keys(context.messages, ['birthday', '生日'], 'any')"

// Activate on specific date or when mentioned
"match_keys(context.messages, ['anniversary'], 'any') || (new Date().getMonth() === 6 && new Date().getDate() === 17)"

// Multiple keywords required
"match_keys_all(context.messages, ['project', 'deadline'], 'user')"
```

**Available in trigger context:**
- `context.messages`: Recent message array
- `context.conversation_id`: Current conversation ID
- `context.participants`: Participant information
- `match_keys(messages, keywords, scope, depth)`: Match any keyword
- `match_keys_all(messages, keywords, scope, depth)`: Match all keywords
- `Date`, `Math`, `RegExp`, `JSON`: Safe built-in objects

#### `update_long_term_memory`
Update an existing long-term memory.

**Parameters:**
- `name` (string): Memory name to update
- `trigger` (string, optional): New trigger condition
- `prompt` (string, optional): New content
- `conversation_id` (string, optional): Conversation ID that owns the memory
- `updatedContext` (string, optional): Update context

#### `delete_long_term_memory`
Delete a long-term memory by name.

**Parameters:**
- `name` (string): Memory name to delete
- `conversation_id` (string, optional): Conversation ID that owns the memory

#### `list_long_term_memories`
List all long-term memories with basic info.

**Parameters:**
- `conversation_id` (string, optional): Conversation ID to inspect (defaults to "default")

#### `search_long_term_memories`
Search and activate memories based on current context.

**Parameters:**
- `messages` (array): Recent conversation messages
- `conversation_id` (string): Current conversation ID
- `participants` (object, optional): Participant info

**Returns:** Activated memories (triggered) and random memories

#### `get_memory_context`
Get creation and update context of a specific memory.

**Parameters:**
- `name` (string): Memory name to inspect
- `conversation_id` (string, optional): Conversation ID that owns the memory

## Available Resources

MCP resources allow AI to inspect the memory system state:

### `memory://stats/overview`
System-wide overview and health status.

**Returns:**
- Total conversation count
- System health status
- Available features

### `memory://conversations/list`
List all conversations with memory statistics.

**Returns:**
- Conversation IDs
- Short-term memory counts
- Long-term memory counts

### `memory://stats/conversation/{id}`
Detailed statistics for a specific conversation.

**Parameters:**
- `{id}`: Conversation ID to inspect

**Returns:**
- Short-term memory: total, scores, age ranges
- Long-term memory: total, update counts, timestamps

### `memory://guide/best-practices`
Comprehensive guide on using the memory system effectively.

**Returns:**
- Best practices for short-term and long-term memory
- Trigger condition examples
- Multimodal support guidelines
- Common usage patterns

## Available Prompts

MCP prompts provide guided workflows for common tasks:

### `remember-user-info`
Store important user information in long-term memory.

**Arguments:**
- `info_type` (required): Type of information (preference, birthday, fact, etc.)
- `information` (required): The information to remember
- `conversation_id` (optional): Target conversation ID

**Guides AI to:**
1. Create appropriate memory name
2. Generate relevant trigger conditions
3. Use add_long_term_memory tool

### `recall-context`
Search for relevant memories based on current conversation.

**Arguments:**
- `current_topic` (required): Current topic or question
- `conversation_id` (optional): Conversation to search

**Guides AI to:**
1. Search short-term memories for recent context
2. Search long-term memories for permanent facts
3. Consider keyword relevance and time decay

### `create-reminder`
Create a conditional reminder that activates based on context or date.

**Arguments:**
- `reminder_content` (required): What to remind about
- `trigger_condition` (required): When to trigger (keywords or date)
- `conversation_id` (optional): Target conversation

**Guides AI to:**
1. Convert natural language conditions to JavaScript
2. Create date-based or keyword-based triggers
3. Use add_long_term_memory with proper trigger

### `analyze-conversation`
Analyze conversation history and suggest what should be remembered.

**Arguments:**
- `conversation_id` (required): Conversation to analyze

**Guides AI to:**
1. Get current memory statistics
2. Identify important information types
3. Categorize for short-term vs long-term storage
4. Create appropriate memory entries

## Architecture

```
memory-mcp-server/
├── src/
│   ├── index.js                 # MCP server entry point
│   ├── memory/
│   │   ├── short-term.js        # Short-term memory logic
│   │   ├── long-term.js         # Long-term memory logic
│   │   ├── storage.js           # JSON file storage with caching
│   │   └── modalities.js        # Multimodal attachment handling
│   ├── nlp/
│   │   ├── jieba.js             # Chinese segmentation
│   │   └── keywords.js          # Keyword matching
│   ├── triggers/
│   │   └── matcher.js           # JS code execution sandbox (Node.js vm)
│   ├── tools/
│   │   ├── short-term-tools.js  # Short-term MCP tools
│   │   └── long-term-tools.js   # Long-term MCP tools
│   ├── resources/
│   │   └── index.js             # MCP resources (stats, guides)
│   ├── prompts/
│   │   └── index.js             # MCP prompts (workflows)
│   └── utils/
│       ├── lru-cache.js         # LRU cache for managers
│       └── zod-to-json-schema.js
└── data/                        # Memory storage (auto-created)
    └── {conversation_id}/
        ├── short-term-memory.json
        └── long-term-memory.json
```

## Memory Algorithms

### Short-term Memory Relevance

```
relevance = keyword_match_score - time_penalty + memory_score

where:
  keyword_match_score = Σ(current_kw.weight + memory_kw.weight)
  time_penalty = 15 * (1 - e^(-time_diff * 2e-9))
  memory_score = accumulated score from past activations
```

### Selection Strategy

1. **Top Relevant** (max 2): Highest relevance scores
2. **Next Relevant** (max 1): Next highest scores
3. **Random Flashback** (max 2): Weighted random from remaining memories

**Filtering:**
- Excludes same-conversation memories from last 20 minutes
- Excludes memories within 10 minutes of any selected memory
- Ensures diversity in recalled memories

### Cleanup Policy

- Triggers every 24 hours
- Removes memories older than 1 year
- Removes low-relevance memories (score < -5)
- Always keeps at least 512 memories

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Run normally
npm start
```

## Security

- **Sandboxed Execution**: Long-term memory triggers run in Node.js built-in `vm` module sandbox with timeout protection
- **No File System Access**: Trigger code cannot access filesystem (sandboxed)
- **No Network Access**: Trigger code cannot make network requests
- **Timeout Protection**: 1-second execution timeout prevents infinite loops
- **Secure Context**: Only safe built-in objects are exposed to trigger code

> **Note**: The built-in `vm` module provides good isolation for most use cases. For maximum security in production environments, consider running the MCP server in a containerized environment with additional restrictions.

## Limitations

- Memory storage is file-based (JSON), suitable for moderate usage
- Trigger execution has 1-second timeout
- Manager instances cached with LRU (max 100 conversations, 30-min idle timeout)
- Chinese text processing optimized (may be less optimal for other languages)

## Performance Optimizations

- **Write Caching**: Delayed writes with 1-second batching to reduce disk I/O
- **Directory Caching**: Directory existence checks are cached to avoid repeated file system calls
- **LRU Manager Cache**: Automatic cleanup of inactive conversation managers prevents memory leaks
- **Retry Logic**: File operations automatically retry with exponential backoff on transient errors
- **Graceful Shutdown**: Pending writes are flushed and resources cleaned up on shutdown signals
- **Data Deduplication**: Automatic removal of duplicate images and keywords (30-40% space savings)
- **Timestamp Normalization**: Unified timestamp format eliminates redundancy

## Image Memory Features

The server includes optional image memory capabilities:

- **Image Modalities**: Store images with memories using embeddings, tags, and descriptions
- **Similarity Search**: Find visually similar memories using cosine similarity on embeddings
- **Auto Deduplication**: Automatically detect and remove duplicate images (URL or content hash)
- **Flexible Embeddings**: Support for CLIP, ResNet, or custom image embeddings
- **Base64 Support**: Handle both URLs and data URI images

**Example:**
```javascript
import { createImageModality } from './src/utils/image-processor.js';

const imageMemory = createImageModality({
  uri: 'https://example.com/photo.jpg',
  embedding: [0.1, 0.2, 0.3, ...],  // 512-d vector from CLIP/etc
  tags: ['vacation', 'beach'],
  description: 'Sunset at the beach'
});

// Use in memory creation
await addShortTermMemory(messages, conversationId, {
  modalities: [imageMemory]
});
```

See [docs/IMAGE_MEMORY.md](docs/IMAGE_MEMORY.md) for detailed guide.

## Data Optimization

Built-in data optimization reduces storage by 30-40%:

- **Timestamp Normalization**: `time_stamp`/`timeStamp`/`timestamp` → `timestamp` (ISO 8601)
- **Remove Redundancy**: `attachments` field removed (use `modalities` only)
- **Keyword Deduplication**: Case-insensitive merge with max weight retention
- **Image Deduplication**: Remove duplicate images based on URI or content hash

All optimizations are applied automatically during storage. See [docs/DATA_OPTIMIZATION.md](docs/DATA_OPTIMIZATION.md) for details.

## License

BSD-3-Clause license

## Credits

Extracted and generalized from the [GentianAphrodite](https://github.com/steve02081504/GentianAphrodite) project.
