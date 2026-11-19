"""Tests verifying all FastAPI/Pydantic validation & HTTP errors return pure Russian text."""

from __future__ import annotations

import importlib
from pathlib import Path
import re

from fastapi.testclient import TestClient
import pytest

_ENGLISH_ERROR_LEAK_RE = re.compile(
    r"\b("
    r"Field required|String should|Input should|Value error|Extra inputs|"
    r"Not found|YYYY-MM-DD|HH:MM|VAPID|pywebpush|push-"
    r")\b",
    re.IGNORECASE,
)


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_file = tmp_path / "marina_val_test.sqlite3"
    monkeypatch.setenv("MARINA_DB_PATH", str(db_file))
    monkeypatch.delenv("VAPID_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)

    import app.main as app_main

    importlib.reload(app_main)
    with TestClient(app_main.app) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("method", "url", "payload", "expected_status", "expected_fragment"),
    [
        ("POST", "/api/tasks", {}, 422, "Заполните поле «Название»"),
        ("POST", "/api/tasks", {"title": ""}, 422, "Поле «Название» не может быть пустым"),
        ("POST", "/api/water/log", {"amount_ml": 99999}, 422, "Поле «Объём воды»"),
        ("POST", "/api/water/log", {"amount_ml": "abc"}, 422, "укажите целое число"),
        ("PUT", "/api/today/reflection", {"energy_level": 9}, 422, "Поле «Уровень энергии»"),
        ("POST", "/api/goals", {"title": "Цель", "status": "unknown"}, 422, "выберите допустимое значение"),
        ("POST", "/api/wishes", {"title": ""}, 422, "Поле «Название» не может быть пустым"),
        ("GET", "/api/today?date=bad-date", None, 422, "ГГГГ-ММ-ДД"),
        ("GET", "/api/nutrition/menu?slot=invalid", None, 422, "Неверный слот меню «invalid»"),
        ("GET", "/api/nonexistent-endpoint", None, 404, "Ресурс не найден"),
        ("POST", "/api/push/test", None, 400, "Уведомления на сервере ещё не настроены"),
    ],
)
def test_validation_and_http_errors_are_pure_russian(
    client: TestClient,
    method: str,
    url: str,
    payload: dict | None,
    expected_status: int,
    expected_fragment: str,
):
    res = client.request(method, url, json=payload) if payload is not None else client.request(method, url)
    assert res.status_code == expected_status, res.text
    body = res.json()
    detail = body["detail"]
    assert isinstance(detail, str) and detail.strip()
    assert expected_fragment in detail, detail
    assert not _ENGLISH_ERROR_LEAK_RE.search(detail), f"English leak in error detail: {detail}"
    if expected_status == 422 and "errors" in body:
        assert isinstance(body["errors"], list) and len(body["errors"]) >= 1
        for msg in body["errors"]:
            assert not _ENGLISH_ERROR_LEAK_RE.search(msg), f"English leak in error list: {msg}"
