/* ========== 于氏珠宝 · 赛事管理 tournament.js ==========
   零依赖 · localStorage 持久化 · 5/7/8/11人制 · 单/双循环
   功能：多赛事管理 / 球员录入 / 5种分队策略 / 赛程生成(循环·双循环·淘汰·分组+淘汰)
        / 比分录入 / 积分榜·对阵图自动计算 / 打印 / CSV·JSON 导出 / 积分榜图片导出(发群)
*/
(function () {
  "use strict";

  var LS_KEY = "yushi_tournaments_v1";
  var COLORS = ["#f4c04a", "#4fa3ff", "#3ddc84", "#ff5f57", "#b48cff", "#ff9f43", "#2ee6c9", "#ff7eb6"];
  var POS = {
    GK: { label: "门将", cls: "pos-GK" },
    DF: { label: "后卫", cls: "pos-DF" },
    MF: { label: "中场", cls: "pos-MF" },
    FW: { label: "前锋", cls: "pos-FW" }
  };

  // 分队策略（每项单独成栏）
  var STRATS = [
    { k: "combined", name: "综合均衡", tag: "★ 推荐", desc: "按位置分桶 + 桶内年龄蛇形：位置均衡又老少混编" },
    { k: "position", name: "位置均衡", tag: "", desc: "门将/后卫/中场/前锋均匀分配，避免一队全前锋" },
    { k: "age", name: "年龄蛇形", tag: "", desc: "各队平均年龄接近，老少不分堆" },
    { k: "skill", name: "战力蛇形", tag: "", desc: "按能力值蛇形，各队总战力接近" },
    { k: "random", name: "纯随机", tag: "", desc: "随机均分，最快但最不保证平衡" }
  ];

  /* ---------- 状态 ---------- */
  var state = { tournaments: [], activeId: null };
  var dirty = false;

  function uid() { return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) state = JSON.parse(raw);
      if (!state.tournaments) state.tournaments = [];
    } catch (e) { state = { tournaments: [], activeId: null }; }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); dirty = false; }
    catch (e) { console.warn("保存失败", e); }
  }
  function getActive() {
    return state.tournaments.find(function (t) { return t.id === state.activeId; }) || null;
  }
  function findTeam(t, id) { return t.teams.find(function (x) { return x.id === id; }); }
  function findMatch(t, id) {
    var all = allMatches(t);
    return all.find(function (m) { return m.id === id; });
  }
  function allMatches(t) {
    var out = [];
    if (t.matches && t.matches.league) out = out.concat(t.matches.league);
    if (t.matches && t.matches.groups) { out = out.concat(t.matches.groups.A || []); out = out.concat(t.matches.groups.B || []); }
    if (t.matches && t.matches.ko) out = out.concat(t.matches.ko);
    return out;
  }

  /* ---------- 赛事 CRUD ---------- */
  function newTournament() {
    var t = {
      id: uid(), name: "友谊赛 " + new Date().toLocaleDateString("zh-CN"),
      format: "5", teamCount: 2,
      players: [], teams: [], mode: null, matches: { league: [], groups: null, ko: [] }
    };
    state.tournaments.unshift(t);
    state.activeId = t.id;
    save(); render();
  }
  function deleteTournament(id) {
    if (!confirm("确定删除该赛事？此操作不可恢复。")) return;
    state.tournaments = state.tournaments.filter(function (t) { return t.id !== id; });
    if (state.activeId === id) state.activeId = state.tournaments.length ? state.tournaments[0].id : null;
    save(); render();
  }

  /* ---------- 球员 ---------- */
  function addPlayer(t, p) {
    t.players.push({ id: uid(), name: p.name || "球员", pos: p.pos || "MF", age: p.age || "", skill: p.skill || 3 });
    save();
  }
  function updatePlayer(t, id, field, val) {
    var p = t.players.find(function (x) { return x.id === id; });
    if (p) { p[field] = val; save(); }
  }
  function removePlayer(t, id) {
    t.players = t.players.filter(function (x) { return x.id !== id; });
    // 从各队移除
    t.teams.forEach(function (tm) { tm.players = tm.players.filter(function (pid) { return pid !== id; }); });
    save();
  }
  function clearPlayers(t) { t.players = []; t.teams = []; t.mode = null; t.matches = { league: [], groups: null, ko: [] }; save(); }

  /* ---------- 分队策略 ---------- */
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function snakeIndex(k, n) { var r = Math.floor(k / n); var w = k % n; return r % 2 === 0 ? w : n - 1 - w; }

  function assignTeams(t, strategy, teamCount) {
    if (teamCount) t.teamCount = teamCount;
    var n = t.teamCount;
    var minPer = parseInt(t.format, 10); // 5 或 7
    if (t.players.length < n * Math.min(2, minPer)) {
      alert("人数不足：每队至少需要 " + Math.min(2, minPer) + " 人，当前 " + t.players.length + " 人 / " + n + " 队。");
      return false;
    }
    if (n < 2) { alert("队伍数至少为 2"); return false; }

    var teams = [];
    for (var i = 0; i < n; i++) teams.push({ id: uid(), name: "第" + (i + 1) + "队", color: COLORS[i % COLORS.length], players: [] });

    var players = t.players.slice();
    if (strategy === "random") {
      shuffle(players);
      players.forEach(function (p, k) { teams[k % n].players.push(p.id); });

    } else if (strategy === "age") {
      players.sort(function (a, b) { return (b.age || 0) - (a.age || 0); });
      players.forEach(function (p, k) { teams[snakeIndex(k, n)].players.push(p.id); });

    } else if (strategy === "skill") {
      players.sort(function (a, b) { return (b.skill || 3) - (a.skill || 3); });
      players.forEach(function (p, k) { teams[snakeIndex(k, n)].players.push(p.id); });

    } else if (strategy === "position") {
      var byPos = { GK: [], DF: [], MF: [], FW: [] };
      players.forEach(function (p) { byPos[p.pos || "MF"].push(p); });
      Object.keys(byPos).forEach(function (pos) {
        byPos[pos].sort(function (a, b) { return (b.skill || 3) - (a.skill || 3); });
        byPos[pos].forEach(function (p, k) { teams[k % n].players.push(p.id); });
      });

    } else { // combined：按位置分桶，桶内按年龄蛇形 → 位置均衡 + 年龄混合
      var buckets = ["GK", "DF", "MF", "FW"];
      buckets.forEach(function (pos) {
        var arr = players.filter(function (p) { return (p.pos || "MF") === pos; });
        arr.sort(function (a, b) { return (b.age || 0) - (a.age || 0); });
        arr.forEach(function (p, k) { teams[snakeIndex(k, n)].players.push(p.id); });
      });
    }

    t.teams = teams;
    // 分队后清空已有赛程
    t.mode = null;
    t.matches = { league: [], groups: null, ko: [] };
    save();
    return true;
  }

  /* ---------- 赛程生成 ---------- */
  function roundRobin(ids) {
    var arr = ids.slice();
    if (arr.length % 2 === 1) arr.push(null);
    var m = arr.length, rounds = m - 1, out = [];
    for (var r = 0; r < rounds; r++) {
      for (var i = 0; i < m / 2; i++) {
        var a = arr[i], b = arr[m - 1 - i];
        if (a != null && b != null) out.push({ id: uid(), stage: "league", round: r + 1, label: "第" + (r + 1) + "轮", a: a, b: b, scoreA: null, scoreB: null, played: false, winner: null, penaltyWinner: null });
      }
      arr.splice(1, 0, arr.pop());
    }
    return out;
  }

  function buildBracket(teamIds, stage, thirdPlace) {
    var n = teamIds.length, size = 1; while (size < n) size *= 2;
    var padded = teamIds.concat(new Array(size - n).fill(null));
    var rounds = [], all = [];
    var current = padded, roundIdx = 0;
    while (current.length > 1) {
      var rm = [];
      for (var i = 0; i < current.length; i += 2) {
        var a = current[i], b = current[i + 1];
        var m = { id: uid(), stage: stage, round: roundIdx, label: roundIdx === 0 ? "半决赛" : (roundIdx === 1 ? "决赛" : "R" + (roundIdx + 1)), a: a, b: b, scoreA: null, scoreB: null, played: false, winner: null, penaltyWinner: null, seed: roundIdx === 0, winnerNextId: null, winnerNextSlot: null, loserNextId: null, loserNextSlot: null };
        if (a === null && b !== null) { m.winner = b; m.played = true; }
        else if (b === null && a !== null) { m.winner = a; m.played = true; }
        else if (a === null && b === null) { m.played = true; }
        rm.push(m); all.push(m);
      }
      rounds.push(rm);
      current = rm.map(function (x) { return x.winner; });
      roundIdx++;
    }
    // 链接晋级
    for (var r = 0; r < rounds.length - 1; r++) {
      var cur = rounds[r], nxt = rounds[r + 1];
      for (var j = 0; j < cur.length; j++) {
        cur[j].winnerNextId = nxt[Math.floor(j / 2)].id;
        cur[j].winnerNextSlot = (j % 2 === 0) ? "a" : "b";
      }
    }
    // 三四名
    if (thirdPlace && rounds.length >= 2 && rounds[0].length >= 2) {
      var semis = rounds[0];
      var mT = { id: uid(), stage: stage, round: 1, label: "三四名", a: null, b: null, scoreA: null, scoreB: null, played: false, winner: null, penaltyWinner: null, seed: false, winnerNextId: null, winnerNextSlot: null, loserNextId: null, loserNextSlot: null };
      semis[0].loserNextId = mT.id; semis[0].loserNextSlot = "a";
      semis[1].loserNextId = mT.id; semis[1].loserNextSlot = "b";
      all.push(mT); rounds.push([mT]);
    }
    return all;
  }

  function generateMatches(t, mode) {
    if (!t.teams.length) { alert("请先分队"); return; }
    var teamIds = t.teams.map(function (x) { return x.id; });
    if (mode === "groupko" && teamIds.length < 4) { alert("分组+淘汰需要至少 4 支队伍"); return; }
    if (mode === "league") {
      var league = roundRobin(teamIds);
      if (t.doubleRR) league = league.concat(roundRobin(teamIds.slice().reverse()));
      t.matches = { league: league, groups: null, ko: [] };
    } else if (mode === "knockout") {
      t.matches = { league: [], groups: null, ko: buildBracket(teamIds, "ko", false) };
    } else if (mode === "groupko") {
      var half = Math.ceil(teamIds.length / 2);
      var gA = teamIds.slice(0, half), gB = teamIds.slice(half);
      t.matches = {
        league: [],
        groups: { A: roundRobin(gA), B: roundRobin(gB), gA: gA, gB: gB },
        ko: buildBracket([gA[0], gB[1] || gB[0], gB[0], gA[1] || gA[0]], "ko", true) // 半决赛: A1-B2, B1-A2
      };
    }
    t.mode = mode;
    save();
  }

  /* ---------- 计算 ---------- */
  function computeStandings(teamIds, matches) {
    var tbl = {};
    teamIds.forEach(function (id) { tbl[id] = { team: id, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 }; });
    matches.forEach(function (m) {
      if (!m.played || m.a == null || m.b == null) return;
      var sa = m.scoreA == null ? 0 : m.scoreA, sb = m.scoreB == null ? 0 : m.scoreB;
      tbl[m.a].P++; tbl[m.b].P++;
      tbl[m.a].GF += sa; tbl[m.a].GA += sb; tbl[m.b].GF += sb; tbl[m.b].GA += sa;
      if (sa > sb) { tbl[m.a].W++; tbl[m.b].L++; tbl[m.a].Pts += 3; }
      else if (sa < sb) { tbl[m.b].W++; tbl[m.a].L++; tbl[m.b].Pts += 3; }
      else { tbl[m.a].D++; tbl[m.b].D++; tbl[m.a].Pts += 1; tbl[m.b].Pts += 1; }
    });
    var arr = teamIds.map(function (id) { var x = tbl[id]; x.GD = x.GF - x.GA; return x; });
    arr.sort(function (x, y) { return (y.Pts - x.Pts) || (y.GD - x.GD) || (y.GF - x.GF) || (x.team < y.team ? -1 : 1); });
    return arr;
  }

  function decideKo(m) {
    if (m.a == null || m.b == null) { m.played = false; m.winner = null; return; }
    if (m.penaltyWinner) { m.winner = m.penaltyWinner; m.played = true; return; }
    var sa = m.scoreA == null ? null : m.scoreA, sb = m.scoreB == null ? null : m.scoreB;
    if (sa == null || sb == null) { m.played = false; m.winner = null; return; }
    if (sa > sb) m.winner = m.a; else if (sb > sa) m.winner = m.b; else m.winner = null; // 平局需点球
    m.played = true;
  }
  function recalcKo(t) {
    var ko = t.matches.ko || [];
    // 重置非种子槽（晋级结果由比分推导，不保留旧值）
    ko.forEach(function (m) { if (!m.seed) { m.a = null; m.b = null; m.winner = null; m.played = false; m.penaltyWinner = null; } });
    ko.slice().sort(function (a, b) { return a.round - b.round; }).forEach(function (m) {
      // 轮空场次：保留建赛时预设的胜者，仅做晋级传递
      if (m.a != null && m.b != null) decideKo(m);
      if (m.winner != null && m.winnerNextId) { var nm = findMatch(t, m.winnerNextId); if (nm) nm[m.winnerNextSlot] = m.winner; }
      if (m.played && m.loserNextId) {
        var loser = m.winner === m.a ? m.b : (m.winner === m.b ? m.a : null);
        if (loser != null) { var lm = findMatch(t, m.loserNextId); if (lm) lm[m.loserNextSlot] = loser; }
      }
    });
  }

  /* ================= 渲染 ================= */
  var listEl, mainEl;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function teamName(t, id) { var tm = findTeam(t, id); return tm ? tm.name : "—"; }
  function fmtLabel(f) { return f === "7" ? "7人制" : f === "8" ? "8人制" : f === "11" ? "11人制" : "5人制"; }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  function render() {
    var active = getActive();
    // 列表
    var html = '<div class="card"><div class="card-title">赛事列表 <button class="btn sm primary" onclick="TM.newTour()">+ 新建</button></div>';
    if (!state.tournaments.length) html += '<div class="empty-hint">还没有赛事，点「新建」开始</div>';
    else {
      html += '<div class="tour-list">';
      state.tournaments.forEach(function (t) {
        html += '<div class="tour-item ' + (t.id === state.activeId ? "active" : "") + '" onclick="TM.open(\'' + t.id + '\')">' +
          '<span class="t-del" onclick="event.stopPropagation();TM.del(\'' + t.id + '\')">删除</span>' +
          '<div class="t-name">' + esc(t.name) + '</div>' +
          '<div class="t-meta">' + (t.format === "7" ? "7人制" : "5人制") + ' · ' + t.teams.length + '队 · ' + t.players.length + '人 · ' + modeLabel(t.mode) + '</div>' +
          '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    listEl.innerHTML = html;

    if (!active) {
      mainEl.innerHTML = '<div class="card"><div class="empty-hint">请选择左侧赛事，或点击「新建赛事」。<br>本工具用于：录入参赛人员 → 按位置/年龄/战力自动分队 → 生成循环赛/淘汰赛赛程 → 录入每场比分 → 自动算积分榜与对阵图 → 保存/打印/导出。</div></div>';
      return;
    }
    renderEditor(active);
  }

  function modeLabel(m) { return m === "league" ? "单循环" : m === "knockout" ? "淘汰赛" : m === "groupko" ? "分组+淘汰" : "未排赛"; }

  function renderEditor(t) {
    var h = "";
    // 步骤1 基本信息
    var ready1 = t.teams.length > 0;
    h += '<div class="section"><div class="sec-head"><h2><span class="sec-no">1</span>赛事基本信息</h2></div>';
    h += '<div class="row">';
    h += '<div class="field"><label>赛事名称（随便填）</label><input id="f_name" value="' + esc(t.name) + '" onchange="TM.upd(\'name\',this.value)"></div>';
    h += '<div class="field" style="max-width:160px"><label>赛制</label><select id="f_fmt" onchange="TM.upd(\'format\',this.value)">' +
      '<option value="5"' + (t.format === "5" ? " selected" : "") + '>五人制</option>' +
      '<option value="7"' + (t.format === "7" ? " selected" : "") + '>七人制</option>' +
      '<option value="8"' + (t.format === "8" ? " selected" : "") + '>八人制</option>' +
      '<option value="11"' + (t.format === "11" ? " selected" : "") + '>十一人制</option></select></div>';
    h += '<div class="field" style="max-width:140px"><label>队伍数量</label><input id="f_tc" type="number" min="2" max="8" value="' + t.teamCount + '" onchange="TM.upd(\'teamCount\',parseInt(this.value)||2)"></div>';
    h += '</div>';
    h += '<div class="note">提示：赛制指「上场人数」（5 或 7 人）；每队实际人数可多于上场人数（含替补）。队伍数量决定分成几队。</div>';
    h += '</div>';

    // 步骤2 参赛人员
    h += '<div class="section" id="secPlayers"><div class="sec-head"><h2><span class="sec-no">2</span>参赛人员（' + t.players.length + '人）</h2>' +
      '<div class="btn-row no-print"><button class="btn sm" onclick="TM.sample()">载入示例名单</button>' +
      '<button class="btn sm red" onclick="TM.clearPlayers()">清空</button></div></div>';
    h += '<div class="player-add no-print">' +
      '<div class="field"><label>姓名</label><input id="p_name" placeholder="如：大鹏"></div>' +
      '<div class="field" style="max-width:110px"><label>位置</label><select id="p_pos">' + posOptions() + '</select></div>' +
      '<div class="field" style="max-width:90px"><label>年龄</label><input id="p_age" type="number" min="1" max="99" placeholder="选填"></div>' +
      '<div class="field" style="max-width:110px"><label>战力1-5</label><input id="p_skill" type="number" min="1" max="5" value="3"></div>' +
      '<button class="btn primary" onclick="TM.addPlayer()">+ 添加</button>' +
      '</div>';
    if (t.players.length) {
      h += '<table class="player-table"><thead><tr><th>姓名</th><th>位置</th><th>年龄</th><th>战力</th><th class="no-print"></th></tr></thead><tbody>';
      t.players.forEach(function (p) {
        h += '<tr><td><input value="' + esc(p.name) + '" onchange="TM.upPlayer(\'' + p.id + '\',\'name\',this.value)"></td>' +
          '<td><select onchange="TM.upPlayer(\'' + p.id + '\',\'pos\',this.value)">' + posOptions(p.pos) + '</select></td>' +
          '<td><input type="number" min="1" max="99" value="' + (p.age || "") + '" onchange="TM.upPlayer(\'' + p.id + '\',\'age\',parseInt(this.value)||\'\')"></td>' +
          '<td><input type="number" min="1" max="5" value="' + (p.skill || 3) + '" onchange="TM.upPlayer(\'' + p.id + '\',\'skill\',parseInt(this.value)||3)"></td>' +
          '<td class="no-print"><span class="m-del" onclick="TM.rmPlayer(\'' + p.id + '\')">✕</span></td></tr>';
      });
      h += '</tbody></table>';
    } else {
      h += '<div class="empty-hint">还没有参赛人员，手动添加或点「载入示例名单」。</div>';
    }
    h += '</div>';

    // 步骤3 分队
    var canAssign = t.players.length >= 2;
    h += '<div class="section ' + (canAssign ? "" : "step") + '" id="secAssign"><div class="sec-head"><h2><span class="sec-no">3</span>自动分队</h2></div>';
    h += '<div class="field" style="margin-bottom:6px"><label>分队策略（点下面任意一栏即可分队，★为默认推荐）</label></div>';
    h += '<div class="opt-cols">';
    STRATS.forEach(function (s) {
      var sel = t.lastStrategy === s.k ? " sel" : "";
      h += '<div class="opt-col' + sel + '" onclick="TM.assignWith(\'' + s.k + '\')">' +
        (s.tag ? '<div class="opt-tag">' + s.tag + '</div>' : '') +
        '<div class="opt-name">' + s.name + '</div>' +
        '<div class="opt-desc">' + s.desc + '</div></div>';
    });
    h += '</div>';
    h += '<div class="btn-row no-print" style="margin-top:10px">';
    if (t.teams.length) h += '<button class="btn" onclick="TM.renameTeams()">批量改名</button>';
    h += '</div>';
    if (t.teams.length) {
      h += '<div class="team-grid" style="margin-top:14px">';
      t.teams.forEach(function (tm) {
        h += '<div class="team-card" style="--tc:' + tm.color + '"><h3><span class="team-dot"></span>' +
          '<input value="' + esc(tm.name) + '" style="background:transparent;border:none;color:inherit;font-weight:700;font-size:15px;flex:1" onchange="TM.upTeam(\'' + tm.id + '\',\'name\',this.value)"></h3>';
        var avgAge = avgAgeOf(t, tm), str = tm.players.length + "人" + (avgAge ? " · 均龄" + avgAge : "");
        h += '<div class="t-stat">' + str + '</div><div class="team-members">';
        tm.players.forEach(function (pid) {
          var p = t.players.find(function (x) { return x.id === pid; });
          if (!p) return;
          h += '<div class="member"><span class="m-name">' + esc(p.name) + '</span>' +
            '<span class="m-meta">' + (POS[p.pos] ? POS[p.pos].label : "") + (p.age ? " " + p.age : "") + '</span>' +
            '<select onchange="TM.movePlayer(\'' + pid + '\',this.value)">' + teamOptions(t, tm.id) + '</select>' +
            '<span class="m-del" onclick="TM.unassign(\'' + pid + '\')">✕</span></div>';
        });
        h += '</div></div>';
      });
      h += '</div>';
    } else {
      h += '<div class="empty-hint">选好策略后点「一键自动分队」。</div>';
    }
    h += '</div>';

    // 步骤4 赛制
    var canSched = t.teams.length >= 2;
    h += '<div class="section ' + (canSched ? "" : "step") + '" id="secMode"><div class="sec-head"><h2><span class="sec-no">4</span>选择赛制并生成赛程</h2></div>';
    h += '<div class="field" style="margin-bottom:6px"><label>赛制（点下面任意一栏即可生成对应赛程）</label></div>';
    h += '<div class="opt-cols">';
    var MODES = [
      { k: "league", name: "单循环联赛", tag: "★ 推荐", desc: "每两队交手一次，自动算积分/净胜球/冠军，最公平" },
      { k: "knockout", name: "淘汰赛", tag: "", desc: "单场定胜负，败者出局，平局可点球决胜" },
      { k: "groupko", name: "分组+淘汰", tag: t.teams.length >= 4 ? "" : "需4队+", desc: "两组循环，各组前2进4强踢淘汰（含三四名）" }
    ];
    MODES.forEach(function (m) {
      var dis = m.k === "groupko" && t.teams.length < 4;
      var sel = t.mode === m.k ? " sel" : "";
      h += '<div class="opt-col' + sel + (dis ? " disabled" : "") + '"' + (dis ? "" : ' onclick="TM.gen(\'' + m.k + '\')"') + '>' +
        (m.tag ? '<div class="opt-tag">' + m.tag + '</div>' : '') +
        '<div class="opt-name">' + m.name + '</div>' +
        '<div class="opt-desc">' + m.desc + '</div></div>';
    });
    h += '</div>';
    h += '<div class="note">· <b>单循环</b>：每两队交手一次，自动算积分/净胜球/冠军，最公平适合友谊赛。<br>· <b>淘汰赛</b>：单场定胜负，败者出局，可处理轮空；平局需点球决胜。<br>· <b>分组+淘汰</b>：先分两组循环，各组前2进4强踢淘汰（含三四名）。</div>';
    h += '</div>';

    // 步骤5 比赛记录 + 结果
    if (t.mode) {
      h += '<div class="section" id="secMatches"><div class="sec-head"><h2><span class="sec-no">5</span>比赛记录与实时战报</h2>' +
        '<div class="btn-row no-print"><button class="btn sm" onclick="TM.printRes()">🖨 打印</button>' +
        '<button class="btn sm" onclick="TM.exportImage()">📸 积分榜图片</button>' +
        '<button class="btn sm" onclick="TM.exportCSV()">导出CSV</button>' +
        '<button class="btn sm" onclick="TM.exportJSON()">导出JSON</button>' +
        '<button class="btn sm" onclick="TM.importJSON()">导入JSON</button></div></div>';
      h += renderResults(t);
      h += '</div>';
    }

    mainEl.innerHTML = h;
  }

  function posOptions(sel) {
    return Object.keys(POS).map(function (k) {
      return '<option value="' + k + '"' + (k === sel ? " selected" : "") + '>' + POS[k].label + '</option>';
    }).join("");
  }
  function teamOptions(t, curId) {
    return t.teams.map(function (tm) {
      return '<option value="' + tm.id + '"' + (tm.id === curId ? " selected" : "") + '>' + esc(tm.name) + '</option>';
    }).join("");
  }
  function avgAgeOf(t, tm) {
    var ages = tm.players.map(function (id) { var p = t.players.find(function (x) { return x.id === id; }); return p && p.age ? p.age : 0; }).filter(Boolean);
    if (!ages.length) return null;
    return (ages.reduce(function (a, b) { return a + b; }, 0) / ages.length).toFixed(0);
  }

  function renderResults(t) {
    var h = "";
    if (t.mode === "league") {
      h += '<div class="note ok">单循环联赛 · 共 ' + t.matches.league.length + ' 场。录入比分后积分榜自动更新。</div>';
      h += standingsTable(t, t.teams.map(function (x) { return x.id; }), t.matches.league);
      h += '<h3 style="margin:14px 0 8px;color:var(--gold);font-size:14px">赛程与比分</h3>';
      h += matchList(t, t.matches.league, "league");
    } else if (t.mode === "groupko") {
      h += '<div class="note ok">分组+淘汰：A/B 两组循环，前2名进4强。</div>';
      h += '<h3 style="margin:6px 0 8px;color:var(--gold);font-size:14px">A组 积分榜</h3>';
      h += standingsTable(t, t.matches.groups.gA, t.matches.groups.A);
      h += '<h3 style="margin:14px 0 8px;color:var(--gold);font-size:14px">B组 积分榜</h3>';
      h += standingsTable(t, t.matches.groups.gB, t.matches.groups.B);
      h += '<h3 style="margin:14px 0 8px;color:var(--gold);font-size:14px">淘汰赛对阵</h3>';
      h += bracketView(t, t.matches.ko);
      h += matchList(t, t.matches.ko, "ko");
    } else if (t.mode === "knockout") {
      h += '<div class="note ok">淘汰赛 · 共 ' + t.matches.ko.length + ' 场。平局请点「点球」选定胜者。</div>';
      h += bracketView(t, t.matches.ko);
      h += matchList(t, t.matches.ko, "ko");
    }
    return h;
  }

  function standingsTable(t, teamIds, matches) {
    var rows = computeStandings(teamIds, matches);
    var h = '<table class="standings"><thead><tr><th class="l">排名</th><th class="l">球队</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>进</th><th>失</th><th>净</th><th>分</th></tr></thead><tbody>';
    rows.forEach(function (r, i) {
      h += '<tr><td class="rank">' + (i + 1) + '</td><td class="l">' + esc(teamName(t, r.team)) + (i === 0 ? ' <span class="promo">🏆冠军</span>' : "") + '</td>' +
        '<td>' + r.P + '</td><td>' + r.W + '</td><td>' + r.D + '</td><td>' + r.L + '</td><td>' + r.GF + '</td><td>' + r.GA + '</td><td>' + (r.GD > 0 ? "+" + r.GD : r.GD) + '</td><td class="pts">' + r.Pts + '</td></tr>';
    });
    h += '</tbody></table>';
    return h;
  }

  function matchList(t, matches, stage) {
    var h = '<div class="match-grid">';
    matches.forEach(function (m) {
      var winId = m.winner;
      if (winId == null && m.played && m.scoreA != null && m.scoreB != null) {
        if (m.scoreA > m.scoreB) winId = m.a; else if (m.scoreB > m.scoreA) winId = m.b;
      }
      var scored = m.played && m.scoreA != null && m.scoreB != null;
      var drawn = scored && m.scoreA === m.scoreB;
      var isDrawPending = stage === "ko" && scored && winId == null; // 淘汰赛平局需点球
      var statusCls = scored ? "played" : "pending";
      var statusTxt = winId != null ? "已决出" : (drawn ? (stage === "ko" ? "待点球" : "平局") : "未开赛");
      h += '<div class="match-row" data-mid="' + m.id + '">';
      h += '<div class="m-round">' + (m.label || "") + '</div>';
      h += '<div class="m-teams"><span class="m-team ' + (winId === m.a ? "m-winner" : (scored && winId === m.b ? "m-loser" : "")) + '">' + esc(teamName(t, m.a)) + '</span>' +
        '<span class="m-vs">VS</span>' +
        '<span class="m-team ' + (winId === m.b ? "m-winner" : (scored && winId === m.a ? "m-loser" : "")) + '">' + esc(teamName(t, m.b)) + '</span></div>';
      h += '<input class="score-input" type="number" min="0" value="' + (m.scoreA == null ? "" : m.scoreA) + '" onchange="TM.setScore(\'' + m.id + '\',\'A\',this.value)">';
      h += '<span class="m-vs">:</span>';
      h += '<input class="score-input" type="number" min="0" value="' + (m.scoreB == null ? "" : m.scoreB) + '" onchange="TM.setScore(\'' + m.id + '\',\'B\',this.value)">';
      if (isDrawPending) h += '<button class="btn sm red" onclick="TM.setPenalty(\'' + m.id + '\')">点球决胜</button>';
      h += '<span class="m-status ' + statusCls + '">' + statusTxt + '</span>';
      h += '</div>';
    });
    h += '</div>';
    return h;
  }

  function bracketView(t, ko) {
    recalcKo(t);
    // 按 round 分组
    var rounds = {};
    ko.forEach(function (m) { (rounds[m.round] = rounds[m.round] || []).push(m); });
    var keys = Object.keys(rounds).sort(function (a, b) { return a - b; });
    var h = '<div class="bracket">';
    keys.forEach(function (k) {
      h += '<div class="bracket-col"><div class="round-label">' + (rounds[k][0].label || ("R" + (parseInt(k) + 1))) + '</div>';
      rounds[k].forEach(function (m) {
        function side(id, slot) {
          var win = m.winner === id, lose = m.played && m.winner != null && m.winner !== id;
          var sc = id === m.a ? m.scoreA : (id === m.b ? m.scoreB : null);
          return '<div class="bm-team ' + (win ? "win" : lose ? "lose" : "") + '"><span>' + esc(teamName(t, id)) + '</span><span class="bm-score">' + (sc == null ? "-" : sc) + '</span></div>';
        }
        h += '<div class="bracket-match">' + side(m.a, "a") + side(m.b, "b") +
          (m.played && m.winner == null ? '<div style="font-size:10px;color:var(--red)">平局待点球</div>' : '') + '</div>';
      });
      h += '</div>';
    });
    h += '</div>';
    return h;
  }

  /* ================= 导出 / 导入 ================= */
  function exportCSV() {
    var t = getActive(); if (!t) return;
    var lines = [];
    lines.push("赛事," + t.name + ",赛制," + fmtLabel(t.format) + ",赛制模式," + modeLabel(t.mode) + (t.mode === "league" && t.doubleRR ? "(双循环)" : ""));
    lines.push("");
    lines.push("=== 参赛人员 ===");
    lines.push("姓名,位置,年龄,战力");
    t.players.forEach(function (p) { lines.push([p.name, POS[p.pos] ? POS[p.pos].label : "", p.age || "", p.skill || ""].join(",")); });
    lines.push("");
    lines.push("=== 队伍 ===");
    lines.push("队伍,人数,成员");
    t.teams.forEach(function (tm) {
      var names = tm.players.map(function (id) { var p = t.players.find(function (x) { return x.id === id; }); return p ? p.name : ""; }).join("/");
      lines.push([tm.name, tm.players.length, names].join(","));
    });
    if (t.mode === "league") {
      lines.push(""); lines.push("=== 积分榜 ===");
      lines.push("排名,球队,赛,胜,平,负,进,失,净,分");
      computeStandings(t.teams.map(function (x) { return x.id; }), t.matches.league).forEach(function (r, i) {
        lines.push([i + 1, teamName(t, r.team), r.P, r.W, r.D, r.L, r.GF, r.GA, r.GD, r.Pts].join(","));
      });
    }
    lines.push(""); lines.push("=== 比赛比分 ===");
    lines.push("阶段,轮次,主队,比分,客队,状态");
    allMatches(t).forEach(function (m) {
      var st = m.winner == null ? (m.played ? "平局待点球" : "未开赛") : "已决出";
      var sa = m.scoreA == null ? "" : m.scoreA, sb = m.scoreB == null ? "" : m.scoreB;
      lines.push([m.stage, m.label || "", teamName(t, m.a), sa + "-" + sb, teamName(t, m.b), st].join(","));
    });
    download(t.name + "_赛事数据.csv", "﻿" + lines.join("\n"), "text/csv;charset=utf-8");
  }
  function exportJSON() {
    var t = getActive(); if (!t) return;
    download(t.name + "_赛事数据.json", JSON.stringify(t, null, 2), "application/json");
  }
  function importJSON() {
    var input = document.createElement("input");
    input.type = "file"; input.accept = "application/json";
    input.onchange = function () {
      var f = input.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var obj = JSON.parse(rd.result);
          if (!obj.players || !obj.teams) throw new Error("格式不对");
          obj.id = uid(); obj.matches = obj.matches || { league: [], groups: null, ko: [] };
          state.tournaments.unshift(obj); state.activeId = obj.id; save(); render();
        } catch (e) { alert("导入失败：" + e.message); }
      };
      rd.readAsText(f);
    };
    input.click();
  }
  function download(name, content, type) {
    var blob = new Blob([content], { type: type });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------- 积分榜图片导出（发群）---------- */
  function exportImage() {
    var t = getActive(); if (!t || !t.mode) { alert("请先生成赛程（第4步）再导出图片"); return; }
    var blocks = [];
    if (t.mode === "league") {
      blocks.push({ title: fmtLabel(t.format) + " · 积分榜", rows: computeStandings(t.teams.map(function (x) { return x.id; }), t.matches.league) });
    } else if (t.mode === "groupko") {
      blocks.push({ title: "A组 积分榜", rows: computeStandings(t.matches.groups.gA, t.matches.groups.A) });
      blocks.push({ title: "B组 积分榜", rows: computeStandings(t.matches.groups.gB, t.matches.groups.B) });
    } else if (t.mode === "knockout") {
      recalcKo(t);
      var fin = t.matches.ko.filter(function (m) { return m.label === "决赛"; })[0] || t.matches.ko[t.matches.ko.length - 1];
      var champ = fin && fin.winner ? teamName(t, fin.winner) : "待决出";
      blocks.push({ title: "淘汰赛 · 冠军", champion: champ });
    }
    var url;
    try { url = drawStandingsImage(t, blocks); }
    catch (e) { alert("生成图片失败：" + e.message); return; }
    showImageModal(url, t.name + "_积分榜.png");
  }

  function drawStandingsImage(t, blocks) {
    var W = 750, pad = 36, rowH = 56, headH = 42, titleH = 104, blockGap = 26, dpr = 2;
    var H = titleH + pad;
    blocks.forEach(function (b) { H += headH + 16 + (b.rows ? b.rows.length * rowH : 76) + blockGap; });
    var c = document.createElement("canvas");
    c.width = W * dpr; c.height = H * dpr;
    var x = c.getContext("2d");
    x.scale(dpr, dpr);
    x.fillStyle = "#0e1525"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#f4c04a"; x.fillRect(0, 0, W, 6);
    x.textBaseline = "middle";
    x.fillStyle = "#f4c04a"; x.font = "bold 30px sans-serif";
    x.fillText(t.name, pad, titleH / 2 - 10);
    x.fillStyle = "#93a4c4"; x.font = "13px sans-serif";
    x.fillText(fmtLabel(t.format) + " · " + (t.doubleRR && t.mode === "league" ? "双循环" : "单循环") + " · " + todayStr(), pad, titleH / 2 + 14);
    var y = titleH;
    var cols = [
      { t: "排名", w: 56 }, { t: "球队", w: 300 }, { t: "赛", w: 42 }, { t: "胜", w: 42 },
      { t: "平", w: 42 }, { t: "负", w: 42 }, { t: "净", w: 54 }, { t: "分", w: 64 }
    ];
    blocks.forEach(function (b) {
      y += blockGap / 2;
      x.fillStyle = "#f4c04a"; x.font = "bold 18px sans-serif"; x.textAlign = "left";
      x.fillText(b.title, pad, y + headH / 2);
      y += headH;
      if (b.champion != null) {
        x.fillStyle = "#ffffff"; x.font = "bold 26px sans-serif";
        x.fillText("🏆 " + b.champion, pad, y + 38);
        y += 76;
      } else if (b.rows) {
        drawRow(x, pad, y, cols, null, true);
        y += rowH;
        b.rows.forEach(function (r, i) {
          var isChamp = i === 0;
          drawRow(x, pad, y, cols, [
            String(i + 1), teamName(t, r.team) + (isChamp ? " 🏆" : ""),
            String(r.P), String(r.W), String(r.D), String(r.L),
            (r.GD > 0 ? "+" : "") + r.GD, String(r.Pts)
          ], false, isChamp);
          y += rowH;
        });
        y += 16;
      }
    });
    x.fillStyle = "#5b6b8a"; x.font = "12px sans-serif"; x.textAlign = "left";
    x.fillText("于氏珠宝足球队 · 赛事管理（自动计算）", pad, H - 18);
    return c.toDataURL("image/png");
  }

  function drawRow(x, x0, y, cols, vals, isHead, isChamp) {
    var innerW = cols.reduce(function (a, c) { return a + c.w; }, 0);
    if (!isHead) {
      x.fillStyle = isChamp ? "rgba(244,192,74,0.12)" : "rgba(255,255,255,0.03)";
      x.fillRect(x0 - 8, y, innerW + 16, rowH);
    }
    var cx = x0;
    cols.forEach(function (col, i) {
      var label = isHead ? col.t : vals[i];
      var cw = col.w;
      x.textAlign = (i === 1) ? "left" : "center";
      var tx = (i === 1) ? cx + 10 : cx + cw / 2;
      if (isHead) { x.fillStyle = "#93a4c4"; x.font = "13px sans-serif"; }
      else {
        x.fillStyle = (i === 7) ? "#f4c04a" : (i === 1 ? "#ffffff" : "#cdd8ef");
        x.font = ((i === 1) || (i === 7)) ? "bold 15px sans-serif" : "14px sans-serif";
      }
      x.fillText(String(label), tx, y + rowH / 2);
      cx += cw;
    });
    x.textAlign = "left";
  }

  function showImageModal(url, fname) {
    var mask = document.getElementById("yushiImgMask");
    if (!mask) {
      mask = document.createElement("div");
      mask.id = "yushiImgMask"; mask.className = "modal-mask";
      mask.innerHTML =
        '<div class="modal-box" style="width:min(440px,94vw);text-align:center">' +
        '<div class="modal-head"><h3>积分榜图片</h3><button class="modal-close" onclick="TM.closeImg()">×</button></div>' +
        '<img id="yushiImgPreview" style="width:100%;border-radius:12px;display:block;margin:6px 0;background:#0e1525">' +
        '<p class="tip-inline">手机端：长按图片 → 保存 / 转发到微信群。电脑端：点「下载图片」。</p>' +
        '<div class="btn-row" style="justify-content:center;margin-top:10px">' +
        '<a id="yushiImgDl" class="btn primary" download>下载图片</a>' +
        '<button class="btn" onclick="TM.closeImg()">关闭</button></div></div>';
      document.body.appendChild(mask);
      mask.addEventListener("click", function (e) { if (e.target === mask) TM.closeImg(); });
    }
    document.getElementById("yushiImgPreview").src = url;
    var dl = document.getElementById("yushiImgDl");
    dl.href = url; dl.download = fname;
    mask.style.display = "flex";
  }

  /* ================= 对外接口 ================= */
  window.TM = {
    newTour: newTournament,
    open: function (id) { state.activeId = id; save(); render(); },
    del: deleteTournament,
    upd: function (field, val) { var t = getActive(); if (!t) return; t[field] = val; save(); render(); },
    addPlayer: function () {
      var t = getActive(); if (!t) return;
      var name = document.getElementById("p_name").value.trim();
      if (!name) { alert("请输入姓名"); return; }
      addPlayer(t, { name: name, pos: document.getElementById("p_pos").value, age: parseInt(document.getElementById("p_age").value) || "", skill: parseInt(document.getElementById("p_skill").value) || 3 });
      render();
    },
    upPlayer: function (id, field, val) { var t = getActive(); if (t) { updatePlayer(t, id, field, val); render(); } },
    rmPlayer: function (id) { var t = getActive(); if (t) { removePlayer(t, id); render(); } },
    clearPlayers: function () { var t = getActive(); if (t) { clearPlayers(t); render(); } },
    sample: function () {
      var t = getActive(); if (!t) return;
      var demo = [["大鹏", "GK", 39, 4], ["阿强", "DF", 28, 3], ["老李", "DF", 41, 3], ["小赵", "DF", 22, 4], ["王哥", "MF", 35, 4], ["阿杰", "MF", 26, 3], ["辉辉", "MF", 31, 4], ["胖子", "MF", 33, 2], ["飞哥", "FW", 29, 5], ["阿龙", "FW", 24, 4], ["小宇", "FW", 19, 3], ["大壮", "FW", 37, 3]];
      demo.forEach(function (d) { addPlayer(t, { name: d[0], pos: d[1], age: d[2], skill: d[3] }); });
      render();
    },
    assignWith: function (strat) {
      var t = getActive(); if (!t) return;
      var allowed = ["combined", "position", "age", "skill", "random"];
      if (allowed.indexOf(strat) < 0) strat = t.lastStrategy || "combined";
      if (t.matches && (t.matches.league.length || (t.matches.ko && t.matches.ko.length) || (t.matches.groups))) {
        if (!confirm("重新分队会清空已生成的赛程与比分，确定继续？")) return;
      }
      if (assignTeams(t, strat)) { t.lastStrategy = strat; save(); render(); }
    },
    upTeam: function (id, field, val) { var t = getActive(); if (t) { var tm = findTeam(t, id); if (tm) { tm[field] = val; save(); } } },
    movePlayer: function (pid, toTeamId) {
      var t = getActive(); if (!t) return;
      t.teams.forEach(function (tm) { tm.players = tm.players.filter(function (x) { return x !== pid; }); });
      var tm = findTeam(t, toTeamId); if (tm) tm.players.push(pid);
      save(); render();
    },
    unassign: function (pid) {
      var t = getActive(); if (!t) return;
      t.teams.forEach(function (tm) { tm.players = tm.players.filter(function (x) { return x !== pid; }); });
      save(); render();
    },
    renameTeams: function () {
      var t = getActive(); if (!t) return;
      var base = prompt("统一前缀（如：猛虎、烈焰）：", "队");
      if (base === null) return;
      t.teams.forEach(function (tm, i) { tm.name = base + (i + 1); });
      save(); render();
    },
    gen: function (mode) {
      var t = getActive(); if (!t) return;
      if (t.teams.length < 2) { alert("请先分队"); return; }
      var hasPlayed = allMatches(t).some(function (m) { return m.played; });
      if (hasPlayed && !confirm("重新生成赛程会清空已录入的比分，确定继续？")) return;
      generateMatches(t, mode); render();
    },
    setScore: function (mid, side, val) {
      var t = getActive(); if (!t) return;
      var m = findMatch(t, mid); if (!m) return;
      var v = val === "" ? null : parseInt(val);
      if (side === "A") m.scoreA = v; else m.scoreB = v;
      if (m.scoreA != null && m.scoreB != null) m.played = true; else m.played = false;
      if (!(m.scoreA != null && m.scoreB != null && m.scoreA === m.scoreB)) m.penaltyWinner = null;
      if (t.mode === "knockout" || t.mode === "groupko") recalcKo(t); // 先结算晋级再存档
      save(); render();
    },
    setPenalty: function (mid) {
      var t = getActive(); if (!t) return;
      var m = findMatch(t, mid); if (!m) return;
      var opts = [m.a, m.b].map(function (id) { return teamName(t, id); });
      var pick = prompt("点球决胜，胜者是谁？\n1. " + opts[0] + "\n2. " + opts[1], "1");
      if (pick === "1") m.penaltyWinner = m.a; else if (pick === "2") m.penaltyWinner = m.b; else return;
      m.played = true;
      if (t.mode === "knockout" || t.mode === "groupko") recalcKo(t);
      save(); render();
    },
    printRes: function () { window.print(); },
    exportImage: exportImage,
    closeImg: function () { var m = document.getElementById("yushiImgMask"); if (m) m.style.display = "none"; },
    exportCSV: exportCSV,
    exportJSON: exportJSON,
    importJSON: importJSON
  };

  /* ================= 启动 ================= */
  function init() {
    listEl = document.getElementById("tourList");
    mainEl = document.getElementById("mainPanel");
    load();
    if (!state.tournaments.length) {
      // 首次使用给一个空的，方便直接上手
      newTournament();
    } else {
      if (!state.activeId) state.activeId = state.tournaments[0].id;
      render();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
