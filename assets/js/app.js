/* ==========================================================================
   澎π计划AI训练营 · 运营进度看板 — 数据层与共享运行时 app.js
   依赖：assets/js/data.js (window.KANBAN_DATA)
   暴露：window.K
   ========================================================================== */
(function () {
  'use strict';

  const D = window.KANBAN_DATA || {};

  const K = window.K = { data: D };

  /* ---------- 基础工具 ---------- */
  K.escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  K.fmt = {};
  K.fmt.date = (s) => { if (!s) return '—'; const m = s.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}/${+m[2]}/${+m[3]}` : s; };
  K.fmt.datetime = (s) => s ? s.replace(/-/g, '/').replace('T', ' ') : '—';
  K.pct = (n) => `${Math.round(n)}%`;

  /* ---------- 数据访问 ---------- */
  K.teams = () => D.teams || [];
  K.team = (id) => (D.teams || []).find(t => t.id === id);
  K.teamName = (id) => { const t = K.team(id); return t ? t.name : '—'; };
  K.members = (teamId) => teamId ? (D.members || []).filter(m => m.teamId === teamId) : (D.members || []);
  K.member = (id) => (D.members || []).find(m => m.id === id);
  K.memberName = (id) => { const m = K.member(id); return m ? m.name : '—'; };
  K.memberIdentity = (id) => { const m = K.member(id); return m ? m.identity : ''; };
  K.objectives = (teamId) => teamId ? (D.objectives || []).filter(o => o.teamId === teamId) : (D.objectives || []);
  K.krs = (teamId) => teamId ? (D.keyResults || []).filter(k => k.teamId === teamId) : (D.keyResults || []);
  K.krsOfObj = (objId) => (D.keyResults || []).filter(k => k.objectiveId === objId);
  K.reports = (teamId) => teamId ? (D.biweeklyReports || []).filter(r => r.teamId === teamId) : (D.biweeklyReports || []);
  K.checkins = (teamId) => teamId ? (D.checkins || []).filter(c => c.teamId === teamId) : (D.checkins || []);

  // 队伍 OKR 平均进度
  K.teamProgress = (teamId) => {
    const krs = K.krs(teamId);
    if (!krs.length) return 0;
    return Math.round(krs.reduce((a, k) => a + k.progress, 0) / krs.length);
  };
  // 队伍最新双周报
  K.latestReport = (teamId) => {
    const rs = K.reports(teamId);
    return rs.length ? rs[rs.length - 1] : null;
  };
  // 队伍打卡次数
  K.checkinCount = (teamId) => K.checkins(teamId).length;

  // 身份参与统计（全员或单队）
  K.identityStats = (teamId) => {
    const idTypes = ['成员', '志愿者', '内部导师', '外部导师'];
    const members = teamId ? K.members(teamId) : (D.members || []);
    const checkins = teamId ? K.checkins(teamId) : (D.checkins || []);
    // 每队打卡场次数
    const checkinRounds = {};
    checkins.forEach(c => {
      checkinRounds[c.teamId] = (checkinRounds[c.teamId] || 0) + 1;
    });
    const avgRounds = Object.keys(checkinRounds).length
      ? Math.round(Object.values(checkinRounds).reduce((a, b) => a + b, 0) / Object.keys(checkinRounds).length)
      : 0;
    return idTypes.map(t => {
      const ms = members.filter(m => m.identity === t);
      const ids = new Set(ms.map(m => m.id));
      const names = new Set(ms.map(m => m.name));
      let participation = 0;
      checkins.forEach(c => {
        participation += (c.teamParticipantIds || []).filter(id => ids.has(id)).length;
        participation += (c.volunteerParticipantIds || []).filter(id => ids.has(id)).length;
        // 其他参与人为文本姓名，按成员名册归入对应身份统计
        participation += (c.extraParticipants || []).filter(n => names.has(n)).length;
      });
      const expected = ms.length * avgRounds;
      return { identity: t, count: ms.length, participation, expected };
    });
  };

  /* ---------- 权限（全部开放，实际权限在飞书侧控制） ---------- */
  K.can = () => true;
  K.canManage = () => true;
  K.canEdit = () => true;

  /* ---------- 图标 ---------- */
  const icons = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    brief: '<path d="M12 2l2.4 7.4H22l-6.1 4.6 2.3 7.4L12 17l-6.2 4.4 2.3-7.4L2 9.4h7.6z"/>',
    menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    chevron: '<polyline points="9 18 15 12 9 6"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  };
  K.icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;

  /* ---------- 统一配色（不按队伍随机分配） ---------- */
  K.colorFor = () => 'var(--primary)';
  K.initials = (name) => {
    const s = String(name || '?');
    return /[\u4e00-\u9fa5]/.test(s) ? s.slice(-1) : s.slice(0, 1).toUpperCase();
  };

  /* ---------- 组件渲染 ---------- */
  K.statusChip = (status) => {
    const map = { '未开始': 'todo', '进行中': 'doing', '已完成': 'done', '有风险': 'risk' };
    const cls = map[status] || 'todo';
    return `<span class="status status--${cls}"><span class="sdot"></span>${K.escape(status)}</span>`;
  };
  K.progressHtml = (value, status) => {
    const fillCls = status === '已完成' ? 'is-done' : status === '有风险' ? 'is-risk' : status === '未开始' ? 'is-todo' : '';
    return `<div class="progress"><div class="pbar"><div class="pfill ${fillCls}" style="width:${Math.max(0, Math.min(100, value))}%"></div></div><div class="pval">${Math.round(value)}%</div></div>`;
  };
  K.identityBadge = (identity) => `<span class="identity-badge id-${K.escape(identity)}">${K.escape(identity)}</span>`;
  K.avatar = (name, size = '') => {
    const sz = size ? `avatar-${size}` : '';
    return `<div class="avatar ${sz}" style="background:var(--secondary)">${K.escape(K.initials(name))}</div>`;
  };
  K.avatarStack = (ids, max = 4) => {
    const list = (ids || []).slice(0, max);
    const extra = (ids || []).length - max;
    let html = '<div class="avatar-stack">';
    list.forEach(id => { html += K.avatar(K.memberName(id), ''); });
    if (extra > 0) html += `<div class="avatar-more">+${extra}</div>`;
    html += '</div>';
    return html;
  };
  K.photoThumb = (p) => {
    const name = (p && typeof p === 'object') ? (p.name || '照片') : p;
    if (p && typeof p === 'object' && (p.link || p.url)) {
      const src = p.link || p.url;
      return `<a class="photo-link" href="${K.escape(src)}" target="_blank" rel="noopener" title="查看/下载原图：${K.escape(name)}"><img class="photo-img" loading="lazy" src="${K.escape(src)}" alt="${K.escape(name)}" onerror="this.style.display='none';this.parentElement.classList.add('no-img')"><span class="ph-fallback">${K.icon('image', 22)}<i>${K.escape(name)}</i></span></a>`;
    }
    return `<div class="photo-thumb">${K.icon('image', 22)}<div class="ph-name">${K.escape(name)}</div></div>`;
  };
  K.statCard = ({ label, value, unit, foot, ico, variant }) => `
    <div class="stat ${variant ? 'is-' + variant : ''}">
      <div class="stat-label">${ico ? `<span class="stat-ico">${ico}</span>` : ''}${K.escape(label)}</div>
      <div class="stat-value">${value}${unit ? `<span class="unit">${K.escape(unit)}</span>` : ''}</div>
      ${foot ? `<div class="stat-foot">${foot}</div>` : ''}
    </div>`;

  /* ---------- 导航 ---------- */
  K.nav = [
    { key: 'overview', label: '总看板', href: 'index.html', icon: 'dashboard' },
    { key: 'teams', label: '队伍管理', href: 'team-management.html', icon: 'users' },
    { key: 'okr', label: 'OKR 管理', href: 'okr.html', icon: 'target' },
    { key: 'biweekly', label: '双周报', href: 'biweekly-report.html', icon: 'report' },
    { key: 'checkin', label: '日常打卡', href: 'checkin.html', icon: 'camera' },
    { key: 'brief', label: '项目快报', href: 'quick-brief.html', icon: 'brief' },
  ];

  /* ---------- 共享 Shell ---------- */
  K.shell = function (active, opts) {
    opts = opts || {};
    const meta = D.meta || {};
    const navHtml = K.nav.map(n => `
      <a class="nav-item ${n.key === active ? 'active' : ''}" href="${n.href}">
        <span class="nav-ico">${K.icon(n.icon, 18)}</span><span>${n.label}</span>
      </a>`).join('');
    const syncText = meta.source === 'sample' ? '示例数据' : ('已同步 · ' + (meta.syncedAt || ''));

    return `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <div class="brand-mark">营</div>
          <div class="brand-text">
            <div class="brand-name">${K.escape(meta.campName || '训练营')}</div>
          </div>
        </div>
        <nav class="nav-section">${navHtml}</nav>
        <div class="sidebar-foot">
          <a class="sidebar-link" href="https://qcnjj22jqvr1.feishu.cn/base/NVokbNXaca3oihspnCicYyccnVe" target="_blank">
            ${K.icon('external', 15)} 飞书协作编辑
          </a>
          <div class="sidebar-sync">${K.escape(syncText)}</div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="topbar-left">
            <button class="menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">${K.icon('menu', 20)}</button>
            <div class="page-title">
              <h1>${K.escape(opts.title || '')}</h1>
              ${opts.crumb ? `<div class="crumb">${opts.crumb}</div>` : ''}
            </div>
          </div>
          <div class="topbar-meta">
            <span class="sync-chip"><span class="dot ${meta.source === 'sample' ? 'sample' : ''}"></span>${K.escape(syncText)}</span>
            ${opts.tools || ''}
          </div>
        </header>
        <main class="content" id="view"></main>
      </div>
    </div>`;
  };

  /* ---------- 挂载 ---------- */
  K.mount = function (active, opts) {
    document.body.innerHTML = K.shell(active, opts);
    return document.getElementById('view');
  };

  /* ---------- 提示 ---------- */
  K.toast = function (msg, type) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed;right:24px;bottom:24px;z-index:999;padding:11px 18px;border-radius:var(--radius);background:${type === 'error' ? 'var(--destructive)' : 'var(--secondary)'};color:#fff;font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,0.18);opacity:0;transition:opacity .2s`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.style.opacity = '1');
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 2400);
  };

  /* ---------- 飞书 Base 跳转 ---------- */
  const FEISHU_BASE = 'https://qcnjj22jqvr1.feishu.cn/base/NVokbNXaca3oihspnCicYyccnVe';
  const FEISHU_TABLES = {
    teams: 'tbl8oIGEwoADEgUI',
    members: 'tbl1t0VVs8dVQlGG',
    objectives: 'tbl68l75iGbAYalp',
    keyResults: 'tblh2PGrBOUIKFSL',
    reports: 'tblspHuh1hALM8AU',
    checkins: 'tblaCysgJ53PqNEL',
  };
  K.openFeishu = function (tableKey) {
    const tid = FEISHU_TABLES[tableKey];
    const url = tid ? `${FEISHU_BASE}?table=${tid}` : FEISHU_BASE;
    window.open(url, '_blank');
  };
  K.feishuTip = function (tableKey, action) {
    K.toast(`${action}：已打开飞书多维表格，请在对应表中操作。`, 'info');
    K.openFeishu(tableKey);
  };

  /* ---------- 图表组件 ---------- */

  // 环形图（Donut Chart）— 用于 OKR 状态分布
  K.donut = function (data, opts) {
    opts = opts || {};
    const total = data.reduce((a, d) => a + d.value, 0) || 1;
    const size = opts.size || 120;
    const r = size / 2;
    const stroke = opts.stroke || 18;
    const radius = r - stroke / 2;
    const cx = r, cy = r;
    const circumference = 2 * Math.PI * radius;

    let offset = 0;
    let segments = '';
    data.forEach((d, i) => {
      const pct = d.value / total;
      const len = pct * circumference;
      const dash = `${len} ${circumference - len}`;
      const dashoffset = -offset;
      segments += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke-width="${stroke}" stroke-dasharray="${dash}" stroke-dashoffset="${dashoffset}" transform="rotate(-90 ${cx} ${cy})" style="stroke:${d.color};transition:stroke-dasharray .5s ease"/>`;
      offset += len;
    });

    const centerVal = opts.centerVal != null ? opts.centerVal : total;
    const centerLabel = opts.centerLabel || '';
    const legend = data.map(d => {
      const pct = Math.round(d.value / total * 100);
      return `<div class="dl-row">
        <span class="dl-sw" style="background:${d.color}"></span>
        <span class="dl-label">${K.escape(d.label)}</span>
        <span class="dl-val">${d.value}</span>
        <span class="dl-pct">${pct}%</span>
      </div>`;
    }).join('');

    return `<div class="donut-wrap">
      <div class="donut" style="width:${size}px;height:${size}px">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position:absolute;inset:0">
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke-width="${stroke}" style="stroke:var(--muted);opacity:0.3"/>
          ${segments}
        </svg>
        <div class="donut-center">
          <div class="dc-val">${centerVal}</div>
          ${centerLabel ? `<div class="dc-label">${K.escape(centerLabel)}</div>` : ''}
        </div>
      </div>
      <div class="donut-legend">${legend}</div>
    </div>`;
  };

  // 热力图（Heatmap）— 用于打卡活跃度
  K.heatmap = function (checkins, opts) {
    opts = opts || {};
    const today = new Date();
    const meta = D.meta || {};

    // 统计每天打卡数（使用 activityTime 字段）
    const dateCount = {};
    checkins.forEach(c => {
      const raw = c.activityTime || c.date || '';
      if (!raw) return;
      const d = raw.slice(0, 10);
      dateCount[d] = (dateCount[d] || 0) + 1;
    });

    // 起始日期：对齐到周一
    let startDate;
    const cycleStartDate = meta.cycleStart ? new Date(meta.cycleStart) : null;
    if (cycleStartDate && !isNaN(cycleStartDate)) {
      startDate = new Date(cycleStartDate);
    } else if (Object.keys(dateCount).length) {
      startDate = new Date(Object.keys(dateCount).sort()[0]);
    } else {
      startDate = new Date(today);
    }
    const dayOfWeek = startDate.getDay() || 7;
    startDate.setDate(startDate.getDate() - dayOfWeek + 1);

    // 结束日期：始终到周期结束
    let endDate;
    const cycleEndDate = meta.cycleEnd ? new Date(meta.cycleEnd) : null;
    if (cycleEndDate && !isNaN(cycleEndDate)) {
      endDate = new Date(cycleEndDate);
    } else {
      endDate = new Date(today);
    }
    endDate.setHours(23, 59, 59, 999);
    if (endDate < startDate) endDate = new Date(startDate);

    const totalDays = Math.ceil((endDate - startDate) / 86400000);
    const weeks = Math.max(1, Math.ceil(totalDays / 7));

    const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
    const maxCount = Math.max(1, ...Object.values(dateCount));
    const gridCols = '20px repeat(' + weeks + ',minmax(0,1fr))';

    let rows = '';
    for (let dow = 0; dow < 7; dow++) {
      let cells = '';
      for (let w = 0; w < weeks; w++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + w * 7 + dow);
        const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        if (d > endDate) {
          cells += '<div class="heatmap-cell empty"></div>';
          continue;
        }
        if (d > today) {
          cells += '<div class="heatmap-cell future" title="' + ds + ': 未开始"></div>';
          continue;
        }
        const count = dateCount[ds] || 0;
        let level = '';
        if (count > 0) {
          const ratio = count / maxCount;
          if (ratio > 0.75) level = 'l4';
          else if (ratio > 0.5) level = 'l3';
          else if (ratio > 0.25) level = 'l2';
          else level = 'l1';
        }
        cells += '<div class="heatmap-cell ' + level + '" title="' + ds + ': ' + count + '次打卡"></div>';
      }
      rows += '<div class="heatmap-row" style="grid-template-columns:' + gridCols + '"><span class="heatmap-label">' + dayLabels[dow] + '</span>' + cells + '</div>';
    }

    // 周标签：每 2 周显示一个，避免拥挤
    let weekLabels = '<span></span>';
    for (let w = 0; w < weeks; w++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + w * 7);
      if (w % 2 === 0) {
        weekLabels += '<span>' + (d.getMonth()+1) + '.' + d.getDate() + '</span>';
      } else {
        weekLabels += '<span></span>';
      }
    }

    return '<div class="heatmap"><div class="heatmap-weeks" style="grid-template-columns:' + gridCols + '">' + weekLabels + '</div>' + rows + '</div>';
  };

  // 趋势柱状图 — 用于双周报提交趋势
  K.trendLine = function (data, opts) {
    opts = opts || {};
    if (!data.length) return '<div class="text-muted text-sm" style="padding:20px;text-align:center">暂无趋势数据</div>';

    const max = Math.max(...data.map(d => d.value), 100);
    const barWidth = data.length > 1 ? 100 / data.length : 60;
    const gap = 4;

    const bars = data.map((d, i) => {
      const h = Math.round(d.value / max * 100);
      const isLatest = i === data.length - 1;
      const fillClass = isLatest ? 'is-gold' : '';
      return `<div class="tbar-col" style="width:${barWidth}%">
        <div class="tbar-val">${d.value}%</div>
        <div class="tbar-track">
          <div class="tbar-fill ${fillClass}" style="height:${Math.max(2, h)}%"></div>
        </div>
        <div class="tbar-label">${K.escape(d.label || '')}</div>
      </div>`;
    }).join('');

    return `<div class="trend-bars">${bars}</div>`;
  };

  /* ---------- 导出/打印 ---------- */
  K.printPage = () => window.print();
  K.exportCSV = function (filename, headers, rows) {
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    K.toast('已导出 ' + filename);
  };

})();
