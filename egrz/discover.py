"""Разведка API ЕГРЗ.

Спецификации у публичного API ЕГРЗ нет, а контракт меняется. Вместо того чтобы
угадывать его в коде, ``egrz discover`` перебирает кандидатов из конфига,
сохраняет, что именно ответил каждый, и по реальному ответу предлагает
готовое сопоставление полей — его остаётся перенести в ``sources/egrz.yaml``.
"""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from typing import Any

from .source import EgrzApiSource, SourceConfig, dig

#: Наше поле -> подстроки, по которым его узнают в ключах ответа.
#: Порядок внутри списка — по убыванию специфичности.
FIELD_HINTS: dict[str, tuple[str, ...]] = {
    "id": ("id", "guid", "uuid"),
    "registry_number": ("registrynumber", "numberinregistry", "regnumber", "reestrnumber"),
    "conclusion_number": ("conclusionnumber", "documentnumber", "number"),
    "date_registered": ("dateregistration", "registrationdate", "dateinclusion", "datecreate", "createdate"),
    "date_issued": ("dateconclusion", "conclusiondate", "documentdate", "datedocument"),
    "expertise_type": ("expertisetype", "typeexpertise", "kindexpertise"),
    "result": ("conclusionresult", "resultname", "result", "conclusiontype"),
    "subject_matter": ("objectexpertise", "subjectexpertise", "expertisesubject", "documentkind"),
    "is_repeat": ("isrepeat", "repeated", "repeat"),
    "object_name": ("objectname", "nameobject", "objectfullname", "name"),
    "address": ("objectaddress", "addressobject", "address", "location"),
    "region": ("regionname", "subjectrf", "subjectname", "region"),
    "region_code": ("regioncode", "coderegion", "subjectrfcode"),
    "purpose": ("objectpurpose", "purpose", "assignment"),
    "organization": ("expertorganizationname", "organizationname", "expertorganization", "orgname"),
    "organization_inn": ("expertorganizationinn", "organizationinn", "orginn"),
    "developer": ("developername", "customername", "applicantname", "developer"),
    "developer_inn": ("developerinn", "customerinn", "applicantinn"),
    "cost": ("estimatedcost", "smetnaya", "costtotal", "sumcost", "cost"),
}

#: Ключи верхнего уровня, за которыми обычно прячется массив записей.
ITEMS_KEYS = ("value", "items", "data", "results", "rows", "list", "records", "content")


def flatten_keys(payload: Any, prefix: str = "", depth: int = 0) -> dict[str, Any]:
    """Плоский словарь ``путь -> пример значения`` (до 3 уровней вложенности)."""
    flat: dict[str, Any] = {}
    if depth > 3:
        return flat
    if isinstance(payload, dict):
        for key, value in payload.items():
            path = f"{prefix}.{key}" if prefix else key
            if isinstance(value, (dict, list)):
                flat.update(flatten_keys(value, path, depth + 1))
            else:
                flat[path] = value
    elif isinstance(payload, list) and payload:
        flat.update(flatten_keys(payload[0], f"{prefix}.0" if prefix else "0", depth + 1))
    return flat


def find_items_path(payload: Any) -> str | None:
    """Ищет путь до массива записей внутри ответа."""
    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        return ""
    if not isinstance(payload, dict):
        return None

    for key in ITEMS_KEYS:
        value = dig(payload, key)
        if isinstance(value, list) and value and isinstance(value[0], dict):
            return key

    # Ключ мог называться иначе — берём самый «богатый» массив словарей.
    best: tuple[int, str] | None = None
    for key, value in payload.items():
        if isinstance(value, list) and value and isinstance(value[0], dict):
            score = len(value[0])
            if best is None or score > best[0]:
                best = (score, key)
        elif isinstance(value, dict):
            nested = find_items_path(value)
            if nested is not None:
                return f"{key}.{nested}" if nested else key
    return best[1] if best else None


def suggest_field_map(sample: dict[str, Any]) -> dict[str, list[str]]:
    """По одной реальной записи предлагает ``field_map`` для конфига."""
    available = list(flatten_keys(sample).keys())
    suggestion: dict[str, list[str]] = {}

    for target, hints in FIELD_HINTS.items():
        matches: list[tuple[int, str]] = []
        for path in available:
            leaf = path.split(".")[-1].lower().replace("_", "")
            for rank, hint in enumerate(hints):
                if hint == leaf:
                    matches.append((rank, path))
                    break
                if hint in leaf:
                    matches.append((rank + len(hints), path))
                    break
        if matches:
            matches.sort()
            suggestion[target] = [path for _, path in matches[:3]]
    return suggestion


def probe(
    config: SourceConfig, *, limit: int | None = None, retries: int = 0, timeout: float = 15.0
) -> dict[str, Any]:
    """Перебирает кандидатов и собирает отчёт о том, кто чем ответил.

    Разведка сознательно не использует боевую политику повторов: большинство
    кандидатов заведомо не подойдут, и ждать по четыре отката на каждом — значит
    превратить минутную проверку в получасовую. Здесь нужен быстрый отказ.
    """
    candidates = config.discovery_candidates[: limit or len(config.discovery_candidates)]
    probe_config = replace(
        config, http={**config.http, "retries": retries, "timeout": timeout, "rate_limit": 0}
    )
    source = EgrzApiSource(probe_config)
    report: dict[str, Any] = {"base_url": config.base_url, "attempts": []}

    try:
        for candidate in candidates:
            base = candidate.get("base_url") or config.base_url
            url = base.rstrip("/") + "/" + str(candidate.get("path", "")).lstrip("/")
            method = str(candidate.get("method", "GET")).upper()
            attempt: dict[str, Any] = {"method": method, "url": url}

            kwargs: dict[str, Any] = {}
            if candidate.get("query"):
                kwargs["params"] = candidate["query"]
            if candidate.get("json_body"):
                kwargs["json"] = candidate["json_body"]

            try:
                response = source._request(method, url, **kwargs)
            except Exception as exc:  # noqa: BLE001 — отчёт должен пережить любую ошибку
                attempt["error"] = str(exc)[:400]
                report["attempts"].append(attempt)
                continue

            attempt["status"] = response.status_code
            attempt["content_type"] = response.headers.get("content-type", "")

            if "json" not in attempt["content_type"]:
                attempt["note"] = "ответ не JSON — вероятно, HTML-страница или редирект"
                attempt["body_head"] = response.text[:300]
                report["attempts"].append(attempt)
                continue

            payload = response.json()
            items_path = find_items_path(payload)
            attempt["top_level_keys"] = (
                list(payload.keys())[:40] if isinstance(payload, dict) else f"list[{len(payload)}]"
            )
            attempt["items_path"] = items_path

            if items_path is not None:
                items = payload if items_path == "" else dig(payload, items_path)
                if items:
                    sample = items[0]
                    attempt["sample_keys"] = sorted(flatten_keys(sample).keys())[:80]
                    attempt["sample_record"] = sample
                    attempt["suggested_field_map"] = suggest_field_map(sample)
                    attempt["verdict"] = "ПОДХОДИТ — перенесите path/method и field_map в конфиг"
            else:
                attempt["verdict"] = "JSON без списка записей"

            report["attempts"].append(attempt)
    finally:
        source.close()

    report["summary"] = summarize(report)
    return report


def summarize(report: dict[str, Any]) -> str:
    winners = [a for a in report["attempts"] if a.get("suggested_field_map")]
    if winners:
        best = winners[0]
        return (
            f"Найден рабочий endpoint: {best['method']} {best['url']} "
            f"(items_path={best['items_path']!r}). Перенесите его в секцию `request` "
            f"конфига, а `suggested_field_map` — в `field_map`."
        )
    reachable = [a for a in report["attempts"] if a.get("status")]
    if reachable:
        return (
            "Хост отвечает, но список записей ни у одного кандидата не найден. "
            "Откройте реестр в браузере, скопируйте запрос из DevTools -> Network "
            "и добавьте его в `discovery_candidates`."
        )
    return (
        "Ни один кандидат не ответил: скорее всего, нет сетевого доступа к egrz.ru "
        "из этого окружения. Запустите разведку там, где доступ есть."
    )


def write_report(report: dict[str, Any], path: str | Path) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    return target
