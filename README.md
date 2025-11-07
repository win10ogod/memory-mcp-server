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

### Long-term Memory

- 🎯 **Trigger Conditions**: JavaScript code execution for flexible memory activation
- 🔒 **Sandboxed Execution**: Using isolated-vm for secure JS code evaluation
- 🎰 **Random Recall**: Serendipitous memory activation for context enrichment
- 📝 **Context Tracking**: Records creation and update contexts

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

## Architecture

```
memory-mcp-server/
├── src/
│   ├── index.js                 # MCP server entry point
│   ├── memory/
│   │   ├── short-term.js        # Short-term memory logic
│   │   ├── long-term.js         # Long-term memory logic
│   │   └── storage.js           # JSON file storage
│   ├── nlp/
│   │   ├── jieba.js             # Chinese segmentation
│   │   └── keywords.js          # Keyword matching
│   ├── triggers/
│   │   └── matcher.js           # JS code execution sandbox
│   └── tools/
│       ├── short-term-tools.js  # Short-term MCP tools
│       └── long-term-tools.js   # Long-term MCP tools
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

- **Sandboxed Execution**: Long-term memory triggers run in vm2 sandbox with timeout protection
- **No File System Access**: Trigger code cannot access filesystem (sandboxed)
- **No Network Access**: Trigger code cannot make network requests
- **Timeout Protection**: 1-second execution timeout prevents infinite loops

> **Note**: vm2 provides good security for most use cases. For maximum security in production environments, consider running the MCP server in a containerized environment with additional restrictions.

## Limitations

- Memory storage is file-based (JSON), suitable for moderate usage
- Trigger execution has 1-second timeout
- Each isolated VM has 32MB memory limit
- Chinese text processing optimized (may be less optimal for other languages)

## License

BSD-3-Clause license

## Credits

Extracted and generalized from the [GentianAphrodite](https://github.com/steve02081504/GentianAphrodite) project.
