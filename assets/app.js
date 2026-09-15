/* タカボード — data/*.json を読んで描画する。データが無い場合は空の状態を出す。 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var num = function (v, d) { return (typeof v === "number" && isFinite(v)) ? v.toFixed(d == null ? 1 : d) : "--"; };

  function fetchJSON(name) {
    return fetch("data/" + name + ".json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }

  function stamp(key, data) {
    var el = document.querySelector('[data-updated="' + key + '"]');
    if (!el) return;
    var t = data && data.updated_at ? new Date(data.updated_at) : null;
    var when = t && !isNaN(t)
      ? (t.getMonth() + 1) + "月" + t.getDate() + "日 " +
        String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0")
      : "不明";
    el.textContent = (data && data.as_of ? data.as_of + "／" : "") + when + " 更新";
  }

  function sampleFlag(data) {
    if (data && data.sample) { var b = $("sample-banner"); if (b) b.hidden = false; }
  }

  function fail(el, msg) {
    if (!el) return;
    el.innerHTML = '<p class="empty">' + esc(msg) + "</p>";
  }

  /* ---------- 今日の要点 ---------- */
  function renderToday(store) {
    var pen = store.bullpen, form = store.form, ch = store.championship;

    $("today-game").textContent = (pen && pen.game_note) || "次戦の予定は未設定です";

    if (ch) {
      $("pennant-value").textContent = num(ch.current, 1);
      var dl = $("pennant-delta");
      if (typeof ch.delta === "number") {
        var sign = ch.delta > 0 ? "+" : ch.delta < 0 ? "−" : "±";
        dl.textContent = "前日比 " + sign + Math.abs(ch.delta).toFixed(1) + "ポイント";
        dl.className = "delta " + (ch.delta > 0 ? "up" : ch.delta < 0 ? "down" : "");
      } else {
        dl.textContent = "前日比 —（履歴が1日分しかありません）";
      }
    } else {
      $("pennant-delta").textContent = "データを読み込めませんでした";
    }

    if (pen && (pen.pitchers || []).length) {
      var list = pen.pitchers;
      var ok = list.filter(function (p) { return p.status !== "rest"; }).length;
      var rest = list.length - ok;
      $("today-pen").textContent = ok + "人";
      $("today-pen-sub").textContent = list.length + "人中。要休養 " + rest + "人";
    } else {
      $("today-pen").textContent = "--";
      $("today-pen-sub").textContent = "登板データなし";
    }

    if (form) {
      var all = (form.batters || []).concat(form.pitchers || []);
      var hot = all.filter(function (p) { return (p.diff_ratio || 0) > 0; })
        .sort(function (a, b) { return (b.diff_ratio || 0) - (a.diff_ratio || 0) }).slice(0, 2);
      var el = $("today-hot");
      el.className = "side-val names";
      el.textContent = hot.length ? hot.map(function (p) { return p.name; }).join("・") : "該当なし";
      $("today-hot-sub").textContent = hot.length ? "直近10試合がシーズン平均を上回っています" : "上向きの選手がいません";
    } else {
      $("today-hot").textContent = "--";
      $("today-hot-sub").textContent = "成績データなし";
    }
  }

  /* ---------- 優勝確率 ---------- */
  function renderPennant(d) {
    sampleFlag(d); stamp("pennant", d);

    var c = d.context || {};
    var rows = [
      ["順位", c.rank != null ? c.rank + "位" : "--"],
      ["ゲーム差", c.games_behind != null ? (c.games_behind === 0 ? "首位" : c.games_behind) : "--"],
      ["マジック", c.magic != null ? c.magic : "点灯前"],
      ["残り試合", c.remaining != null ? c.remaining : "--"],
      ["戦績", c.record || "--"]
    ];
    $("pennant-context").innerHTML = rows.map(function (r) {
      return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>";
    }).join("");

    $("pennant-method").textContent = d.method || "";
    drawChart(d.history || []);

    renderLeague(d.league || []);

    $("pennant-scenarios").innerHTML = (d.scenarios || []).map(function (s) {
      var w = Math.max(0, Math.min(100, s.value || 0));
      return '<li><span class="sc-label">' + esc(s.label) + "</span>" +
        '<span class="sc-bar"><i style="width:' + w + '%"></i></span>' +
        '<span class="sc-val">' + num(s.value, 1) + "</span></li>";
    }).join("");
  }

  function renderLeague(list) {
    var box = document.querySelector("#league-table tbody");
    if (!box) return;
    if (!list.length) { box.innerHTML = '<tr><td colspan="5" class="empty">順位データがありません。</td></tr>'; return; }
    var top = Math.max.apply(null, list.map(function (t) { return t.champ || 0; }).concat([1]));
    box.innerHTML = list.map(function (t) {
      var w = Math.max(0, (t.champ || 0) / top * 100);
      var ds = "—", dc = "";
      if (typeof t.delta === "number") {
        if (Math.abs(t.delta) < 0.05) { ds = "±0.0"; }
        else { ds = (t.delta > 0 ? "+" : "−") + Math.abs(t.delta).toFixed(1); dc = t.delta > 0 ? "up" : "down"; }
      }
      return "<tr" + (t.me ? ' class="me"' : "") + ">" +
        '<td class="lg-team">' + esc(t.name) + "</td>" +
        '<td class="lg-rec">' + esc(t.record || "") + "</td>" +
        '<td class="lg-bar"><span><i style="width:' + w.toFixed(1) + '%"></i></span></td>' +
        '<td class="lg-pct">' + num(t.champ, 1) + "</td>" +
        '<td class="lg-delta ' + dc + '">' + ds + "</td></tr>";
    }).join("");
  }

  function drawChart(hist) {
    var box = $("pennant-chart");
    if (!hist.length) { fail(box, "推移データがまだありません。"); return; }
    var W = 320, H = 96, P = 6;
    var vals = hist.map(function (h) { return h.value; });
    var min = Math.max(0, Math.min.apply(null, vals) - 6);
    var max = Math.min(100, Math.max.apply(null, vals) + 6);
    var x = function (i) { return P + i * (W - P * 2) / Math.max(1, hist.length - 1); };
    var y = function (v) { return H - P - (v - min) / Math.max(0.001, max - min) * (H - P * 2); };
    var line = hist.map(function (h, i) {
      return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(h.value).toFixed(1);
    }).join(" ");
    var area = line + " L" + x(hist.length - 1).toFixed(1) + " " + (H - P) + " L" + P + " " + (H - P) + " Z";
    var last = hist[hist.length - 1], first = hist[0];
    box.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<line x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '" stroke="#DCE3EA" stroke-width="1"/>' +
      '<path d="' + area + '" fill="#FFC629" fill-opacity=".22"/>' +
      '<path d="' + line + '" fill="none" stroke="#96670A" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + x(hist.length - 1).toFixed(1) + '" cy="' + y(last.value).toFixed(1) + '" r="3" fill="#96670A"/>' +
      "</svg>" +
      '<p class="chart-note">' + esc(first.date) + "（" + num(first.value, 1) + "％）から " +
      esc(last.date) + "（" + num(last.value, 1) + "％）まで</p>";
  }

  /* ---------- ブルペン ---------- */
  var STATE = { ready: "余力あり", caution: "やや疲労", rest: "要休養" };

  function renderBullpen(d) {
    sampleFlag(d); stamp("bullpen", d);
    $("bullpen-note").textContent = d.game_note || "";
    var list = d.pitchers || [];
    if (!list.length) { fail($("bullpen-list"), "登板データがまだありません。"); return; }

    var cap = Math.max(30, Math.max.apply(null, list.map(function (p) {
      return Math.max.apply(null, (p.recent || []).map(function (g) { return g.pitches || 0; }).concat([0]));
    })));

    $("bullpen-list").innerHTML = list.map(function (p) {
      var bars = (p.recent || []).map(function (g) {
        var h = Math.round((g.pitches || 0) / cap * 100);
        var heavy = (g.pitches || 0) >= 25 ? ' data-heavy="1"' : "";
        return "<i" + heavy + ' title="' + esc(g.date) + "：" + (g.pitches || 0) + '球"><b style="height:' + h + '%"></b></i>';
      }).join("");
      return '<div class="pen-row">' +
        '<div class="pen-id"><b>' + esc(p.name) + "</b><span>" + esc(p.role || "") + "</span></div>" +
        '<div class="pen-state"><i class="dot ' + esc(p.status || "ready") + '"></i>' + esc(STATE[p.status] || "") + "</div>" +
        '<div class="pen-bars">' + bars + "</div>" +
        '<div class="pen-meta">' +
        "<span>直近3日 <em>" + (p.pitches_3d != null ? p.pitches_3d : "--") + "</em> 球</span>" +
        "<span>連投 <em>" + (p.consecutive != null ? p.consecutive : "--") + "</em> 日</span>" +
        "<span>中 <em>" + (p.days_rest != null ? p.days_rest : "--") + "</em> 日</span>" +
        (p.note ? "<span>" + esc(p.note) + "</span>" : "") +
        "</div></div>";
    }).join("");
  }

  /* ---------- ファーム昇格予想 ---------- */
  function renderFarm(d) {
    sampleFlag(d); stamp("farm", d);
    var list = d.candidates || [];
    if (!list.length) { fail($("farm-list"), "候補がまだありません。"); return; }
    $("farm-list").innerHTML = list.map(function (c) {
      return "<li>" +
        '<div class="farm-name"><b>' + esc(c.name) + "</b><span>" + esc(c.position || "") + "</span>" +
        (c.score != null ? "<span>指数 " + esc(c.score) + "</span>" : "") + "</div>" +
        '<div class="farm-body">' +
        '<p class="farm-stat">' + esc(c.farm_line || "") + "</p>" +
        (c.reason ? '<p class="farm-why">' + esc(c.reason) + "</p>" : "") +
        (c.opening ? '<p class="farm-open">一軍の空き：' + esc(c.opening) + "</p>" : "") +
        "</div></li>";
    }).join("");
  }

  /* ---------- 好不調 ---------- */
  function renderForm(d) {
    sampleFlag(d); stamp("form", d);
    fill($("form-batters"), d.batters || []);
    fill($("form-pitchers"), d.pitchers || []);

    function fill(box, list) {
      if (!list.length) { fail(box, "対象選手がまだいません。"); return; }
      var maxAbs = Math.max.apply(null, list.map(function (p) { return Math.abs(p.diff_ratio || 0); }).concat([1]));
      box.innerHTML = list.map(function (p) {
        var r = (p.diff_ratio || 0) / maxAbs;
        var w = Math.abs(r) * 50;
        var style = r >= 0 ? "left:50%;width:" + w + "%" : "right:50%;width:" + w + "%";
        var cls = r >= 0 ? "up" : "down";
        return '<div class="form-row">' +
          '<div class="form-top"><b>' + esc(p.name) + "</b>" +
          '<span class="form-num ' + cls + '">' + esc(p.recent) + "</span></div>" +
          '<div class="gauge"><i class="' + (cls === "down" ? "down" : "") + '" style="' + style + '"></i></div>' +
          '<p class="form-sub">' + esc(p.metric || "") + "：直近 " + esc(p.recent) + "／シーズン " + esc(p.season) +
          (p.note ? "　" + esc(p.note) : "") + "</p>" +
          "</div>";
      }).join("");
    }
  }

  /* ---------- 読みもの ---------- */
  function renderReads(d) {
    var box = $("reads-list");
    var list = (d && d.articles) || [];
    if (!list.length) { fail(box, "記事はまだありません。note に書きしだいここに並びます。"); return; }
    box.innerHTML = list.map(function (a) {
      return '<li><a href="' + esc(a.url) + '" rel="noopener">' + esc(a.title) + "</a>" +
        (a.date ? "<time>" + esc(a.date) + "</time>" : "") + "</li>";
    }).join("");
  }

  /* ---------- タブ・ナビ ---------- */
  function tabs() {
    var b = $("tab-batters"), p = $("tab-pitchers");
    if (!b || !p) return;
    function pick(on, off, panelOn, panelOff) {
      on.classList.add("is-on"); off.classList.remove("is-on");
      on.setAttribute("aria-selected", "true"); off.setAttribute("aria-selected", "false");
      $(panelOn).hidden = false; $(panelOff).hidden = true;
    }
    b.addEventListener("click", function () { pick(b, p, "panel-batters", "panel-pitchers"); });
    p.addEventListener("click", function () { pick(p, b, "panel-pitchers", "panel-batters"); });
  }

  function spy() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".nav a"));
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var a = map[e.target.id];
        if (a && e.isIntersecting) {
          links.forEach(function (l) { l.classList.remove("is-on"); });
          a.classList.add("is-on");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(map).forEach(function (id) { var s = $(id); if (s) io.observe(s); });
  }

  /* ---------- 起動 ---------- */
  function boot() {
    $("year").textContent = new Date().getFullYear();
    tabs();
    if ("IntersectionObserver" in window) spy();

    var names = ["championship", "bullpen", "farm", "form", "reads"];
    var render = {
      championship: renderPennant, bullpen: renderBullpen,
      farm: renderFarm, form: renderForm, reads: renderReads
    };
    var onFail = {
      championship: function () { fail($("pennant-chart"), "優勝確率のデータを読み込めませんでした。時間をおいて開き直してください。"); },
      bullpen: function () { fail($("bullpen-list"), "ブルペンのデータを読み込めませんでした。"); },
      farm: function () { fail($("farm-list"), "昇格候補のデータを読み込めませんでした。"); },
      form: function () { fail($("form-batters"), "好不調のデータを読み込めませんでした。"); },
      reads: function () { fail($("reads-list"), "記事はまだありません。"); }
    };

    var store = {};
    Promise.all(names.map(function (n) {
      return fetchJSON(n).then(function (d) {
        store[n] = d;
        try { render[n](d); } catch (e) { onFail[n](); }
      }).catch(onFail[n]);
    })).then(function () { renderToday(store); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
