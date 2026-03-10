# Memory Engine

How Memord stores, indexes, and retrieves memories.

## Storage

Each memory is a row in SQLite with these fields:

| Field | Type | Description |
|-------|------|-------------|
| id | TEXT | UUID |
| type | TEXT | preference \| project_fact \| constraint \| goal \| episodic \| skill |
| topic | TEXT | Primary topic (tech_stack, preferences, project, etc.) |
| content | TEXT | The memory text |
| importance | REAL | 0.0 – 1.0 |
| source | TEXT | Which tool wrote it |
| app | TEXT | Application name |
| user_id | TEXT | User identifier (default: "default") |
| event_time | INTEGER | When it happened (ms unix) |
| ingestion_time | INTEGER | When it was stored |
| tags | TEXT | JSON array of semantic keywords |
| embedding | BLOB | 384-dim Float32Array |

## Embedding Model

Memord uses `Xenova/e5-small-v2`:
- 384 dimensions
- ~33MB quantized ONNX
- Runs fully locally, no GPU needed
- Uses E5 instruction format for best accuracy:
  - Stored text: `"passage: <content>"`
  - Search query: `"query: <query>"`

## Auto-Tagging

When a memory is stored, Memord automatically:
1. Infers up to 3 topics from the content using regex patterns
2. Extracts semantic keywords (tech names + significant nouns)
3. Stores these as `tags[]`

This means FTS5 can match memories by concept even when exact words differ.

Example:
```
content: "Always use Zod for runtime validation"
auto-tags: ["zod", "validation", "runtime", "preferences"]
topic: "tech_stack"
```

## Hybrid Retrieval

Retrieval combines three signals via Reciprocal Rank Fusion (RRF):

### 1. FTS5 BM25 (keyword)
- SQLite virtual table indexed on content + topic + tags
- Phrase matching with BM25 ranking
- Fast: handled entirely in SQLite

### 2. Vector cosine (semantic)
- Top-500 candidates pre-filtered by importance + recency
- Cosine distance computed in JS
- FTS hits outside top-500 always included in vector pool

### 3. Recency decay
- Half-life of ~11 days: `exp(-0.693 × days / 11.25)`
- Recent memories naturally rank higher

### Final score formula
```
score = 0.7 × RRF + 0.2 × recency + 0.1 × importance
```

Constraints (type = "constraint") have their importance floor-boosted to 0.8, ensuring "never do X" memories always appear.

## Deduplication

Context-aware dedup on every `remember()` call:

| Condition | Action |
|-----------|--------|
| dist < 0.05 | Update (near-identical) |
| dist < 0.15 AND same type AND same topic | Update (related) |
| otherwise | Add new memory |

This prevents both exact duplicates and slightly-rephrased duplicates from accumulating.

## MMR Reranking

After scoring, results are reranked using Maximal Marginal Relevance (λ=0.7):

- Balances relevance (70%) vs. diversity (30%)
- Prevents 5 similar memories from all appearing in top-10
- Ensures different facets of a topic are represented
