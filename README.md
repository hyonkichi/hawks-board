# タカボード

福岡ソフトバンクホークスの数字を毎日まとめて見るための、静的サイト（非公式ファンサイト）。
GitHub Pages で公開し、GitHub Actions が毎朝 `data/*.json` を作り直す。

## 構成

```
index.html              ダッシュボード本体（優勝確率／ブルペン／昇格候補／好不調／読みもの／要望）
about.html              サイトについて・データの出典・著作権と商標・免責・プライバシー・受付
assets/style.css        スタイル（配色は :root にまとめてある）
assets/app.js           JSON を読んで描画。取得に失敗しても本文は壊れない
input/standings.json    ★毎日ここだけ手で書き換える（勝敗数と残り対戦カード）
data/*.json             画面が読むデータ。スクリプトが生成するので直接は触らない
data/post.txt           X にそのまま貼れるテキスト（自動生成）
data/history.json       日次の優勝確率。前日比とグラフの元。消さないこと
scripts/simulate.py     優勝確率シミュレーター（標準ライブラリのみ）
scripts/build_data.py   ブルペン・ファーム・好不調の生成（中身はこれから実装）
.github/workflows/update-data.yml  毎朝 7:00(JST) に実行してコミット
```

## 公開する

1. GitHub に **public** リポジトリを作ってこの一式を push する
   （private だと Actions の無料実行時間に上限があります）
2. Settings → Pages → Source を **Deploy from a branch** / `main` / **`/ (root)`**
3. Settings → Actions → General → Workflow permissions を **Read and write permissions** に変更
4. Actions タブから `update-data` を手動実行して動作確認

公開URLは `https://<ユーザー名>.github.io/<リポジトリ名>/` です。

## 毎日やること

`input/standings.json` の3か所を書き換えて push するだけ。

- `as_of` を当日の日付に
- `teams` の `w` / `l` / `d` を最新の順位表の値に
- `remaining` の該当カードを消化した分だけ減らす

push すると Actions が走り、`data/championship.json`・`data/history.json`・`data/post.txt` が更新されます。
手元で試すときは `python3 scripts/simulate.py`。

サイトの表示確認は `python3 -m http.server` を立ててから `http://localhost:8000/` を開きます
（`file://` だと `data/*.json` を読めません）。

## 優勝確率の計算

- 残り試合を1試合ずつ判定し、それを `trials` 回繰り返す（初期値5万回）
- 勝敗確率は両チームの勝率から log5 で算出
- 引き分けは `draw_rate` の確率で発生（勝率計算には影響しない）
- 順位は勝率（引き分けを除く）で決定。同率首位は均等に分配
- 「残り全勝／7割／5割／3割ペース」は、自チームの残り試合の勝率をその値に固定して回した結果

考慮していないもの：先発投手、対戦相性、本拠地かどうか、故障者。
マジックナンバーは勝ち数ベースの簡易計算で、実際のNPBは勝率で順位を決めるため目安です。

## 公開前に直す場所

`index.html` と `about.html` の中の、次のダミーURLを実物に置き換える。

| 場所 | いまの値 | 入れるもの |
|---|---|---|
| フォーム（要望受付） | `https://forms.gle/` | Googleフォームの共有URL |
| GitHub | `https://github.com/` | リポジトリのURL |
| X | `https://x.com/` | 自分のアカウント |
| note | `https://note.com/` | note のプロフィールURL |
| canonical / og:url | `https://example.github.io/hawks-board/` | 実際の公開URL |

サイト名「タカボード」も仮。球団の商標や公式サイトと紛らわしい名前は避けること。

## data の形

`sample` が `true` のあいだは画面上部に「サンプルです」の帯が出ます。実データを入れたら `false`。
`updated_at`（ISO8601）と `as_of`（「9月12日終了時点」）は各セクションの右上に出ます。

### championship.json（simulate.py が生成）
`current` / `delta` / `history[{date,value}]` / `context{rank,games_behind,magic,remaining,record}` /
`scenarios[{label,value}]` / `league[{name,record,remaining,champ,delta,me}]` / `method`。

### bullpen.json
`game_note`、`pitchers[]`。投手ごとに `name` / `role` / `status`（`ready` `caution` `rest`）/
`pitches_3d` / `consecutive` / `days_rest` / `note`、`recent[]` は直近7日の `{date, pitches}`。
25球以上の日は棒が赤くなる。

### farm.json
`candidates[]` を上から順に表示（順位は自動採番）。
`name` / `position` / `score` / `farm_line` / `reason` / `opening`。

### form.json
`batters[]` と `pitchers[]`。`name` / `metric` / `recent` / `season` /
`diff_ratio`（-1〜1。プラスで右に伸びる）/ `note`。

### reads.json
`articles[]` に `{title, url, date}`。空なら「まだありません」と出る。

## 次に足せるもの

- ブルペン・ファーム・好不調のデータ取得（いまは `build_data.py` が雛形のみ）
- OGP画像の自動生成（X で伸ばすならこれが一番効く）
- 順位別確率（優勝／CS進出／Bクラス）
- 対戦カード別勝率での補正（サンプル数が少ないので要注意）

## 決めてあること

- 選手の顔写真、球団ロゴ、実況テキストは載せない。載せるのは公開成績から計算した数値と自分の文章だけ。
- 記事は note に書き、サイトからはリンクする（`data/reads.json` に手で追加）。サイト内にブログ機能は作らない。
- データを自動取得に進める場合は、取得先の利用規約と robots.txt を確認し、アクセスは1日1回に抑える。
  公開するのは自分で算出した数値だけにして、取得した生データはそのまま転載・再配布しない。
