#!/usr/bin/env python3
"""ペナントレース優勝確率シミュレーター。

input/standings.json を読み、残り試合をモンテカルロ法で回して
サイトが読む data/championship.json を書き出す。
ついでに data/history.json（日次の確率。前日比の計算元）と
data/post.txt（X にそのまま貼れるテキスト）も更新する。

標準ライブラリだけで動く。pip install 不要。
"""

from __future__ import annotations

import json
import os
import random
from datetime import datetime, timezone, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_PATH = os.path.join(BASE_DIR, "input", "standings.json")
DATA_DIR = os.path.join(BASE_DIR, "data")
CHAMP_PATH = os.path.join(DATA_DIR, "championship.json")
HISTORY_PATH = os.path.join(DATA_DIR, "history.json")
POST_PATH = os.path.join(DATA_DIR, "post.txt")

JST = timezone(timedelta(hours=9))

SCENARIOS = [("残り全勝", 1.0), ("7割ペース", 0.7), ("5割ペース", 0.5), ("3割ペース", 0.3)]


# ---------------------------------------------------------------- 読み込み

def load_data():
    with open(INPUT_PATH, encoding="utf-8") as f:
        data = json.load(f)

    teams = data["teams"]
    remaining = {k: v for k, v in data["remaining"].items() if v > 0}

    for code in teams:
        teams[code]["remaining"] = 0
    for pair, n in remaining.items():
        a, b = pair.split("-")
        for code in (a, b):
            if code not in teams:
                raise ValueError(f"remaining の '{pair}' に未知のチーム '{code}' があります")
            teams[code]["remaining"] += n

    return data, teams, remaining


def win_pct(w, l):
    """NPBの勝率は引き分けを除いて計算する。"""
    return w / (w + l) if (w + l) > 0 else 0.0


def log5(p_a, p_b):
    """勝率 p_a のチームが勝率 p_b のチームに勝つ確率。相手の強さを織り込める。"""
    denom = p_a + p_b - 2 * p_a * p_b
    if denom <= 0:
        return 0.5
    return (p_a - p_a * p_b) / denom


# ---------------------------------------------------------------- 本体

def simulate(teams, remaining, draw_rate, trials, seed=None, my_code=None, my_pace=None):
    """my_pace を渡すと、自チームの残り試合の勝率をその値に固定する（想定シナリオ用）。"""
    rng = random.Random(seed)
    codes = list(teams.keys())
    base_pct = {c: win_pct(teams[c]["w"], teams[c]["l"]) for c in codes}

    games = []
    for pair, n in remaining.items():
        a, b = pair.split("-")
        p = log5(base_pct[a], base_pct[b])
        if my_pace is not None and my_code in (a, b):
            p = my_pace if a == my_code else 1.0 - my_pace
        games.extend([(a, b, p)] * n)

    champ_count = {c: 0.0 for c in codes}
    rank_sum = {c: 0.0 for c in codes}

    for _ in range(trials):
        w = {c: teams[c]["w"] for c in codes}
        l = {c: teams[c]["l"] for c in codes}

        for a, b, p in games:
            if rng.random() < draw_rate:
                continue  # 引き分け。勝率計算には影響しない
            if rng.random() < p:
                w[a] += 1
                l[b] += 1
            else:
                w[b] += 1
                l[a] += 1

        final = sorted(codes, key=lambda c: win_pct(w[c], l[c]), reverse=True)
        top = win_pct(w[final[0]], l[final[0]])
        winners = [c for c in codes if win_pct(w[c], l[c]) == top]

        # 同率首位はNPBでは直接対決などで決めるが、ここでは均等に分配する
        share = 1.0 / len(winners)
        for c in winners:
            champ_count[c] += share
        for i, c in enumerate(final, start=1):
            rank_sum[c] += i

    results = []
    for c in codes:
        results.append({
            "code": c,
            "name": teams[c]["name"],
            "w": teams[c]["w"], "l": teams[c]["l"], "d": teams[c]["d"],
            "pct": base_pct[c],
            "remaining": teams[c]["remaining"],
            "champ": champ_count[c] / trials * 100,
            "avg_rank": rank_sum[c] / trials,
        })
    results.sort(key=lambda r: (-r["champ"], -r["pct"]))
    return results


def magic_number(teams, my_code):
    """マジックナンバー（簡易版）。NPBは勝率で順位を決めるため目安の数字。"""
    me = teams[my_code]
    rivals = [c for c in teams if c != my_code]
    if not rivals:
        return None
    rival_max = max(teams[c]["w"] + teams[c]["remaining"] for c in rivals)
    if me["w"] + me["remaining"] <= rival_max - 1:
        return None  # 自力優勝の可能性なし
    m = rival_max - me["w"] + 1
    if m <= 0:
        return 0  # 優勝決定
    if m > me["remaining"]:
        return None  # まだ点灯しない
    return m


CHAMP_CAP = 99.9    # 優勝が決まるまでは 100.0 と表示しない
CHAMP_FLOOR = 0.1   # 数学的に消滅するまでは 0.0 と表示しない


def clinched(teams, code):
    """優勝が確定していれば True（magic_number の簡易計算に基づく）。"""
    return magic_number(teams, code) == 0


def eliminated(teams, code):
    """優勝の可能性が数学的に消えていれば True。

    「残り全勝しても、どこかのチームが残り全敗した勝率に届かない」という
    十分条件だけを見る簡易判定。直接対決の組み合わせまでは追わないので、
    ここで False でも実際には消滅していることがある。
    """
    me = teams[code]
    best = win_pct(me["w"] + me["remaining"], me["l"])
    for c, t in teams.items():
        if c == code:
            continue
        worst = win_pct(t["w"], t["l"] + t["remaining"])
        if best < worst:
            return True
    return False


def clamp_champ(value, teams, code, allow_100=False):
    """モンテカルロの結果を表示用に丸める。
    確定前の 100.0 は 99.9 に、消滅前の 0.0 は 0.1 に寄せる。
    """
    if value > CHAMP_CAP and not allow_100 and not clinched(teams, code):
        return CHAMP_CAP
    if value < CHAMP_FLOOR and not eliminated(teams, code):
        return CHAMP_FLOOR
    return value


def current_rank(teams, my_code):
    order = sorted(teams, key=lambda c: win_pct(teams[c]["w"], teams[c]["l"]), reverse=True)
    rank = order.index(my_code) + 1
    lead = teams[order[0]]
    me = teams[my_code]
    gb = ((lead["w"] - me["w"]) + (me["l"] - lead["l"])) / 2
    return rank, (0 if gb <= 0 else round(gb, 1))


# ---------------------------------------------------------------- 履歴

def load_history():
    if not os.path.exists(HISTORY_PATH):
        return []
    with open(HISTORY_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_history(history, today, results):
    history = [h for h in history if h["date"] != today]
    history.append({"date": today, "champ": {r["code"]: round(r["champ"], 2) for r in results}})
    history.sort(key=lambda h: h["date"])
    history = history[-400:]
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=1)
    return history


def md(date_str):
    """2026-09-12 -> 9/12"""
    y, m, d = date_str.split("-")
    return f"{int(m)}/{int(d)}"


# ---------------------------------------------------------------- 出力

def render_post(data, results, deltas, magic):
    my = data["my_team"]
    me = next(r for r in results if r["code"] == my)
    d = deltas.get(my)
    ds = "—" if d is None else ("±0.0" if abs(d) < 0.05 else f"{d:+.1f}")
    lines = [f"【{data['as_of']} 終了時点】", ""]
    lines.append(f"{me['name']}の優勝確率 {me['champ']:.1f}%（前日比 {ds}）")
    if magic:
        lines.append(f"マジック {magic}　残り{me['remaining']}試合")
    else:
        lines.append(f"残り{me['remaining']}試合")
    lines.append("")
    for r in results[:3]:
        lines.append(f"{r['name']} {r['champ']:.1f}%")
    return "\n".join(lines)


def main():
    data, teams, remaining = load_data()
    s = data["settings"]
    my = data["my_team"]
    trials = s["trials"]

    results = simulate(teams, remaining, s["draw_rate"], trials, s.get("seed"))
    for r in results:
        r["champ"] = clamp_champ(r["champ"], teams, r["code"])
    me = next(r for r in results if r["code"] == my)
    magic = magic_number(teams, my)
    rank, gb = current_rank(teams, my)

    today = data["as_of"]
    history = load_history()
    past = [h for h in history if h["date"] < today]
    prev = past[-1] if past else None
    deltas = {}
    if prev:
        for r in results:
            before = prev["champ"].get(r["code"])
            if before is not None:
                deltas[r["code"]] = r["champ"] - before

    scenarios = []
    for label, pace in SCENARIOS:
        sc = simulate(teams, remaining, s["draw_rate"], max(2000, trials // 2),
                      s.get("seed"), my_code=my, my_pace=pace)
        value = next(r["champ"] for r in sc if r["code"] == my)
        value = clamp_champ(value, teams, my, allow_100=(pace == 1.0))
        scenarios.append({"label": label, "value": round(value, 1)})

    history = save_history(history, today, results)
    chart = [{"date": md(h["date"]), "value": h["champ"].get(my)}
             for h in history[-30:] if h["champ"].get(my) is not None]

    now = datetime.now(JST)
    out = {
        "sample": False,
        "updated_at": now.isoformat(timespec="seconds"),
        "as_of": f"{int(today.split('-')[1])}月{int(today.split('-')[2])}日終了時点",
        "current": round(me["champ"], 1),
        "delta": round(deltas[my], 1) if my in deltas else None,
        "context": {
            "rank": rank,
            "games_behind": gb,
            "magic": magic,
            "remaining": me["remaining"],
            "record": f"{me['w']}勝{me['l']}敗{me['d']}分",
        },
        "method": (
            f"残り試合を{trials:,}回シミュレートして算出しています。各試合の勝敗は両チームの勝率から"
            f"log5で求めた確率で判定し、引き分けは{s['draw_rate'] * 100:.0f}%で発生させています。"
            "先発投手、対戦カード別の相性、本拠地かどうかは考慮していません。"
            "マジックナンバーは勝ち数ベースの目安です。"
            "優勝が決まるまでは99.9%を上限、数学的な可能性が残るあいだは0.1%を下限として表示します。"
        ),
        "history": chart,
        "scenarios": scenarios,
        "league": [{
            "name": r["name"],
            "record": f"{r['w']}勝{r['l']}敗{r['d']}分",
            "remaining": r["remaining"],
            "champ": round(r["champ"], 1),
            "delta": round(deltas[r["code"]], 1) if r["code"] in deltas else None,
            "me": r["code"] == my,
        } for r in results],
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CHAMP_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(POST_PATH, "w", encoding="utf-8") as f:
        f.write(render_post(data, results, deltas, magic))

    print(f"{today} / {trials:,} trials")
    for r in results:
        print(f"  {r['name']:<7} {r['champ']:6.2f}%  (平均順位 {r['avg_rank']:.2f})")
    print(f"  マジック: {magic}　順位: {rank}位　ゲーム差: {gb}")


if __name__ == "__main__":
    main()
