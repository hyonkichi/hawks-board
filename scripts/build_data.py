"""ブルペン・ファーム・好不調の data/*.json を作り直すスクリプトの雛形。

優勝確率は scripts/simulate.py が担当するので、ここでは扱わない。
いまは JSON の形を保ったまま updated_at だけを更新する。
データ取得部分（collect_* 関数）は自分で埋めること。

注意：成績データの取得元は、利用規約とrobots.txtを必ず確認してから決める。
      取得が認められない先からのスクレイピングはしない。手入力でも仕組みは同じ。
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

JST = timezone(timedelta(hours=9))
DATA = Path(__file__).resolve().parent.parent / "data"


def load(name: str) -> dict:
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


def save(name: str, obj: dict) -> None:
    now = datetime.now(JST)
    obj["updated_at"] = now.isoformat(timespec="seconds")
    obj["as_of"] = f"{(now - timedelta(days=1)):%-m月%-d日}終了時点"
    (DATA / f"{name}.json").write_text(
        json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("wrote", name)


# --- ここから下を実装する -------------------------------------------------

def collect_bullpen(current: dict) -> dict:
    """リリーフ投手ごとの直近7日の球数と、連投日数・中何日を更新する。
    status は "ready" / "caution" / "rest" のいずれか。
    """
    return current


def collect_farm(current: dict) -> dict:
    """二軍成績と一軍の空き具合から昇格候補を並べ替える。"""
    return current


def collect_form(current: dict) -> dict:
    """直近10試合とシーズン平均を比べる。diff_ratio は -1〜1 くらいに正規化した差。"""
    return current


def main() -> None:
    for name, fn in (
        ("bullpen", collect_bullpen),
        ("farm", collect_farm),
        ("form", collect_form),
    ):
        data = fn(load(name))
        # 実データを入れたら sample を外す
        # data["sample"] = False
        save(name, data)


if __name__ == "__main__":
    main()
