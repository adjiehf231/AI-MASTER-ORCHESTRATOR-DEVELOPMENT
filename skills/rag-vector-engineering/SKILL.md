---
name: rag-vector-engineering
description: "Enterprise Retrieval-Augmented Generation (RAG) and semantic vector search standards — chunking strategies, hybrid search (BM25 + Dense vector embeddings), Cross-Encoder reranking, vector indexing (HNSW/IVFFlat), and retrieval evaluation metrics."
---

# Enterprise RAG & Semantic Vector Search Engineering Playbook

## 1. Identity & Mandate

This playbook governs the design, implementation, and optimization of Retrieval-Augmented Generation (RAG), vector indexing, and semantic retrieval systems for ${PROJECT_NAME}.
The objective is to achieve **zero hallucination**, sub-150ms retrieval latency (p95), high semantic recall, and computationally precise context synthesis.

Authoritative references: Enterprise Engineering Constitution (§1–§20), `skills/ai-feature/SKILL.md`, and `skills/api-design/SKILL.md`.

---

## 2. Hard Quality Gates — STOP & BLOCK IMMEDIATELY WHEN

1. **Unbounded Vector Retrieval:** Querying vector stores without top-k limits (`limit <= 10`), minimum similarity score thresholding (`score >= 0.75`), or namespace isolation = **GATE FAILURE -> REJECTED**.
2. **Missing Hybrid Search:** Relying solely on dense vector embeddings for technical, keyword-sensitive, or ID-based queries without sparse lexical matching (BM25 / Full-Text) = **RETRIEVAL DRIFT -> REJECTED**.
3. **Missing Re-ranking on High-Risk Domains:** Injecting raw embedding search results directly into LLM prompts in financial, legal, or statutory domains without Cross-Encoder or reranking verification = **PRECISION RISK -> REJECTED**.
4. **Context Window Flooding:** Passing uncompressed document chunks that exceed 50% of the maximum model context budget, causing "Lost in the Middle" attention degradation = **REJECTED**.

---

## 3. Ingestion & Chunking Architecture

### A. Chunking Strategy Matrix

| Content Type | Recommended Chunking Strategy | Target Chunk Size | Overlap | Justification |
| :--- | :--- | :--- | :--- | :--- |
| **Technical Docs & Specs** | Markdown Section / Header-Aware | 400–600 tokens | 50 tokens | Preserves hierarchical headings (`#`, `##`, `###`) and code block cohesion. |
| **Legal / Compliance / Policy** | Clause / Paragraph Boundary | 250–400 tokens | 40 tokens | Prevents splitting legal obligations and statutory conditions. |
| **Conversational Transcripts** | Turn-Based / Dialogue Boundary | 300–500 tokens | 30 tokens | Maintains speaker intent and question-answer continuity. |
| **Tabular & Structured Data** | Row-as-JSON or Markdown Table | Complete Row | 0 tokens | Prevents orphaned headers or fragmented tabular rows. |

### B. Invariant Chunk Metadata Standard
Every stored chunk must carry immutable metadata:
```typescript
interface DocumentChunk {
  id: string; // Deterministic hash of source_id + chunk_index
  documentId: string;
  tenantId: string; // Mandatory for multi-tenant isolation
  title: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embedding: number[]; // 768 or 1536 float array
  metadata: {
    sectionHeading: string;
    sourceUrl?: string;
    updatedAt: string;
    checksum: string;
  };
}
```

---

## 4. Hybrid Search Architecture (Sparse + Dense Fusion)

Pure dense embeddings struggle with exact matches (SKUs, IDs, acronyms), while pure BM25 struggles with synonymy. All production retrieval pipelines must implement **Reciprocal Rank Fusion (RRF)**:

```typescript
// Reciprocal Rank Fusion calculation
function computeRRF(denseRanks: Map<string, number>, sparseRanks: Map<string, number>, k = 60): Map<string, number> {
  const fusedScores = new Map<string, number>();
  
  const allDocIds = new Set([...denseRanks.keys(), ...sparseRanks.keys()]);
  
  for (const docId of allDocIds) {
    const rDense = denseRanks.get(docId) ?? 9999;
    const rSparse = sparseRanks.get(docId) ?? 9999;
    
    const score = (1 / (k + rDense)) + (1 / (k + rSparse));
    fusedScores.set(docId, score);
  }
  
  return fusedScores;
}
```

---

## 5. Re-ranking & Contextual Compression

1. **Initial Candidate Retrieval:** Retrieve Top-20 candidates using Hybrid Search (RRF).
2. **Cross-Encoder Re-ranking:** Score the Top-20 candidates using a dedicated cross-encoder (e.g. `bge-reranker-large` or Cohere Rerank) to produce semantic relevance scores between query and document.
3. **Context Selection:** Take only Top-5 reranked documents that pass the statutory threshold (`rerank_score >= 0.70`).
4. **Contextual Compression:** Strip redundant boilerplate, whitespace, and irrelevant sentences before prompt assembly.

---

## 6. Vector Database Indexing & Performance Guidelines

### PostgreSQL (`pgvector`)
- **Index Type:** Use **HNSW (Hierarchical Navigable Small World)** over IVFFlat for sub-10ms query times and zero rebuild downtime:
  ```sql
  CREATE INDEX CONCURRENTLY idx_chunks_embedding_hnsw 
  ON document_chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
  ```
- **Query Setting:** Set `SET hnsw.ef_search = 40;` inside the query transaction for optimal trade-off between recall (>95%) and latency (<15ms).

---

## 7. Golden Evaluation Metrics

Evaluate RAG pipelines using deterministic offline golden datasets:
1. **Hit Rate@K:** Proportion of test queries where ground-truth document appears in Top-K (Target: $\ge 92\%$ at $K=5$).
2. **Mean Reciprocal Rank (MRR):** Average of reciprocal rank of the first relevant result (Target: $\ge 0.85$).
3. **Context Relevance Score:** Percentage of injected tokens directly relevant to answer generation (Target: $\ge 80\%$).
4. **Zero-Hallucination Parity:** 100% of factual assertions in answer verifiable against retrieved chunks ($N_{out} \subseteq N_{in}$).

