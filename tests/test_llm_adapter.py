import json

import httpx
import pytest

from proven.config import Settings
from proven.llm import OpenAICompatibleChat


def completion(message: dict) -> dict:
    return {
        "id": "x", "object": "chat.completion", "created": 0, "model": "qwen-test",
        "choices": [{"index": 0, "finish_reason": "tool_calls", "message": {"role": "assistant", **message}}],
        "usage": {"prompt_tokens": 120, "completion_tokens": 30, "total_tokens": 150},
    }


def make(handler) -> OpenAICompatibleChat:
    settings = Settings(llm_api_key="k", llm_base_url="https://example.test/v1", llm_model="qwen-test")
    return OpenAICompatibleChat(settings, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_parses_tool_calls_reasoning_and_usage():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, json=completion({
            "content": "先算一下",
            "reasoning_content": "思考过程",
            "tool_calls": [
                {"id": "c1", "type": "function", "function": {"name": "run_python", "arguments": '{"code": "print(1)", "purpose": "p"}'}},
                {"id": "c2", "type": "function", "function": {"name": "run_python", "arguments": "{not json"}},
            ],
        }))

    model = make(handler)
    tools = [{"type": "function", "function": {"name": "run_python", "description": "", "parameters": {"type": "object", "properties": {}}}}]
    r = await model.chat([{"role": "user", "content": "hi"}], tools=tools)
    assert seen["model"] == "qwen-test" and seen["tool_choice"] == "auto" and seen["tools"][0]["function"]["name"] == "run_python"
    assert r.content == "先算一下" and r.reasoning == "思考过程"
    assert r.usage == {"input_tokens": 120, "output_tokens": 30}
    assert r.tool_calls[0].arguments == {"code": "print(1)", "purpose": "p"} and r.tool_calls[0].parse_error is None
    assert r.tool_calls[1].arguments == {} and "invalid JSON" in r.tool_calls[1].parse_error
    # reasoning must not be sent back to the provider
    msg = r.as_message()
    assert "reasoning_content" not in msg and json.loads(msg["tool_calls"][0]["function"]["arguments"])["code"] == "print(1)"


async def test_json_mode_flag():
    seen = {}

    def handler(request):
        seen.update(json.loads(request.content))
        return httpx.Response(200, json=completion({"content": '{"steps": []}'}))

    await make(handler).chat([{"role": "user", "content": "plan"}], json_mode=True)
    assert seen["response_format"] == {"type": "json_object"} and "tools" not in seen


def test_missing_key_is_a_clear_error():
    with pytest.raises(RuntimeError, match="PROVEN_LLM_API_KEY"):
        OpenAICompatibleChat(Settings(llm_api_key=None))
