#!/usr/bin/env node
/**
 * sync-via-lark-cli.mjs — 飞书多维表格 → 看板 data.js 同步（基于 lark-cli，无需 appId/appSecret）
 *
 * 与 sync-from-feishu.mjs 的区别：不调用飞书开放平台 API，而是通过已认证的
 * lark-cli（user 身份）拉取各表记录，适合本机已登录 lark-cli 的场景。
 *
 * 用法：
 *   node scripts/sync-via-lark-cli.mjs                 # 同步并写入 data.js
 *   node scripts/sync-via-lark-cli.mjs --dry-run        # 仅拉取并打印统计，不写文件
 *
 * 配置：编辑下方 BASE_TOKEN 与 TABLE_IDS（默认已填好当前 Base）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'js', 'data.js');

// ---------- 配置 ----------
const BASE_TOKEN = 'NVokbNXaca3oihspnCicYyccnVe';
const TABLE_IDS = {
  teams: 'tbl8oIGEwoADEgUI',
  members: 'tbl1t0VVs8dVQlGG',
  objectives: 'tbl68l75iGbAYalp',
  keyResults: 'tblh2PGrBOUIKFSL',
  reports: 'tblspHuh1hALM8AU',
  checkins: 'tblaCysgJ53PqNEL',
};
const CAMP_NAME = '澎π计划AI训练营';

// ---------- lark-cli 调用 ----------
function larkCli(args) {
  const r = spawnSync('lark-cli', ['base', ...args, '--as', 'user', '--format', 'json'], {
    encoding: 'utf8', shell: true, cwd: ROOT, maxBuffer: 200 * 1024 * 1024,
  });
  const out = (r.stdout || '').trim() || (r.stderr || '').trim();
  const mm = out.match(/\{[\s\S]*\}/);
  let j;
  try { j = mm ? JSON.parse(mm[0]) : null; } catch (e) {
    fail('lark-cli 非 JSON 输出: ' + out.slice(0, 500));
  }
  if (!j) fail('lark-cli 无输出');
  if (!j.ok) fail('lark-cli 错误: ' + JSON.stringify(j.error || j));
  return j.data;
}

// 拉全表记录（自动分页）
function listAll(tableId) {
  const all = { fields: [], data: [], record_id_list: [] };
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const d = larkCli(['+record-list', '--base-token', BASE_TOKEN, '--table-id', tableId, '--limit', '200', '--offset', String(offset)]);
    if (!all.fields.length) all.fields = d.fields;
    all.data.push(...(d.data || []));
    all.record_id_list.push(...(d.record_id_list || []));
    hasMore = !!d.has_more;
    offset += (d.data || []).length;
    if (!d.data || d.data.length === 0) break;
  }
  return all;
}

// ---------- 值提取 ----------
function txt(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : (x.text || x.name || '')).join('');
  return String(v);
}
function num(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}
function sel(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length ? (typeof v[0] === 'string' ? v[0] : (v[0]?.text || v[0]?.name || '')) : '';
  return v.text || v.name || '';
}
function linkIds(v) {
  if (!Array.isArray(v)) return [];
  return v.map(x => typeof x === 'string' ? x : (x.id || x.record_id || '')).filter(Boolean);
}
function dateOnly(v) {
  if (v == null) return '';
  if (typeof v === 'number') {
    const d = new Date(v < 1e12 ? v * 1000 : v);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  // lark-cli 日期返回 "2026-03-02 00:00:00" 字符串
  return String(v).slice(0, 10);
}
function dt(v) {
  if (v == null) return '';
  if (typeof v === 'number') {
    const d = new Date(v < 1e12 ? v * 1000 : v);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  return String(v).slice(0, 16);
}

// ---------- 主流程 ----------
function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');

  log('① 通过 lark-cli 拉取各表记录…');
  const raw = {};
  const order = ['teams', 'members', 'objectives', 'keyResults', 'reports', 'checkins'];
  for (const t of order) {
    raw[t] = listAll(TABLE_IDS[t]);
    log(`   ${t}: ${raw[t].data.length} 条 (has_more 已处理)`);
  }

  log('② 映射与派生计算…');
  // 字段映射（ID 字段已删除，统一使用 recordId）
  const F = {
    teams: { name: '队伍名称', topic: '课题', cycleStart: '周期开始', cycleEnd: '周期结束', status: '状态' },
    members: { teamName: '所属团队', name: '姓名', identity: '身份', role: '角色', oa: 'OA号' },
    objectives: { teamName: '所属团队', title: '目标标题', owner: '负责人' },
    keyResults: { objectiveId: '所属目标', teamName: '所属团队', title: 'KR标题', progress: '进度', status: '状态', updatedAt: '更新时间' },
    reports: { teamName: '所属团队', title: '报告标题', period: '周期', progressSummary: '本期进展', problemsNeeds: '问题与需求', recorder: '记录人', krUpdates: '本期更新KR', createdAt: '创建时间' },
    checkins: { teamName: '所属团队', activityTime: '活动时间', content: '研讨内容', photos: '打卡照片', teamParticipantIds: '团队内参与人', volunteerParticipantIds: '志愿者参与人', extraParticipants: '其他参与人' },
  };

  // 把 2D array + fields 转成 record 对象数组
  function toRecords(tableKey) {
    const { fields, data, record_id_list } = raw[tableKey];
    const fm = F[tableKey];
    return data.map((row, i) => {
      const obj = { _recordId: record_id_list[i], _fields: {} };
      fields.forEach((fn, fi) => { obj._fields[fn] = row[fi]; });
      return obj;
    });
  }

  // 队伍（ID 使用 recordId）+ 名称→ID 映射
  const teamRecIdToId = {};
  const teamNameToId = {};
  let teams = toRecords('teams').map(r => {
    const f = r._fields;
    const id = r._recordId;
    teamRecIdToId[r._recordId] = id;
    const name = txt(f[F.teams.name]);
    teamNameToId[name] = id;
    return {
      id,
      name,
      topic: txt(f[F.teams.topic]),
      cycleStart: dateOnly(f[F.teams.cycleStart]),
      cycleEnd: dateOnly(f[F.teams.cycleEnd]),
      status: sel(f[F.teams.status]) || '运转中',
    };
  });

  // 成员（ID 使用 recordId）
  const memberRecIdToId = {};
  let members = toRecords('members').map(r => {
    const f = r._fields;
    const id = r._recordId;
    memberRecIdToId[r._recordId] = id;
    const teamName = sel(f[F.members.teamName]);
    const teamId = teamNameToId[teamName] || '';
    return {
      id, teamId,
      name: txt(f[F.members.name]),
      identity: sel(f[F.members.identity]) || '成员',
      role: sel(f[F.members.role]) || '队员',
      oa: txt(f[F.members.oa]),
    };
  });

  // 队伍派生 leader / memberCount
  teams = teams.map(t => {
    const tm = members.filter(m => m.teamId === t.id);
    const leader = tm.find(m => m.role === '队长') || tm[0] || {};
    return { ...t, leaderId: leader.id || '', leader: leader.name || '—', memberCount: tm.length };
  });

  // 目标（ID 使用 recordId）
  const objRecIdToId = {};
  let objectives = toRecords('objectives').map(r => {
    const f = r._fields;
    const id = r._recordId;
    objRecIdToId[r._recordId] = id;
    const teamName = sel(f[F.objectives.teamName]);
    const teamId = teamNameToId[teamName] || '';
    return { id, teamId, title: txt(f[F.objectives.title]), owner: txt(f[F.objectives.owner]) };
  });

  // 关键结果（ID 使用 recordId，进度兼容 0-1 小数与 0-100 整数）
  const krRecIdToId = {};
  let keyResults = toRecords('keyResults').map(r => {
    const f = r._fields;
    const id = r._recordId;
    krRecIdToId[r._recordId] = id;
    const objLink = linkIds(f[F.keyResults.objectiveId]);
    const objectiveId = objLink.length ? (objRecIdToId[objLink[0]] || objLink[0]) : '';
    const teamName = sel(f[F.keyResults.teamName]);
    let teamId = teamNameToId[teamName] || '';
    if (!teamId && objectiveId) {
      const o = objectives.find(x => x.id === objectiveId);
      if (o) teamId = o.teamId;
    }
    // 进度：飞书百分比字段存小数(0.65)，数值字段存整数(65)，统一归一到 0-100
    const rawProgress = num(f[F.keyResults.progress]);
    const progress = rawProgress > 1 ? Math.round(rawProgress) : Math.round(rawProgress * 100);
    return {
      id, objectiveId, teamId,
      title: txt(f[F.keyResults.title]),
      progress,
      status: sel(f[F.keyResults.status]) || '进行中',
      updatedAt: dateOnly(f[F.keyResults.updatedAt]),
    };
  });

  // 双周报（ID 使用 recordId）
  let biweeklyReports = toRecords('reports').map(r => {
    const f = r._fields;
    const id = r._recordId;
    const teamName = sel(f[F.reports.teamName]);
    const teamId = teamNameToId[teamName] || '';
    const krLinks = linkIds(f[F.reports.krUpdates]);
    const krUpdates = krLinks.map(rid => {
      const krId = krRecIdToId[rid] || rid;
      const kr = keyResults.find(k => k.id === krId);
      return { krId, title: kr ? kr.title : '', progress: kr ? kr.progress : 0, status: kr ? kr.status : '' };
    });
    return {
      id, teamId,
      title: txt(f[F.reports.title]),
      period: txt(f[F.reports.period]),
      progressSummary: txt(f[F.reports.progressSummary]),
      problemsNeeds: txt(f[F.reports.problemsNeeds]),
      recorder: txt(f[F.reports.recorder]),
      krUpdates,
      createdAt: dateOnly(f[F.reports.createdAt]),
    };
  });

  // 打卡（ID 使用 recordId）
  const checkins = toRecords('checkins').map(r => {
    const f = r._fields;
    const id = r._recordId;
    const teamName = sel(f[F.checkins.teamName]);
    const teamId = teamNameToId[teamName] || '';
    const teamPartLinks = linkIds(f[F.checkins.teamParticipantIds]);
    const teamParticipantIds = teamPartLinks.map(rid => memberRecIdToId[rid] || rid);
    const volPartLinks = linkIds(f[F.checkins.volunteerParticipantIds]);
    const volunteerParticipantIds = volPartLinks.map(rid => memberRecIdToId[rid] || rid);
    const extraRaw = f[F.checkins.extraParticipants];
    const extraParticipants = Array.isArray(extraRaw) ? extraRaw.map(x => typeof x === 'string' ? x : (x.text || x.name || '')).filter(Boolean) : (txt(extraRaw) ? txt(extraRaw).split(/[,，]/).map(s => s.trim()).filter(Boolean) : []);
    const photosRaw = f[F.checkins.photos];
    const photos = Array.isArray(photosRaw) ? photosRaw.map(a => a.name || a.file_token || 'photo').filter(Boolean) : [];
    return {
      id, teamId,
      activityTime: dt(f[F.checkins.activityTime]),
      content: txt(f[F.checkins.content]),
      photos,
      teamParticipantIds,
      volunteerParticipantIds,
      extraParticipants,
    };
  });

  // 汇总
  const identityTypes = ['成员', '志愿者', '内部导师', '外部导师'];
  const identityStats = identityTypes.map(t => {
    const ms = members.filter(m => m.identity === t);
    const participation = checkins.reduce((a, c) => a + (c.teamParticipantIds || []).filter(id => {
      const m = members.find(x => x.id === id); return m && m.identity === t;
    }).length + (c.volunteerParticipantIds || []).filter(id => {
      const m = members.find(x => x.id === id); return m && m.identity === t;
    }).length, 0);
    return { identity: t, count: ms.length, participation };
  });
  const avgProgress = keyResults.length ? Math.round(keyResults.reduce((a, k) => a + k.progress, 0) / keyResults.length) : 0;

  const data = {
    meta: {
      campName: CAMP_NAME,
      cycleStart: teams[0]?.cycleStart || '',
      cycleEnd: teams[0]?.cycleEnd || '',
      syncedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      source: 'feishu (via lark-cli)',
      note: '由 scripts/sync-via-lark-cli.mjs 从飞书多维表格同步。',
    },
    summary: {
      teamCount: teams.length,
      totalMembers: members.length,
      totalObjectives: objectives.length,
      totalKRs: keyResults.length,
      avgProgress,
      reportsSubmitted: biweeklyReports.length,
      checkinCount: checkins.length,
      identityStats,
    },
    teams, members, objectives, keyResults, biweeklyReports, checkins, briefs: [],
  };

  log(`   汇总：队伍 ${data.summary.teamCount} · 成员 ${data.summary.totalMembers} · 目标 ${data.summary.totalObjectives} · KR ${data.summary.totalKRs} · 双周报 ${data.summary.reportsSubmitted} · 打卡 ${data.summary.checkinCount} · 平均进度 ${data.summary.avgProgress}%`);

  if (dryRun) {
    log('③ --dry-run：未写入文件。');
    return;
  }

  const content = `// 由 sync-via-lark-cli.mjs 同步：${data.meta.syncedAt}\n// 数据来源：飞书多维表格（${data.meta.source}）\nwindow.KANBAN_DATA = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(OUT, content, 'utf8');
  log(`③ 已写入 ${path.relative(ROOT, OUT)}`);
  log('完成。刷新浏览器（Ctrl+F5）即可看到最新数据。');
}

function log(m) { console.log(m); }
function fail(m) { console.error('\n[同步失败] ' + m); process.exit(1); }

main();
