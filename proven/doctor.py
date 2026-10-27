"""`proven doctor`: check configuration and connectivity to the model service, step by step."""

from __future__ import annotations

import asyncio
import os
import socket
import time
from urllib.parse import urlparse

from .config import Settings


def _mask(key: str | None) -> str:
    if not key:
        return "（未设置）"
    return f"{key[:5]}…{key[-4:]}（长度 {len(key)}）" if len(key) > 12 else "（过短，可能不完整）"


def _flag_whitespace(name: str, value: str | None) -> None:
    if value and (value != value.strip() or value.strip("\"'") != value):
        print(f"  ⚠ {name} 两端有空格或引号，请删除：{value!r}")


async def run_doctor() -> int:
    s = Settings.from_env()
    print("1. 配置（来自 .env 和环境变量）")
    print(f"   .env 文件：{'存在' if os.path.exists('.env') else '不存在（当前目录：' + os.getcwd() + '）'}")
    print(f"   PROVEN_LLM_BASE_URL = {s.llm_base_url or '（未设置，将使用 OpenAI 官方地址）'}")
    print(f"   PROVEN_LLM_MODEL    = {s.llm_model}")
    print(f"   PROVEN_LLM_API_KEY  = {_mask(s.llm_api_key)}")
    for name in ("PROVEN_LLM_BASE_URL", "PROVEN_LLM_MODEL", "PROVEN_LLM_API_KEY"):
        _flag_whitespace(name, os.environ.get(name))
    if not s.llm_api_key:
        print("   ✗ 没有 API Key")
        return 1

    proxies = {k: v for k, v in os.environ.items() if k.lower() in ("http_proxy", "https_proxy", "all_proxy")}
    print("\n2. 代理设置")
    if proxies:
        for k, v in proxies.items():
            print(f"   {k} = {v[:80]}")
        print("   提示：如果连接失败，可以先关掉代理/VPN，或清除这些变量后重试")
    else:
        print("   未设置代理环境变量")

    url = urlparse(s.llm_base_url or "https://api.openai.com/v1")
    print(f"\n3. 域名解析：{url.hostname}")
    if url.scheme not in ("http", "https") or not url.hostname:
        print(f"   ✗ 地址格式不对，应类似 https://dashscope.aliyuncs.com/compatible-mode/v1")
        return 1
    try:
        addrs = sorted({a[4][0] for a in socket.getaddrinfo(url.hostname, url.port or 443)})
        print(f"   ✓ {', '.join(addrs[:3])}")
    except OSError as e:
        print(f"   ✗ 解析失败：{e}（检查网址拼写和网络）")
        return 1

    print(f"\n4. 调用模型：{s.llm_model}")
    from .agent.orchestrator import describe_error
    from .llm import OpenAICompatibleChat

    try:
        started = time.monotonic()
        model = OpenAICompatibleChat(s)
        model.client = model.client.with_options(max_retries=0, timeout=30)
        r = await model.chat([{"role": "user", "content": "只回复两个字：你好"}])
        print(f"   ✓ 回复：{r.content.strip()[:50]}（{time.monotonic() - started:.1f} 秒，模型 {r.model}）")
    except Exception as e:  # noqa: BLE001 - this command exists to show the error
        print(f"   ✗ {describe_error(e)}")
        return 1

    print("\n5. 工具调用（Agent 必需）")
    tools = [{"type": "function", "function": {"name": "add", "description": "两数相加",
              "parameters": {"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]}}}]
    try:
        r = await model.chat([{"role": "user", "content": "用 add 工具计算 2+3"}], tools=tools)
        if r.tool_calls:
            print(f"   ✓ 模型调用了工具：{r.tool_calls[0].name}({r.tool_calls[0].arguments})")
        else:
            print(f"   ⚠ 模型没有调用工具，而是直接回复了：{r.content[:60]}。这个模型可能不适合做 Agent")
    except Exception as e:  # noqa: BLE001
        print(f"   ✗ {describe_error(e)}")
        return 1
    print("\n全部通过。")
    return 0


def main() -> int:
    return asyncio.run(run_doctor())
