from pathlib import Path

import pytest

from proven.config import Settings
from proven.service import Service

DATA = Path(__file__).resolve().parents[1] / "data"


@pytest.fixture
def settings(tmp_path):
    # Rules-only review by default: scripted models in older tests do not script reviewer replies.
    return Settings(llm_api_key="test", workspace=tmp_path / "ws", data_dir=DATA, cell_timeout=30, review="rules")


def make_service(settings: Settings, model) -> Service:
    return Service(settings, model_factory=lambda: model, use_default_embedder=False)


requires_data = pytest.mark.skipif(
    not (DATA / "business" / "chinook" / "Invoice.csv").exists(),
    reason="demo data not downloaded (python scripts/fetch_datasets.py)",
)
