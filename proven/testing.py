"""A scripted chat model for tests and offline demos. It replays prepared responses in order."""

from __future__ import annotations

import itertools
import json
from typing import Any, Callable

from .llm import LLMResponse, ToolCall

_ids = itertools.count(1)


def tool(name: str, **arguments: Any) -> ToolCall:
    return ToolCall(id=f"call_{next(_ids)}", name=name, arguments=arguments)


def say(content: str = "", *calls: ToolCall) -> LLMResponse:
    return LLMResponse(content=content, tool_calls=list(calls), usage={"input_tokens": 100, "output_tokens": 20}, model="scripted")


def plan(steps: list[str], answerable: bool = True, reason: str = "", understanding: str = "") -> LLMResponse:
    body = {
        "understanding": understanding or "按用户问题进行分析",
        "answerable": answerable,
        "reason": reason,
        "assumptions": [],
        "steps": [{"title": s, "detail": s} for s in steps] if answerable else [],
    }
    return say(json.dumps(body, ensure_ascii=False))


Step = LLMResponse | Callable[[list[dict[str, Any]]], LLMResponse]


class ScriptedChat:
    model = "scripted"

    def __init__(self, script: list[Step]):
        self.script = list(script)
        self.calls: list[dict[str, Any]] = []

    async def chat(self, messages, tools=None, json_mode=False) -> LLMResponse:
        self.calls.append({"messages": [dict(m) for m in messages], "tools": bool(tools), "json_mode": json_mode})
        if not self.script:
            raise AssertionError("ScriptedChat ran out of responses")
        step = self.script.pop(0)
        return step(messages) if callable(step) else step
