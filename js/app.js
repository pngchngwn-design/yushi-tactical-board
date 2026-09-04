/* =====================================================
   于氏珠宝足球队专用战术板 · 交互逻辑
   拖拽排兵 / 阵型切换 / 随机微调 / 导出图片 / 打印 / 本地保存
   ===================================================== */
(function () {
  "use strict";

  var LS_KEY = "yushi_board_v1";
  var ROSTER_KEY = "yushi_roster_v2";
  var state = {
    format: "eight",
    roster: [],
    formationId: null,
    // slots: [{x,y,role}], slotsPos 覆盖拖动后的坐标
    slotPos: [],
    assignment: {},   // slotIndex -> playerId
    marks: [],         // 对方红标 [{x,y,label}]
    intel: { name: "", key: "", tactic: "", plan: "" },
  };

  var $ = function (sel) { return document.querySelector(sel); };
  var pitch = $("#pitch"), slotsBox = $("#slots"), marksBox = $("#marks"),
      poolBox = $("#pool"), listBox = $("#formationList"), detailBox = $("#formationDetail");

  function getFormations() { return FORMATIONS[state.format]; }
  function currentFormation() {
    var list = getFormations();
    for (var i = 0; i < list.length; i++) if (list[i].id === state.formationId) return list[i];
    return null;
  }
  function playerById(id) {
    for (var i = 0; i < state.roster.length; i++) if (state.roster[i].id === id) return state.roster[i];
    return null;
  }
  function imgSrc(p) {
    if (p.img) return p.img;
    if (window.PLAYER_IMAGES && PLAYER_IMAGES[p.id]) return PLAYER_IMAGES[p.id];
    return fallbackAvatar(p);
  }
  function fallbackAvatar(p) {
    var txt = p ? (p.num || p.name || "?") : "?";
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" rx="60" fill="#22314f"/><text x="60" y="72" font-size="40" fill="#93a4c4" text-anchor="middle" font-family="sans-serif" font-weight="bold">' + txt + "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function defaultRoster() {
    return PLAYERS.map(function (p) { return { id: p.id, name: p.name, num: p.num, img: null }; });
  }
  function loadRoster() {
    try {
      var raw = localStorage.getItem(ROSTER_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) return arr;
      }
    } catch (e) {}
    return defaultRoster();
  }
  function saveRoster() {
    try { localStorage.setItem(ROSTER_KEY, JSON.stringify(state.roster)); }
    catch (e) { alert("保存失败：浏览器存储已满，请删除部分队员照片后重试"); }
  }

  /* ---------------- 持久化 ---------------- */
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        format: state.format, formationId: state.formationId,
        slotPos: state.slotPos, assignment: state.assignment,
        marks: state.marks, intel: state.intel,
      }));
    } catch (e) { /* 隐私模式下忽略 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d || !d.format) return false;
      state.format = FORMATS[d.format] ? d.format : "eight";
      state.intel = d.intel || state.intel;
      var list = getFormations();
      var ok = list.some(function (f) { return f.id === d.formationId; });
      state.formationId = ok ? d.formationId : (list[0] && list[0].id);
      state.slotPos = Array.isArray(d.slotPos) ? d.slotPos : [];
      state.assignment = d.assignment || {};
      state.marks = Array.isArray(d.marks) ? d.marks : [];
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- 队员池 ---------------- */
  function renderPool() {
    poolBox.innerHTML = "";
    state.roster.forEach(function (p) {
      var onPitch = Object.keys(state.assignment).some(function (k) {
        return state.assignment[k] === p.id;
      });
      var el = document.createElement("div");
      el.className = "pool-item" + (onPitch ? " on-pitch" : "");
      el.dataset.pid = p.id;
      el.innerHTML =
        '<img src="' + imgSrc(p) + '" alt="" draggable="false">' +
        '<span class="pool-num">' + p.num + "</span>" +
        '<span class="pool-name">' + p.name + "</span>";
      if (!onPitch) attachPoolDrag(el, p);
      poolBox.appendChild(el);
    });
  }

  /* ---------------- 位置槽 ---------------- */
  function renderSlots() {
    var f = currentFormation();
    slotsBox.innerHTML = "";
    if (!f) return;
    f.slots.forEach(function (s, i) {
      var pos = state.slotPos[i] || { x: s.x, y: s.y };
      var el = document.createElement("div");
      el.className = "slot";
      el.style.left = pos.x + "%";
      el.style.top = (pos.y / 140) * 100 + "%";
      el.dataset.idx = i;
      var pid = state.assignment[i];
      if (pid !== undefined && !playerById(pid)) {
        delete state.assignment[i];
        pid = undefined;
      }
      if (pid !== undefined) {
        var p = playerById(pid);
        if (p) {
          el.classList.add("occupied");
          el.innerHTML =
            '<img src="' + imgSrc(p) + '" alt="" draggable="false">' +
            '<span class="slot-num">' + p.num + "</span>" +
            '<span class="slot-tag">' + p.name + "·" + s.role + "</span>";
          attachSlotDrag(el, i);
        }
      } else {
        el.innerHTML = '<span class="slot-role">' + s.role + "</span>";
      }
      slotsBox.appendChild(el);
    });
  }

  function renderMarks() {
    marksBox.innerHTML = "";
    state.marks.forEach(function (m, i) {
      var el = document.createElement("div");
      el.className = "opp";
      el.style.left = m.x + "%";
      el.style.top = (m.y / 140) * 100 + "%";
      el.textContent = m.label || "?";
      el.title = "对方队员(双击删除)";
      attachMarkDrag(el, i);
      marksBox.appendChild(el);
    });
  }

  function renderAll() { renderPool(); renderSlots(); renderMarks(); save(); }

  /* ---------------- 阵型列表 & 详情 ---------------- */
  function renderFormationList() {
    listBox.innerHTML = "";
    var list = getFormations();
    $("#formationCount").textContent = FORMATS[state.format].label + " · " + list.length + " 套";
    list.forEach(function (f) {
      var el = document.createElement("button");
      el.className = "f-chip" + (f.trend ? " trend" : "") + (f.id === state.formationId ? " active" : "");
      el.textContent = f.name;
      el.onclick = function () { selectFormation(f.id); };
      listBox.appendChild(el);
    });
  }

  function renderDetail() {
    var f = currentFormation();
    if (!f) { detailBox.innerHTML = '<p class="empty">点击上方阵型查看详解</p>'; return; }
    var h = "";
    h += '<div class="fd-name">' + f.name + '<span class="fd-cat">' + f.cat + "</span></div>";
    h += "<p>" + f.desc + "</p>";
    h += '<div class="fd-section pros"><h3>优点</h3><ul>';
    f.pros.forEach(function (x) { h += "<li>" + x + "</li>"; });
    h += "</ul></div>";
    h += '<div class="fd-section cons"><h3>缺点</h3><ul>';
    f.cons.forEach(function (x) { h += "<li>" + x + "</li>"; });
    h += "</ul></div>";
    h += '<div class="fd-section"><h3>适合什么样的球队</h3><p class="fd-fit">' + f.fit + "</p></div>";
    h += '<div class="fd-section"><h3>五大联赛代表</h3><div class="fd-clubs">';
    f.clubs.forEach(function (c) { h += "<span>" + c + "</span>"; });
    h += "</div></div>";
    h += '<div class="fd-section"><h3>如何破解 / 应对</h3><p>' + f.counter + "</p></div>";
    detailBox.innerHTML = h;
  }

  function selectFormation(id) {
    state.formationId = id;
    state.slotPos = [];
    renderFormationList(); renderSlots(); renderDetail(); save();
  }

  /* ---------------- 拖拽体系 ---------------- */
  var ghost = null;

  function makeGhost(src) {
    removeGhost();
    ghost = document.createElement("img");
    ghost.className = "ghost";
    ghost.src = src;
    document.body.appendChild(ghost);
  }
  function removeGhost() { if (ghost) { ghost.remove(); ghost = null; } }
  function moveGhost(e) {
    if (ghost) { ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px"; }
  }
  function pitchPoint(e) {
    var r = pitch.getBoundingClientRect();
    var x = ((e.clientX - r.left) / r.width) * 100;
    var y = ((e.clientY - r.top) / r.height) * 140;
    return { x: Math.max(3, Math.min(97, x)), y: Math.max(3, Math.min(137, y)) };
  }
  function nearestSlotIndex(pt) {
    var f = currentFormation(); if (!f) return -1;
    var best = -1, bd = 1e9;
    f.slots.forEach(function (s, i) {
      var pos = state.slotPos[i] || { x: s.x, y: s.y };
      var dx = pos.x - pt.x, dy = (pos.y - pt.y) * (100 / 140) * 1.4;
      var d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function placePlayer(pid, idx) {
    // 若该队员已在其他槽，先移除
    Object.keys(state.assignment).forEach(function (k) {
      if (state.assignment[k] === pid) delete state.assignment[k];
    });
    state.assignment[idx] = pid;
    renderAll();
  }

  function attachPoolDrag(el, p) {
    el.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      makeGhost(imgSrc(p));
      moveGhost(e);
      function up(ev) {
        removeGhost();
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        var pt = pitchPoint(ev);
        if (pt.x > -5 && pt.x < 105) {
          var idx = nearestSlotIndex(pt);
          if (idx >= 0 && state.assignment[idx] === undefined) placePlayer(p.id, idx);
        }
      }
      function move(ev) { moveGhost(ev); }
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }

  function attachSlotDrag(el, idx) {
    var startX, startY, orig, moved;
    el.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      var f = currentFormation();
      var pos = state.slotPos[idx] || { x: f.slots[idx].x, y: f.slots[idx].y };
      orig = pos; startX = e.clientX; startY = e.clientY; moved = false;
      function move(ev) {
        var r = pitch.getBoundingClientRect();
        var dx = ((ev.clientX - startX) / r.width) * 100;
        var dy = ((ev.clientY - startY) / r.height) * 140;
        if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
        if (!moved) return;
        var nx = Math.max(3, Math.min(97, orig.x + dx));
        var ny = Math.max(3, Math.min(137, orig.y + dy));
        el.style.left = nx + "%";
        el.style.top = (ny / 140) * 100 + "%";
        state.slotPos[idx] = { x: nx, y: ny };
      }
      function up(ev) {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (moved) { save(); }
        else {
          // 点按不拖动 -> 尝试交换/查看; 双击撤下由 dblclick 处理
        }
      }
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
    el.addEventListener("dblclick", function () {
      delete state.assignment[idx];
      delete state.slotPos[idx];
      renderAll();
    });
  }

  function attachMarkDrag(el, i) {
    var startX, startY, orig, moved;
    el.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      orig = { x: state.marks[i].x, y: state.marks[i].y };
      startX = e.clientX; startY = e.clientY; moved = false;
      function move(ev) {
        var r = pitch.getBoundingClientRect();
        var dx = ((ev.clientX - startX) / r.width) * 100;
        var dy = ((ev.clientY - startY) / r.height) * 140;
        if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
        if (!moved) return;
        state.marks[i].x = Math.max(3, Math.min(97, orig.x + dx));
        state.marks[i].y = Math.max(3, Math.min(137, orig.y + dy));
        el.style.left = state.marks[i].x + "%";
        el.style.top = (state.marks[i].y / 140) * 100 + "%";
      }
      function up() {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (moved) save();
      }
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
    el.addEventListener("dblclick", function () {
      state.marks.splice(i, 1);
      renderMarks(); save();
    });
  }

  /* ---------------- 工具按钮 ---------------- */
  // 随机微调：在当前阵型坐标上随机扰动（保留结构感：幅度受控）
  $("#btnJitter").onclick = function () {
    var f = currentFormation(); if (!f) return;
    state.slotPos = [];
    f.slots.forEach(function (s, i) {
      var jx = (Math.random() - 0.5) * 9;
      var jy = (Math.random() - 0.5) * 8;
      if (s.role === "门将") { jx *= 0.3; jy = 0; }
      state.slotPos[i] = {
        x: Math.max(3, Math.min(97, s.x + jx)),
        y: Math.max(3, Math.min(137, s.y + jy)),
      };
    });
    renderSlots(); save();
  };

  $("#btnMark").onclick = function () {
    var label = prompt("对方队员标记(号码/名字，如：10号)", "10号");
    if (label === null) return;
    state.marks.push({ x: 50, y: 60, label: label || "?" });
    renderMarks(); save();
  };

  $("#btnReset").onclick = function () {
    state.slotPos = [];
    state.marks.forEach(function (m) { m.x = 50; m.y = 60; });
    renderSlots(); renderMarks(); save();
  };

  $("#btnClear").onclick = function () {
    if (!confirm("清空场上全部队员与对方标记？")) return;
    state.assignment = {}; state.slotPos = []; state.marks = [];
    renderAll();
  };

  $("#btnPrint").onclick = function () { window.print(); };

  /* ---------------- 导出图片 ---------------- */
  $("#btnExport").onclick = function () {
    var W = 900, H = 1260, PW = 660, PH = PW * 1.4;
    var px = (W - PW) / 2, py = 96;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var g = c.getContext("2d");

    // 背景
    g.fillStyle = "#0b1220"; g.fillRect(0, 0, W, H);
    // 标题
    g.fillStyle = "#f4c04a"; g.font = "bold 34px 'Microsoft YaHei',sans-serif";
    g.textAlign = "center";
    g.fillText("于氏珠宝足球队 · 赛前布阵图", W / 2, 52);
    var f = currentFormation();
    g.fillStyle = "#93a4c4"; g.font = "16px 'Microsoft YaHei',sans-serif";
    var sub = FORMATS[state.format].label + " · " + (f ? f.name + " (" + f.cat + ")" : "");
    if (state.intel.name) sub += " · 对手：" + state.intel.name;
    g.fillText(sub, W / 2, 80);

    // 球场
    for (var i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? "#0c5d2d" : "#0e6b34";
      g.fillRect(px, py + (PH / 14) * i, PW, PH / 14 + 1);
    }
    g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 2;
    g.strokeRect(px + 6, py + 6, PW - 12, PH - 12);
    g.beginPath(); g.moveTo(px + 6, py + PH / 2); g.lineTo(px + PW - 6, py + PH / 2); g.stroke();
    g.beginPath(); g.arc(W / 2, py + PH / 2, 50, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(W / 2, py + PH / 2, 4, 0, Math.PI * 2); g.fillStyle = "rgba(255,255,255,.55)"; g.fill();
    g.strokeRect(px + PW * 0.25, py + 6, PW * 0.5, 66);
    g.strokeRect(px + PW * 0.38, py + 6, PW * 0.24, 26);
    g.strokeRect(px + PW * 0.25, py + PH - 72, PW * 0.5, 66);
    g.strokeRect(px + PW * 0.38, py + PH - 32, PW * 0.24, 26);
    g.fillStyle = "rgba(255,255,255,.45)"; g.font = "13px 'Microsoft YaHei',sans-serif";
    g.fillText("对 方 球 门", W / 2, py + 24);

    // 对方红标
    state.marks.forEach(function (m) {
      var mx = px + (m.x / 100) * PW, my = py + (m.y / 140) * PH;
      g.beginPath(); g.arc(mx, my, 17, 0, Math.PI * 2);
      g.fillStyle = "#ff5f57"; g.fill();
      g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
      g.fillStyle = "#fff"; g.font = "bold 12px 'Microsoft YaHei',sans-serif";
      g.fillText(m.label, mx, my + 4);
    });

    // 队员
    var need = Object.keys(state.assignment).length;
    var loaded = 0, done = false;
    var imgs = {};
    Object.keys(state.assignment).forEach(function (k) {
      var p = playerById(state.assignment[k]);
      if (!p) { need--; return; }
      var im = new Image();
      im.onload = im.onerror = function () { loaded++; if (!done && loaded >= need) draw(); };
      im.src = imgSrc(p);
      imgs[k] = im;
    });
    if (need === 0) draw();

    function draw() {
      done = true;
      if (f) f.slots.forEach(function (s, i) {
        var pid = state.assignment[i]; if (pid === undefined) return;
        var p = playerById(pid); if (!p) return;
        var pos = state.slotPos[i] || { x: s.x, y: s.y };
        var cx = px + (pos.x / 100) * PW, cy = py + (pos.y / 140) * PH, R = 24;
        g.save();
        g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
        var im = imgs[i];
        if (im && im.width) g.drawImage(im, cx - R, cy - R, R * 2, R * 2);
        else { g.fillStyle = "#22314f"; g.fillRect(cx - R, cy - R, R * 2, R * 2); }
        g.restore();
        g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
        g.strokeStyle = "#f4c04a"; g.lineWidth = 3; g.stroke();
        // 号码徽章
        var bw = g.measureText("" + p.num).width + 14;
        g.fillStyle = "#f4c04a";
        roundRect(g, cx + R - 6, cy + R - 14, bw, 18, 5); g.fill();
        g.fillStyle = "#1a1a1a"; g.font = "bold 12px 'Microsoft YaHei',sans-serif";
        g.textAlign = "center"; g.fillText(p.num, cx + R - 6 + bw / 2, cy + R - 1);
        // 名字+位置
        g.fillStyle = "#fff"; g.font = "bold 14px 'Microsoft YaHei',sans-serif";
        g.strokeStyle = "rgba(0,0,0,.8)"; g.lineWidth = 3;
        var tag = p.name + "·" + s.role;
        g.strokeText(tag, cx, cy + R + 16);
        g.fillText(tag, cx, cy + R + 16);
      });

      // 对手情报区
      var iy = py + PH + 28;
      g.textAlign = "left"; g.fillStyle = "#f4c04a";
      g.font = "bold 18px 'Microsoft YaHei',sans-serif";
      g.fillText("对手情报与盯防安排", 40, iy);
      g.fillStyle = "#e8eefb"; g.font = "15px 'Microsoft YaHei',sans-serif";
      var lines = [];
      if (state.intel.name) lines.push("对手：" + state.intel.name);
      if (state.intel.key) lines.push("对方核心：" + state.intel.key);
      if (state.intel.tactic) lines.push("对方战术：" + state.intel.tactic);
      if (state.intel.plan) lines.push("我方对策：" + state.intel.plan);
      if (!lines.length) lines.push("（未填写对手情报）");
      lines.forEach(function (ln, n) {
        wrapText(g, ln, 40, iy + 30 + n * 26, W - 80, 26);
      });
      g.fillStyle = "#93a4c4"; g.font = "12px 'Microsoft YaHei',sans-serif";
      g.fillText("于氏珠宝足球队专用战术板 · " + new Date().toLocaleDateString(), 40, H - 18);

      // 下载
      var a = document.createElement("a");
      a.download = "于氏珠宝布阵图_" + (f ? f.name : "") + ".png";
      a.href = c.toDataURL("image/png");
      a.click();
    }
  };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function wrapText(g, text, x, y, maxW, lh) {
    var line = "", n = 0;
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y + n * lh); line = text[i]; n++; }
      else line = test;
    }
    g.fillText(line, x, y + n * lh);
  }

  /* ---------------- 对手情报 ---------------- */
  ["intelName", "intelKey", "intelTactic", "intelPlan"].forEach(function (id) {
    var el = document.getElementById(id);
    var key = id.replace("intel", "").toLowerCase();
    el.value = state.intel[key] || "";
    el.addEventListener("input", function () {
      state.intel[key] = el.value;
      save();
    });
  });

  /* ---------------- 赛制切换 ---------------- */
  document.querySelectorAll("#formatSwitch button").forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll("#formatSwitch button").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      state.format = b.dataset.fmt;
      state.formationId = getFormations()[0].id;
      state.slotPos = [];
      renderFormationList(); renderSlots(); renderDetail(); save();
    };
  });

  /* ---------------- 队员管理（任何比赛可上传名字/号码/照片） ---------------- */
  var modal = document.createElement("div");
  modal.className = "modal-mask";
  modal.id = "rosterModal";
  modal.innerHTML =
    '<div class="modal-box">' +
    '<div class="modal-head"><h3>队员管理</h3><button class="modal-close" title="关闭">×</button></div>' +
    '<p class="modal-tip">适用于任何比赛：新增队员、改名字改号码、换照片、删除。所有修改保存在当前设备浏览器里，下次打开还在。</p>' +
    '<div class="roster-add">' +
    '<label class="photo-add" id="addPhotoBtn">＋照片<input type="file" id="addPhotoInput" accept="image/*" hidden></label>' +
    '<input id="addName" placeholder="姓名" maxlength="8">' +
    '<input id="addNum" placeholder="号码" maxlength="3" inputmode="numeric">' +
    '<button class="tool-btn primary" id="btnAddPlayer">加入名单</button>' +
    '</div>' +
    '<div class="roster-actions"><button class="tool-btn" id="btnResetRoster">恢复默认16人名单</button></div>' +
    '<div class="roster-rows" id="rosterRows"></div>' +
    "</div>";
  document.body.appendChild(modal);
  var addPhotoPreview = null;

  function resizePhotoFile(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var side = Math.min(im.width, im.height);
        var left = (im.width - side) / 2;
        var top = Math.max(0, (im.height - side) * 0.15);
        var c = document.createElement("canvas");
        c.width = c.height = 256;
        var g = c.getContext("2d");
        g.drawImage(im, left, top, side, side, 0, 0, 256, 256);
        cb(c.toDataURL("image/jpeg", 0.85));
      };
      im.onerror = function () { alert("图片读取失败，请换一张试试"); };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function renderRosterRows() {
    var box = modal.querySelector("#rosterRows");
    box.innerHTML = "";
    state.roster.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "roster-row";
      row.innerHTML =
        '<img class="r-photo" src="' + imgSrc(p) + '" alt="">' +
        '<input class="r-num" value="' + p.num + '" maxlength="3" inputmode="numeric" placeholder="号">' +
        '<input class="r-name" value="' + p.name + '" maxlength="8" placeholder="姓名">' +
        '<button class="r-replace" title="更换照片">换照</button>' +
        '<button class="r-del" title="删除队员">删</button>';
      row.querySelector(".r-num").addEventListener("change", function () {
        p.num = this.value.trim() || "0";
        saveRoster(); refreshAfterRosterChange();
      });
      row.querySelector(".r-name").addEventListener("change", function () {
        p.name = this.value.trim() || "未命名";
        saveRoster(); refreshAfterRosterChange();
      });
      row.querySelector(".r-del").addEventListener("click", function () {
        if (!confirm("删除 " + p.name + "？（若他已在场上也会一同撤下）")) return;
        state.roster = state.roster.filter(function (x) { return x.id !== p.id; });
        saveRoster(); refreshAfterRosterChange(); renderRosterRows();
      });
      row.querySelector(".r-replace").addEventListener("click", function () {
        var fi = document.createElement("input");
        fi.type = "file";
        fi.accept = "image/*";
        fi.onchange = function () {
          if (fi.files && fi.files[0]) resizePhotoFile(fi.files[0], function (data) {
            p.img = data;
            saveRoster(); refreshAfterRosterChange(); renderRosterRows();
          });
        };
        fi.click();
      });
      box.appendChild(row);
    });
  }

  function refreshAfterRosterChange() {
    renderPool(); renderSlots(); save();
  }

  modal.querySelector("#addPhotoInput").addEventListener("change", function () {
    if (this.files && this.files[0]) {
      resizePhotoFile(this.files[0], function (data) {
        addPhotoPreview = data;
        modal.querySelector("#addPhotoBtn").style.backgroundImage = "url(" + data + ")";
        modal.querySelector("#addPhotoBtn").textContent = "";
      });
    }
  });

  modal.querySelector("#btnAddPlayer").addEventListener("click", function () {
    var name = modal.querySelector("#addName").value.trim();
    var num = modal.querySelector("#addNum").value.trim();
    if (!name) { alert("请填写姓名"); return; }
    if (!num) num = "0";
    var maxId = 100;
    state.roster.forEach(function (p) { if (p.id > maxId) maxId = p.id; });
    state.roster.push({ id: maxId + 1, name: name, num: num, img: addPhotoPreview });
    saveRoster();
    addPhotoPreview = null;
    modal.querySelector("#addName").value = "";
    modal.querySelector("#addNum").value = "";
    var apb = modal.querySelector("#addPhotoBtn");
    apb.style.backgroundImage = "";
    apb.textContent = "＋照片";
    refreshAfterRosterChange();
    renderRosterRows();
  });

  modal.querySelector("#btnResetRoster").addEventListener("click", function () {
    if (!confirm("恢复默认16人名单？当前新增/修改的队员和照片将被清除。")) return;
    state.roster = defaultRoster();
    saveRoster();
    state.assignment = {}; state.slotPos = [];
    refreshAfterRosterChange();
    renderRosterRows();
  });

  modal.querySelector(".modal-close").addEventListener("click", function () {
    modal.style.display = "none";
  });
  modal.addEventListener("click", function (e) {
    if (e.target === modal) modal.style.display = "none";
  });

  var rosterBtn = document.createElement("button");
  rosterBtn.textContent = "队员管理";
  rosterBtn.className = "tool-btn";
  rosterBtn.onclick = function () {
    renderRosterRows();
    modal.style.display = "flex";
  };
  document.querySelector(".toolbar").appendChild(rosterBtn);

  /* ---------------- 决赛提示弹层 ---------------- */
  var tip = document.createElement("div");
  tip.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:50;background:#131f36;border:1px solid #22314f;border-radius:12px;padding:12px 14px;max-width:330px;box-shadow:0 10px 30px rgba(0,0,0,.5);display:none";
  tip.innerHTML = '<div style="color:#f4c04a;font-weight:700;margin-bottom:8px;font-size:14px">' + FINAL_TIPS.title + "</div>" +
    '<ul style="list-style:none;font-size:12px;line-height:1.9;color:#e8eefb;max-height:38vh;overflow:auto" id="tipList"></ul>' +
    '<button id="tipClose" style="margin-top:8px;background:none;border:1px solid #22314f;color:#93a4c4;border-radius:7px;padding:4px 12px;font-size:12px;cursor:pointer">收起</button>';
  document.body.appendChild(tip);
  var tl = tip.querySelector("#tipList");
  FINAL_TIPS.items.forEach(function (it) {
    var li = document.createElement("li");
    li.innerHTML = '<span style="color:#3ddc84">●</span> ' + it;
    tl.appendChild(li);
  });
  var tipBtn = document.createElement("button");
  tipBtn.textContent = "决赛锦囊";
  tipBtn.className = "tool-btn";
  tipBtn.onclick = function () { tip.style.display = tip.style.display === "none" ? "block" : "none"; };
  document.querySelector(".toolbar").appendChild(tipBtn);
  tip.querySelector("#tipClose").onclick = function () { tip.style.display = "none"; };

  /* ---------------- 启动 ---------------- */
  state.roster = loadRoster();
  if (!load()) {
    state.formationId = getFormations()[0].id;
  }
  // 校正赛制按钮激活态
  document.querySelectorAll("#formatSwitch button").forEach(function (b) {
    b.classList.toggle("active", b.dataset.fmt === state.format);
  });
  renderFormationList(); renderSlots(); renderDetail(); renderPool(); renderMarks();
})();
