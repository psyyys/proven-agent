"""Runtime settings, read from environment variables (and an optional .env file)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


@dataclass
class Settings:
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str = "qwen-plus"
    llm_temperature: float = 0.1

    embed_model: str | None = None
    embed_base_url: str | None = None
    embed_api_key: str | None = None
    rerank_model: str | None = None

    workspace: Path = field(default_factory=lambda: Path("./workspace"))
    data_dir: Path = field(default_factory=lambda: Path("./data"))
    max_steps: int = 40
    # "single": one ReAct loop for the whole plan. "multi": one fresh-context analyst per plan step.
    mode: str = "single"
    step_budget: int = 10  # tool-calling turns per analyst in multi mode
    # Reviewer: "off"; "rules" (domain rules only, no model call); "full" (rules + model review).
    review: str = "full"
    cell_timeout: int = 120
    # Max characters of a tool result shown to the model; the full output always stays in the trace.
    tool_output_chars: int = 4000

    @classmethod
    def from_env(cls, env_file: str | Path | None = ".env") -> "Settings":
        if env_file and Path(env_file).exists():
            load_dotenv(env_file, override=False)
        return cls(
            llm_base_url=_env("PROVEN_LLM_BASE_URL"),
            llm_api_key=_env("PROVEN_LLM_API_KEY"),
            llm_model=_env("PROVEN_LLM_MODEL", "qwen-plus"),
            llm_temperature=float(_env("PROVEN_LLM_TEMPERATURE", "0.1")),
            embed_model=_env("PROVEN_EMBED_MODEL"),
            embed_base_url=_env("PROVEN_EMBED_BASE_URL"),
            embed_api_key=_env("PROVEN_EMBED_API_KEY"),
            rerank_model=_env("PROVEN_RERANK_MODEL"),
            workspace=Path(_env("PROVEN_WORKSPACE", "./workspace")),
            data_dir=Path(_env("PROVEN_DATA_DIR", "./data")),
            max_steps=int(_env("PROVEN_MAX_STEPS", "40")),
            mode=_env("PROVEN_MODE", "single"),
            step_budget=int(_env("PROVEN_STEP_BUDGET", "10")),
            review=_env("PROVEN_REVIEW", "full"),
            cell_timeout=int(_env("PROVEN_CELL_TIMEOUT", "120")),
            tool_output_chars=int(_env("PROVEN_TOOL_OUTPUT_CHARS", "4000")),
        )
