# Architecture Documentation

## System Overview

The Memory MCP Server is a sophisticated memory management system that provides:

1. **Short-term Memory**: Dynamic, relevance-scored memories with time decay
2. **Long-term Memory**: Trigger-based permanent memories with JS code execution
3. **NLP Support**: Chinese language processing via jieba segmentation
4. **Safe Execution**: Sandboxed JavaScript evaluation for triggers

## Component Architecture

```
┌─────────────────────────────────────────────────┐
│           MCP Client (Claude/Cursor)            │
│                                                 │
│  User Query ──> LLM ──> Tool Selection          │
└────────────────────┬────────────────────────────┘
                     │ MCP Protocol (stdio)
                     ↓
┌─────────────────────────────────────────────────┐
│           Memory MCP Server (Node.js)           │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │          MCP Server (index.js)            │ │
│  │  - Tool Registration                      │ │
│  │  - Request Routing                        │ │
│  │  - Manager Lifecycle                      │ │
│  └───────────┬───────────────────────────────┘ │
│              │                                  │
│    ┌─────────┴──────────┐                      │
│    ↓                    ↓                      │
│  ┌─────────────┐  ┌──────────────┐             │
│  │ Short-term  │  │  Long-term   │             │
│  │   Tools     │  │    Tools     │             │
│  └──────┬──────┘  └───────┬──────┘             │
│         │                 │                     │
│    ┌────┴─────────────────┴────┐               │
│    │   Memory Managers         │               │
│    │  - ShortTermMemoryManager │               │
│    │  - LongTermMemoryManager  │               │
│    └────┬─────────────────┬────┘               │
│         │                 │                     │
│    ┌────┴────┐       ┌────┴────┐               │
│    │   NLP   │       │Triggers │               │
│    │ - jieba │       │- vm     │               │
│    │ - match │       │  sandbox│               │
│    └─────────┘       └─────────┘               │
│         │                                       │
│    ┌────┴────────────┐                         │
│    │ Storage Manager │                         │
│    │ - JSON Files    │                         │
│    └─────────────────┘                         │
└─────────────────────────────────────────────────┘
                     │
                     ↓
              ┌──────────────┐
              │  File System │
              │  data/       │
              │  {conv_id}/  │
              └──────────────┘
```

## Data Flow

### Short-term Memory: Add Operation

```
User Message
    ↓
1. MCP Client calls add_short_term_memory
    ↓
2. Tool validates input (Zod schema)
    ↓
3. Manager extracts keywords (jieba TF-IDF)
    ↓
4. Manager creates memory entry
   - text: context snapshot
   - keywords: [{word, weight}]
   - score: 0
   - timestamp: now
   - conversation_id
    ↓
5. Memory added to in-memory array
    ↓
6. Storage saves to JSON file
    ↓
7. Return success to client
```

### Short-term Memory: Search Operation

```
User Query
    ↓
1. MCP Client calls search_short_term_memories
    ↓
2. Extract keywords from recent messages
    ↓
3. For each memory:
   a. Calculate keyword match score
   b. Apply time decay penalty
   c. Add memory's accumulated score
   → relevance = match - decay + score
    ↓
4. Filter by relevance threshold (>5)
    ↓
5. Sort by relevance (descending)
    ↓
6. Select memories:
   a. Top 2 most relevant
   b. Next 1 relevant
   c. 2 random (weighted by age & score)
   
   Time filters applied:
   - Skip same-conversation memories <20min
   - Skip any memories within 10min of selected
    ↓
7. Update scores for selected memories
   - Top: +5 points
   - Next: +2 points
    ↓
8. Save updated scores
    ↓
9. Return formatted results
```

### Long-term Memory: Trigger Evaluation

```
User Message
    ↓
1. MCP Client calls search_long_term_memories
    ↓
2. For each long-term memory:
   a. Create isolated VM instance
   b. Inject safe context:
      - context.messages
      - context.conversation_id
      - context.participants
      - match_keys function
      - match_keys_all function
      - Date, Math, RegExp, etc.
   c. Compile trigger code
   d. Execute with 1s timeout
   e. Dispose VM
   f. Return true/false
    ↓
3. Collect activated memories (trigger = true)
    ↓
4. Select 2 random memories (for serendipity)
    ↓
5. Format and return results
```

## Memory Lifecycle

### Short-term Memory

```
Creation
   ↓
Initial Score: 0
   ↓
[Time passes, score decays via penalty]
   ↓
Activated? 
   ├─ Yes: Score += (5 or 2)
   └─ No: Score unchanged
   ↓
Relevance = Score + Keyword Match - Time Penalty
   ↓
Relevance < Threshold?
   ├─ Yes: Candidate for cleanup
   └─ No: Retained
   ↓
Cleanup triggered?
   ├─ Age > 1 year? → Delete
   ├─ Relevance < -5? → Delete (unless top 512)
   └─ Keep
```

### Long-term Memory

```
Creation
   ├─ Validate trigger syntax
   ├─ Test in sandbox
   └─ Store with metadata
   ↓
Persist indefinitely
   ↓
On each search:
   └─ Evaluate trigger
      ├─ True: Activate
      └─ False: Skip
   ↓
Manual operations only:
   ├─ Update (change trigger/content)
   └─ Delete (explicit removal)
```

## Conversation Isolation

Each conversation gets its own memory space:

```
data/
├── conversation_1/
│   ├── short-term-memory.json
│   └── long-term-memory.json
├── conversation_2/
│   ├── short-term-memory.json
│   └── long-term-memory.json
└── default/
    ├── short-term-memory.json
    └── long-term-memory.json
```

Managers are cached per conversation:
- First access: Load from storage
- Subsequent: Use cached instance
- Modifications: Immediate save to storage

## NLP Pipeline

### Keyword Extraction (Chinese Text)

```
Input Text
   ↓
1. Jieba tokenization
   "我喜欢吃披萨" → ["我", "喜欢", "吃", "披萨"]
   ↓
2. TF-IDF calculation
   term_frequency × inverse_document_frequency
   ↓
3. Extract top N keywords
   [{word: "披萨", weight: 12.5}, ...]
   ↓
4. Weight adjustment
   weight *= 5 (match original scale)
   ↓
5. Apply role multipliers
   - user: 2.7x
   - assistant: 2.0x
   - system: 1.0x
   ↓
6. Filter by threshold (weight >= 0.8)
   ↓
7. Return top 72 keywords
```

### Keyword Matching

```
Search Pattern (string or regex)
   ↓
1. Normalize to regex
   - Chinese: /keyword/gi (no word boundary)
   - ASCII: /\bkeyword\b/gi (word boundary)
   ↓
2. Test against content
   ↓
3. Return match count or boolean
```

## Security Model

### Trigger Sandbox

```javascript
// Isolated VM Configuration
{
  memoryLimit: 32,        // 32MB max memory
  timeout: 1000,          // 1 second max execution
  
  // Allowed globals
  allowed: [
    'Date', 'Math', 'RegExp', 
    'JSON', 'Array', 'Object',
    'String', 'Number', 'Boolean'
  ],
  
  // Blocked capabilities
  blocked: [
    'require', 'import',    // No module loading
    'fs', 'net', 'child_process',  // No I/O
    'process', 'global',    // No process access
    '__dirname', '__filename'  // No path info
  ]
}
```

### Attack Mitigation

1. **Infinite Loops**: 1-second timeout
2. **Memory Exhaustion**: 32MB limit
3. **File Access**: No fs module
4. **Network**: No net/http modules
5. **Code Injection**: Sandboxed execution only

## Performance Characteristics

### Time Complexity

- **Add Short-term Memory**: O(n) for keyword extraction
- **Search Short-term**: O(m×k) where m=memories, k=keywords
- **Cleanup**: O(m log m) for sorting
- **Add Long-term**: O(1) + trigger validation
- **Search Long-term**: O(n×t) where n=memories, t=trigger time

### Space Complexity

- **Short-term Memory**: O(m×k) for memories and keywords
- **Long-term Memory**: O(n) for memories
- **Storage**: JSON files, ~1KB per memory entry

### Scalability Limits

- **Short-term**: Tested up to 10,000 memories
- **Long-term**: Tested up to 1,000 memories
- **Concurrent Conversations**: Limited by memory only
- **File I/O**: Async, non-blocking

## Extension Points

### Custom Storage Backend

Replace `StorageManager` to use:
- SQLite
- PostgreSQL
- Redis
- MongoDB

### Custom NLP

Replace `jieba.js` and `keywords.js` for:
- Different languages
- Alternative segmentation
- Custom keyword extraction

### Custom Triggers

Extend `matcher.js` to support:
- External API calls (with rate limits)
- Machine learning models
- Complex rule engines

## Error Handling

```
Error Categories:
├── Validation Errors (Zod)
│   └── Return: {isError: true, invalid args}
├── Storage Errors (I/O)
│   └── Log + Return: {error: message}
├── Trigger Errors (VM)
│   └── Catch + Return: false (fail safe)
└── Memory Errors (Logic)
    └── Log + Continue (graceful degradation)
```

## Monitoring

Key metrics to track:

1. **Memory Operations**
   - Add/search/delete rates
   - Average operation latency
   - Error rates

2. **Storage**
   - File sizes
   - Write frequency
   - Read/write failures

3. **Triggers**
   - Evaluation time
   - Timeout frequency
   - Error rates

4. **Resource Usage**
   - VM instance count
   - Memory consumption
   - CPU usage

