"""Hybrid retrieval: BM25 (jieba tokens) + vector similarity, fused with RRF, optionally reranked."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

import httpx
import jieba
import numpy as np
from rank_bm25 import BM25Okapi

from ..llm import Embedder
from .parse import SUPPORTED, Chunk, parse_file

jieba.setLogLevel(logging.WARNING)
log = logging.getLogger(__name__)

_TOKEN_OK = re.compile(r"\w")
DASHSCOPE_RERANK_URL = "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank"


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in jieba.lcut_for_search(text) if _TOKEN_OK.search(t)]


@dataclass
class Hit:
    chunk: Chunk
    score: float
    bm25_rank: int | None
    vector_rank: int | None
    rerank_score: float | None = None

    def to_dict(self) -> dict:
        return {
            **self.chunk.to_dict(),
            "score": round(self.score, 4),
            "bm25_rank": self.bm25_rank,
            "vector_rank": self.vector_rank,
            "rerank_score": self.rerank_score,
        }


class Reranker:
    """DashScope text rerank (gte-rerank). Any failure falls back to the fused ranking."""

    def __init__(self, model: str, api_key: str, url: str = DASHSCOPE_RERANK_URL):
        self.model, self.api_key, self.url = model, api_key, url

    async def rerank(self, query: str, docs: list[str], top_n: int) -> list[tuple[int, float]] | None:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    self.url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "input": {"query": query, "documents": docs},
                        "parameters": {"top_n": top_n, "return_documents": False},
                    },
                )
                r.raise_for_status()
                return [(x["index"], x["relevance_score"]) for x in r.json()["output"]["results"]]
        except Exception as e:  # noqa: BLE001 - reranking is an optimization, never a hard failure
            log.warning("rerank failed, using fused ranking: %s", e)
            return None


class KnowledgeBase:
    """Chunks from a set of files. Embeddings are cached on disk by content hash."""

    def __init__(self, cache_dir: Path, embedder: Embedder | None = None, reranker: Reranker | None = None):
        self.cache_dir = cache_dir
        self.embedder = embedder
        self.reranker = reranker
        self.chunks: list[Chunk] = []
        self._vectors: np.ndarray | None = None
        self._bm25: BM25Okapi | None = None
        self._next_id = 1

    @property
    def vector_enabled(self) -> bool:
        return self._vectors is not None

    async def add_files(self, paths: list[Path]) -> list[Chunk]:
        new: list[Chunk] = []
        for p in paths:
            if p.suffix.lower() not in SUPPORTED:
                continue
            for c in parse_file(p):
                c.id = f"D{self._next_id}"
                self._next_id += 1
                new.append(c)
        if not new:
            return []
        self.chunks.extend(new)
        self._bm25 = BM25Okapi([tokenize(c.heading + " " + c.text) for c in self.chunks])
        if self.embedder:
            try:
                vecs = await self._embed_cached([c.heading + "\n" + c.text for c in new])
                block = np.array(vecs, dtype=np.float32)
                block /= np.linalg.norm(block, axis=1, keepdims=True) + 1e-12
                self._vectors = block if self._vectors is None else np.vstack([self._vectors, block])
            except Exception as e:  # noqa: BLE001
                log.warning("embedding failed, falling back to BM25 only: %s", e)
                self._vectors = None
                self.embedder = None
        return new

    async def _embed_cached(self, texts: list[str]) -> list[list[float]]:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        model = getattr(self.embedder, "model", "default")
        keys = [hashlib.sha1(f"{model}\n{t}".encode()).hexdigest() for t in texts]
        out: dict[str, list[float]] = {}
        todo = []
        for k, t in zip(keys, texts):
            f = self.cache_dir / f"{k}.json"
            if f.exists():
                out[k] = json.loads(f.read_text())
            else:
                todo.append((k, t))
        if todo:
            vecs = await self.embedder.embed([t for _, t in todo])
            for (k, _), v in zip(todo, vecs):
                (self.cache_dir / f"{k}.json").write_text(json.dumps(v))
                out[k] = v
        return [out[k] for k in keys]

    async def search(self, query: str, top_k: int = 5, pool: int = 20, rrf_k: int = 60) -> list[Hit]:
        if not self.chunks:
            return []
        ranks: dict[int, dict[str, int]] = {}

        scores = self._bm25.get_scores(tokenize(query))
        for r, i in enumerate([i for i in np.argsort(-scores)[:pool] if scores[i] > 0]):
            ranks.setdefault(int(i), {})["bm25"] = r + 1

        if self.vector_enabled and self.embedder:
            try:
                q = np.array((await self.embedder.embed([query]))[0], dtype=np.float32)
                q /= np.linalg.norm(q) + 1e-12
                sims = self._vectors @ q
                for r, i in enumerate(np.argsort(-sims)[:pool]):
                    ranks.setdefault(int(i), {})["vector"] = r + 1
            except Exception as e:  # noqa: BLE001
                log.warning("query embedding failed, BM25 only: %s", e)

        fused = sorted(
            ((sum(1.0 / (rrf_k + r) for r in rk.values()), i, rk) for i, rk in ranks.items()),
            reverse=True,
        )
        hits = [Hit(self.chunks[i], s, rk.get("bm25"), rk.get("vector")) for s, i, rk in fused[: max(top_k * 2, 10)]]

        if self.reranker and len(hits) > 1:
            order = await self.reranker.rerank(query, [h.chunk.text for h in hits], top_n=top_k)
            if order:
                reranked = []
                for idx, score in order:
                    hits[idx].rerank_score = round(score, 4)
                    reranked.append(hits[idx])
                return reranked[:top_k]
        return hits[:top_k]

    def get(self, chunk_id: str) -> Chunk | None:
        return next((c for c in self.chunks if c.id == chunk_id), None)
