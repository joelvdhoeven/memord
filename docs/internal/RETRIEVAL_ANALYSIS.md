# memord: Retrieval & Embeddings Analyse

**Datum:** 2026-03-10
**Versie:** 0.1.0
**Scope:** Embedding model, retrieval pipeline, scoring, token kosten, verbeteringen

---

## 1. Huidig systeem — technisch overzicht

### Embedding model
- **Model:** `Xenova/all-MiniLM-L6-v2` (quantized ONNX, ~22MB)
- **Dimensies:** 384-dim
- **Pooling:** mean pooling + L2 normalisatie
- **Opslag:** Float32Array als BLOB in SQLite (~1536 bytes/memory)
- **Inferentie:** Lokaal via @xenova/transformers, geen API key nodig

### Retrieval pipeline (stap voor stap)

```
query tekst
    ↓ embed()
384-dim query vector
    ↓
Parallel:
  A) FTS5 BM25 phrase search → top 20 (op content + topic + tags)
  B) getTopCandidates(500) → top 500 op importance DESC + last_accessed DESC
       → cosine distance voor alle 500 → top 20 vector resultaten
    ↓
Voeg FTS hits die buiten top-500 vallen toe aan pool
    ↓
RRF fusion (k=60):
  score = Σ 1/(60 + rank)   voor FTS rank + vector rank
    ↓
Final score = RRF×0.7 + recency×0.2 + importance×0.1
  recency = exp(-0.693 × days / 11.25)   [half-life: 11.25 dagen]
    ↓
Filters: type, min_importance, since, app
    ↓
MMR rerank (λ=0.7)   [70% relevantie, 30% diversiteit]
    ↓
Resultaat: default 10 memories
```

### Kritieke parameters

| Parameter | Waarde | Configureerbaar |
|-----------|--------|----------------|
| Embedding model | all-MiniLM-L6-v2 (384-dim) | Nee (hardcoded) |
| Vector pre-filter | top 500 op importance+recency | Nee (hardcoded) |
| FTS limit | 20 | Nee (hardcoded) |
| RRF k | 60 | Nee |
| Scoring weights | 0.7 RRF · 0.2 recency · 0.1 importance | Nee |
| Recency half-life | 11.25 dagen | Nee |
| Dedup threshold | 0.08 cosine distance (= 0.92 similarity) | `MEMORD_SIMILARITY_THRESHOLD` |
| Importance drempel | 0.3 | `MEMORD_IMPORTANCE_THRESHOLD` |
| MMR lambda | 0.7 | Nee |
| Default recall limit | 10 | Per call instelbaar |

---

## 2. Token kosten analyse

### Wat `recall` teruggeeft per memory

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "project_fact",
  "topic": "tech_stack",
  "content": "Joel gebruikt Next.js App Router als standaard frontend...",
  "importance": 0.8,
  "app": "claude-desktop",
  "score": 0.742,
  "stored": "2026-03-10T16:43:44.000Z"
}
```

### Token kosten per scenario

| Scenario | Memories | ~Tokens | Opmerkingen |
|----------|----------|---------|-------------|
| Default recall | 10 | **~1.100** | 7 velden per memory, avg 200 char content |
| Max recall | 50 | **~5.500** | |
| `memory://recent` resource | 20 | **~3.200** | Volledige Memory objecten incl. alle velden |
| `reflect` tool | 15 | **~2.500** | + summary string |

### Verspilling

~30-40% van de tokens zijn overhead die de LLM zelden gebruikt:
- **`id`** (36 chars/UUID): alleen nodig voor forget/update calls
- **`score`**: debug info, niet nuttig voor LLM
- **`app`**: zelden relevant voor context
- **`stored`** timestamp: redundant met recency scoring

### `memory://recent` is het zwaarste

Geeft volledige Memory objecten terug inclusief `source`, `access_count`, `event_time`, `ingestion_time`, `last_accessed` — allemaal nutteloos voor LLM context injection.

---

## 3. Wat ontbreekt (inhoudelijk)

### A. Semantic keywords / concept tags ← grootste gap

FTS5 doet letterlijke BM25 match. Als een memory zegt _"Joel gebruikt Next.js App Router"_ en je zoekt op _"frontend framework voorkeur"_ — FTS5 mist dit volledig. Vector pakt het wel, maar FTS5 heeft geen signaalversterking op conceptniveau.

**Wat beter zou zijn:** Bij opslaan automatisch 3-5 semantische keywords extraheren en toevoegen aan de `tags[]` array. FTS5 indexeert tags al — dit kost nul infrastructuur.

```
content: "Joel gebruikt Next.js App Router als standaard frontend"
auto-tags: ["nextjs", "app-router", "frontend", "framework", "preference"]
```

### B. Topic inference is te simplistisch

Huidige aanpak: 8 regex patronen, first-match wins. "Joel wil zijn Supabase project deployen op Vercel" → matcht `data_layer`. Maar `project`, `deployment` en `tech_stack` zijn net zo relevant.

**Wat beter zou zijn:**
- Multi-topic tagging (array ipv single string)
- Meer patronen of LLM-gebaseerde topic classificatie
- Hiërarchische topics: `tech_stack.frontend.nextjs`

### C. Named entity indexing

Persoonsnamen, bedrijfsnamen, projectnamen, technologieën zijn niet apart geïndexeerd. Zoeken op "HoevenSolutions" matcht alleen memories die exact die naam bevatten — geen varianten, geen aliassen.

**Wat beter zou zijn:** Entity extractie bij opslaan (regex voor technologieën + namen, of lichte NLP), opslaan als gestructureerde tags.

### D. Deduplicatie drempel te agressief

Cosine distance < 0.08 = cosine similarity > 0.92. Dat is extreem gelijkend. Memories over hetzelfde onderwerp maar met andere inhoud kunnen erdoor worden geslokt:

- _"Joel gebruikt TypeScript"_ + _"Joel heeft een sterke voorkeur voor strict TypeScript config"_ → zelfde cluster, maar beide het opslaan waard

**Wat beter zou zijn:** Context-aware deduplicatie:
```
dist < 0.05                          → update (vrijwel identiek)
dist < 0.15 AND sameType AND sameTopic → update
else                                 → nieuwe memory toevoegen
```

### E. Geen query expansion

Query gaat in as-is. Generieke vragen zoals _"wat weet je over mijn werk?"_ vinden weinig terug. **HyDE** (Hypothetical Document Embeddings: genereer een hypothetisch antwoord, embed dát) geeft significant betere semantic recall.

Simpelere variant: synoniemen/parafrasen toevoegen aan de query embedding via gemiddelde.

### F. Geen memory compression / summarization

Bij 200+ memories worden nooit memories samengevoegd. Oud episodisch geheugen staat er eeuwig in (tot TTL). `reflect()` geeft alleen een ruwe lijst terug, geen echte synthese.

**Wat beter zou zijn:**
- Periodieke clustering van gelijksoortige memories → samenvatten tot één
- Episodic → semantic consolidatie na X dagen
- `reflect()` genereert een echte samenvatting (lokaal via Ollama)

### G. Embedding batching is sequentieel

```ts
// "batch" is gewoon sequential Promise.all over ONNX inferentie
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  return Promise.all(texts.map(t => embed(t)));  // ❌ niet echt parallel
}
```

Transformers.js ondersteunt matrix batching — dit wordt niet benut. Bij bulk import (setup, session-end extraction) is dit een bottleneck.

### H. `memory://recent` velden niet getrimd

De MCP resource `memory://recent` geeft volledige Memory objecten terug met alle interne velden. Dit is de meest token-verspillende manier om context in tejecteren.

---

## 4. Vergelijking met andere memory systemen

| Techniek | memord huidig | mem0 | MemGPT/Letta | Zep |
|---------|--------------|------|-------------|-----|
| Embedding model | all-MiniLM-L6-v2 (lokaal) | OpenAI/lokaal | OpenAI | OpenAI/lokaal |
| Hybrid retrieval | RRF (FTS5 + vector) | vector + graph | vector | vector + BM25 |
| Semantic keywords | ❌ | ✅ auto-extract | ✅ | ✅ |
| Entity linking | ❌ | ✅ (knowledge graph) | ✅ | ✅ (Neo4j) |
| Memory compression | ❌ | ✅ | ✅ (hierarchical) | ✅ |
| Contradiction detection | ❌ | ✅ | ✅ | ❌ |
| Token budget management | ❌ | ✅ | ✅ | ✅ |
| Query expansion (HyDE) | ❌ | ❌ | ✅ | ❌ |
| Geen API key nodig | ✅ | ❌ | ❌ | ❌ |
| SQLite (lokaal) | ✅ | ❌ | ❌ | ❌ |

**Grootste voordeel van memord:** volledig lokaal, geen API key, cross-tool. \
**Grootste gaps:** semantic keywords, entity linking, memory compression.

---

## 5. Verbeteringskaart

### 🔴 Quick wins (laag effort, hoog impact)

#### QW-1: Token-efficiënte recall output (−35% tokens)
```ts
// Nu: id, type, topic, content, importance, app, score, stored
// Compact: alleen wat de LLM nodig heeft
memories: results.map(r => ({
  id: r.memory.id,          // alleen voor forget/update
  type: r.memory.type,
  topic: r.memory.topic,
  content: r.memory.content,
  importance: r.memory.importance,
  // weg: app, score, stored
}))
```

#### QW-2: `memory://recent` trimmen (−50% tokens)
```ts
// Alleen nuttige velden voor context injection:
{ type, topic, content, importance }
```

#### QW-3: Deduplicatie verfijnen
```ts
// Onderscheid: exact duplicaat vs gerelateerde nieuwe info
if (dist < 0.05) → update (vrijwel identiek)
if (dist < 0.15 && memory.type === input.type && memory.topic === inferTopic(input.content)) → update
else → toevoegen
```

#### QW-4: Multi-topic tagging
```ts
// Meerdere topics per memory
function inferTopics(content: string): string[] {
  return TOPIC_PATTERNS
    .filter(([pattern]) => pattern.test(content))
    .map(([, topic]) => topic)
    .slice(0, 3);  // max 3 topics
}
```

---

### 🟡 Middel (middel effort, hoog impact)

#### M-1: Semantic keyword extractie bij opslaan

Automatisch keywords extraheren en toevoegen aan `tags[]`. FTS5 indexeert tags al → nul extra infrastructuur.

```ts
// Simpele aanpak: TF-IDF achtige extractie van zelfstandige naamwoorden
function extractKeywords(content: string): string[] {
  // 1. Stop words verwijderen
  // 2. Technologie-namen matchen (regex woordenboek)
  // 3. Bigrammen extraheren
  // 4. Top-5 teruggeven
}

// Bij remember():
const autoKeywords = extractKeywords(input.content);
const allTags = [...(input.tags ?? []), ...autoKeywords];
```

**Impact:** FTS5 recall verbeterd voor semantisch verwante queries, zonder API calls.

#### M-2: Token budget management

```ts
// Bij recall: total tokens budget limiet
const MAX_RECALL_TOKENS = 2000;

function formatMemoriesWithBudget(memories: Memory[], maxTokens: number) {
  let tokens = 0;
  const result = [];
  for (const m of memories) {
    const estimated = Math.ceil((m.content.length + 50) / 4);  // ~4 chars/token
    if (tokens + estimated > maxTokens) break;
    result.push({ type: m.type, topic: m.topic, content: m.content, importance: m.importance });
    tokens += estimated;
  }
  return result;
}
```

#### M-3: Importance boost voor constraints

```ts
// Constraints moeten hoger scoren dan preferences
const finalScore = base * 0.7 + recency * 0.2 + (
  memory.type === 'constraint' ? Math.max(memory.importance, 0.8) : memory.importance
) * 0.1;
```

---

### 🟢 Langere termijn (hoog effort, game-changer)

#### L-1: Multi-query retrieval (praktischer dan HyDE)

HyDE vereist een LLM call per recall query. Zonder Ollama niet haalbaar. Praktischer alternatief: **multi-query retrieval** — genereer 3 varianten van de query op verschillende abstractieniveaus, fuse met RRF.

```ts
// Geen LLM nodig voor basis variant:
function expandQuery(query: string): string[] {
  return [
    query,                                          // literal
    query.toLowerCase().replace(/[?!.,]/g, ''),     // normalized
    extractMainNoun(query),                         // entity-focused
  ];
}

// Run recall voor elk, fuse resultaten met RRF
async function multiQueryRecall(query: string, options: RecallOptions) {
  const variants = expandQuery(query);
  const resultSets = await Promise.all(variants.map(q => recall({ ...options, query: q })));
  return rrfFuse(resultSets);
}
```

**Impact:** Betere recall voor vage queries, geen API key nodig.

#### L-2: Betere embedding model

| Model | Dim | Grootte | MTEB Top-1 | MTEB Top-5 | ONNX |
|-------|-----|---------|-----------|-----------|------|
| all-MiniLM-L6-v2 (huidig) | 384 | 22MB | ~56% | ~28% | ✅ |
| **e5-small-v2** | **384** | **33MB** | **beter** | **~100%** | **✅** |
| BGE-small-en-v1.5 | 384 | ~33MB | vergelijkbaar | sterk | ✅ |
| nomic-embed-text-v1 | 768 | 137MB | ~81% | - | Via Ollama |

**Aanbeveling: `e5-small-v2`** — zelfde 384-dim (geen re-migratie van vector opslag nodig), zelfde ONNX library, ~16ms inferentie. Top-5 accuracy springt van 28% naar ~100% in RAG benchmarks. Enige aanpassing: prefix `"query: "` of `"passage: "` toevoegen aan input.

```ts
// Migratie is minimaal:
export async function embed(text: string, role: 'query' | 'passage' = 'passage'): Promise<Float32Array> {
  const prefixed = `${role}: ${text}`;  // E5 instruction format
  // rest blijft hetzelfde
}
```

Na model wissel: embeddings opnieuw genereren voor bestaande memories (eenmalig).

#### L-3: Memory compression pipeline

```
Elke 7 dagen (of bij > X memories):
  1. Cluster memories per topic via k-means op embeddings
  2. Per cluster: genereer samenvatting via Ollama
  3. Sla samenvatting op als nieuwe memory (type: 'skill' of 'project_fact')
  4. Archiveer of verwijder de originele episodic memories
```

#### L-4: Echte ONNX batching

```ts
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (!embedder) await loadEmbedder();
  // Echte matrix batch in één ONNX forward pass:
  const output = await (embedder as any)(texts, { pooling: 'mean', normalize: true });
  // output.data is nu een flat Float32Array met alle embeddings aaneengesloten
  return Array.from({ length: texts.length }, (_, i) =>
    output.data.slice(i * 384, (i + 1) * 384)
  );
}
```

#### M-4: Prose injection ipv JSON (−50% tokens voor zelfde info)

Mem0 benchmark: structured JSON kost ~2× meer tokens dan prose bij context injection. Store intern structureel (voor filtering), maar inject als prose bullets:

```ts
// Nu (~50 tokens/memory):
{"type":"project_fact","topic":"tech_stack","content":"Joel gebruikt Next.js","importance":0.8}

// Prose format (~15 tokens/memory):
"[project_fact] Joel gebruikt Next.js App Router als standaard frontend."

// Template:
function formatForInjection(memories: Memory[]): string {
  return memories.map(m =>
    `- [${m.type}${m.topic !== 'general' ? '/' + m.topic : ''}] ${m.content}`
  ).join('\n');
}
```

---

## 6. Prioriteitenlijst

| # | Verbetering | Tokens bespaard | Retrieval impact | Effort |
|---|-------------|----------------|-----------------|--------|
| 1 | Compact recall output | −35% | Geen | 1u |
| 2 | `memory://recent` trimmen | −50% | Geen | 30m |
| 3 | Token budget management | −variable | Geen | 2u |
| 4 | Deduplicatie drempel verfijnen | Geen | Hoog | 1u |
| 5 | Multi-topic tagging | Geen | Middel | 2u |
| 6 | Semantic keyword extractie | Geen | Hoog | 4u |
| 7 | Importance boost constraints | Geen | Middel | 30m |
| 8 | HyDE query expansion | Geen | Zeer hoog | 4u |
| 9 | **e5-small-v2** embedding model | Geen | Zeer hoog (Top-5: 28%→100%) | 3u |
| 10 | Prose injection format | −50% | Geen | 1u |
| 11 | Memory compression pipeline | −30% langdurig | Hoog | 8u |
| 12 | Multi-query retrieval | Geen | Hoog | 4u |
| 13 | Echte ONNX batching | Geen | Geen (snelheid) | 3u |

---

## 7. Samenvatting

memord heeft een solide hybride retrieval pipeline: RRF over FTS5 + vector, gevolgd door MMR reranking. Het is volledig lokaal en API-key-vrij — een uniek voordeel.

**De twee grootste zwakheden zijn:**

1. **Token verspilling** — de recall output bevat 30-40% overhead velden die de LLM niet gebruikt. Dit is de makkelijkste win.

2. **Semantic gap in FTS5** — BM25 doet alleen letterlijke matching. Zonder semantic keyword extractie mist FTS5 de helft van de relevante memories bij conceptuele queries. Vector compenseert dit deels maar beide samen is veel sterker.

De rest (entity linking, memory compression, HyDE) zijn mooie langetermijn verbeteringen die memord op het niveau van commerciële systemen zoals mem0/Zep brengen — maar dan lokaal.
