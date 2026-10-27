"""Model adapter.

Everything goes through the OpenAI-compatible chat completions API, which DashScope (Qwen),
DeepSeek and most other providers implement. Switching providers is a configuration change.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Protocol

from .config import Settings


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]
    # Set when the model produced arguments that are not valid JSON.
    parse_error: str | None = None


@dataclass
class LLMResponse:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    # Reasoning text from thinking models (Qwen thinking mode, DeepSeek reasoner), if any.
    reasoning: str = ""
    usage: dict[str, int] = field(default_factory=dict)
    model: str = ""

    def as_message(self) -> dict[str, Any]:
        """The assistant message to append to the conversation history.

        Reasoning is deliberately left out: some providers reject it when sent back.
        """
        msg: dict[str, Any] = {"role": "assistant", "content": self.content or ""}
        if self.tool_calls:
            msg["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.name, "arguments": json.dumps(tc.arguments, ensure_ascii=False)},
                }
                for tc in self.tool_calls
            ]
        return msg


class ChatModel(Protocol):
    model: str

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        json_mode: bool = False,
    ) -> LLMResponse: ...


class Embedder(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class OpenAICompatibleChat:
    def __init__(self, settings: Settings, http_client=None):
        from openai import AsyncOpenAI

        if not settings.llm_api_key:
            raise RuntimeError("没有配置 PROVEN_LLM_API_KEY：请复制 .env.example 为 .env 并填入 API Key")
        self.client = AsyncOpenAI(
            api_key=settings.llm_api_key, base_url=settings.llm_base_url, max_retries=3, http_client=http_client
        )
        self.model = settings.llm_model
        self.temperature = settings.llm_temperature

    async def chat(self, messages, tools=None, json_mode=False) -> LLMResponse:
        kwargs: dict[str, Any] = {"model": self.model, "messages": messages, "temperature": self.temperature}
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        resp = await self.client.chat.completions.create(**kwargs)
        choice = resp.choices[0].message

        calls: list[ToolCall] = []
        for tc in choice.tool_calls or []:
            raw = tc.function.arguments or "{}"
            try:
                args = json.loads(raw)
                err = None if isinstance(args, dict) else "arguments must be a JSON object"
                if err:
                    args = {}
            except json.JSONDecodeError as e:
                args, err = {}, f"invalid JSON arguments: {e}"
            calls.append(ToolCall(id=tc.id, name=tc.function.name, arguments=args, parse_error=err))

        usage = {}
        if resp.usage:
            usage = {"input_tokens": resp.usage.prompt_tokens, "output_tokens": resp.usage.completion_tokens}
        return LLMResponse(
            content=choice.content or "",
            tool_calls=calls,
            reasoning=getattr(choice, "reasoning_content", None) or "",
            usage=usage,
            model=resp.model or self.model,
        )


class OpenAICompatibleEmbedder:
    # DashScope accepts at most 10 inputs per embeddings request; staying under that works everywhere.
    batch_size = 10

    def __init__(self, settings: Settings):
        from openai import AsyncOpenAI

        self.client = AsyncOpenAI(
            api_key=settings.embed_api_key or settings.llm_api_key,
            base_url=settings.embed_base_url or settings.llm_base_url,
            max_retries=3,
        )
        self.model = settings.embed_model

    async def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), self.batch_size):
            resp = await self.client.embeddings.create(model=self.model, input=texts[i : i + self.batch_size])
            out.extend(d.embedding for d in sorted(resp.data, key=lambda d: d.index))
        return out


def build_chat_model(settings: Settings) -> ChatModel:
    return OpenAICompatibleChat(settings)


def build_embedder(settings: Settings) -> Embedder | None:
    if not settings.embed_model or not (settings.embed_api_key or settings.llm_api_key):
        return None
    return OpenAICompatibleEmbedder(settings)
