#!/usr/bin/env node
/**
 * sync-feishu-api.mjs — 飞书多维表格 → 看板 data.js 同步（基于飞书开放平台 API）
 *
 * 使用 app_id/app_secret 获取 tenant_access_token，直接调用飞书 API 拉取数据。
 * 适合在 GitHub Actions 或无 lark-cli 的环境中运行。
 *
 * 用法：
 *   node scripts/sync-feishu-api.mjs                    # 同步并写入 data.js
 *   node scripts/sync-feishu-api.mjs --dry-run          # 仅拉取并打印统计
 *
 * 环境变量：
 *   FEISHU_APP_ID     — 飞书自建应用 App ID
 *   FEISHU_APP_SECRET — 飞书自建应用 App Secret
 */
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

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;

if (!APP_ID || !APP_SECRET) {
  fail('缺少环境变量 FEISHU_APP_ID 或 FEISHU_APP_SECRET');
}

// ---------- 飞书 API 调用 ----------
const API = 'https://open.feishu.cn/open-apis';

async function getAccessToken() {
  const url = `${API}/auth/v3/tenant_access_token/internal`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const j = await resp.json();
  if (j.code !== 0) fail(`获取 token 失败: ${j.msg}`);
  return j.tenant_access_token;
}

// 拉全表记录（自动分页）
async function listAll(token, tableId) {
  const allRecords = [];
  let pageToken = '';
  let fields = null;
  do {
    const params = new URLSearchParams({
      page_size: '500',
    });
    if (pageToken) params.set('page_token', pageToken);
    const url = `${API}/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/records?${params}`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const j = await resp.json();
    if (j.code !== 0) fail(`拉取记录失败 (table=${tableId}): ${j.msg}`);
    if (!fields) {
      // 从第一条记录提取字段名
      if (j.data.items && j.data.items.length > 0) {
        fields = Object.keys(j.data.items[0].fields);
      } else {
        fields = [];
      }
    }
    allRecords.push(...(j.data.items || []));
    pageToken = j.data.page_token || '';
    if (!j.data.has_more) break;
  } while (pageToken);
  return { fields, records: allRecords };
}

// 获取表字段定义（用于获取字段类型）
async function getTableFields(token, tableId) {
  const url = `${API}/bitable/v1/apps/${BASE_TOKEN}/tables/${tableId}/fields`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const j = await resp.json();
  if (j.code !== 0) return [];
  return j.data.items || [];
}

// ---------- 值提取 ----------
function txt(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : (x.text || x.name || '')).join('');
  if (typeof v === 'object') return v.text || v.name || '';
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
  return v.map(x => typeof x === 'string' ? x : (x.record_ids || x.record_id || x.id || '')).filter(Boolean).flat();
}
function dateOnly(v) {
  if (v == null) return '';
  if (typeof v === 'number') {
    const d = new Date(v < 1e12 ? v * 1000 : v);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
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
async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');

  log('① 获取飞书 tenant_access_token…');
  const token = await getAccessToken();
  log('   token 获取成功');

  log('② 拉取各表记录…');
  const raw = {};
  const order = ['teams', 'members', 'objectives', 'keyResults', 'reports', 'checkins'];
  for (const t of order) {
    const { fields, records } = await listAll(token, TABLE_IDS[t]);
    raw[t] = { fields, records };
    log(`   ${t}: ${records.length} 条`);
  }

  log('③ 映射与派生计算…');

  // 从记录中提取字段值
  function getField(record, fieldName) {
    return record.fields[fieldName];
  }

  // 队伍
  const teamRecIdToId = {};
  const teamNameToId = {};
  let teams = raw.teams.records.map(r => {
    const id = r.record_id;
    teamRecIdToId[r.record_id] = id;
    const name = txt(getField(r, '队伍名称'));
    teamNameToId[name] = id;
    return {
      id,
      name,
      topic: txt(getField(r, '课题')),
      cycleStart: dateOnly(getField(r, '周期开始')),
      cycleEnd: dateOnly(getField(r, '周期结束')),
      status: sel(getField(r, '状态')) || '运转中',
    };
  });

  // 成员
  const memberRecIdToId = {};
  let members = raw.members.records.map(r => {
    const id = r.record_id;
    memberRecIdToId[r.record_id] = id;
    const teamName = sel(getField(r, '所属团队'));
    const teamId = teamNameToId[teamName] || '';
    return {
      id, teamId,
      name: txt(getField(r, '姓名')),
      identity: sel(getField(r, '身份')) || '成员',
      role: sel(getField(r, '角色')) || '队员',
      oa: txt(getField(r, 'OA号')),
    };
  });

  // 队伍派生 leader / memberCount
  teams = teams.map(t => {
    const tm = members.filter(m => m.teamId === t.id);
    const leader = tm.find(m => m.role === '队长') || tm[0] || {};
    return { ...t, leaderId: leader.id || '', leader: leader.name || '—', memberCount: tm.length };
  });

  // 目标
  const objRecIdToId = {};
  let objectives = raw.objectives.records.map(r => {
    const id = r.record_id;
    objRecIdToId[r.record_id] = id;
    const teamName = sel(getField(r, '所属团队'));
    const teamId = teamNameToId[teamName] || '';
    return { id, teamId, title: txt(getField(r, '目标标题')), owner: txt(getField(r, '负责人')) };
  });

  // 关键结果
  const krRecIdToId = {};
  let keyResults = raw.keyResults.records.map(r => {
    const id = r.record_id;
    krRecIdToId[r.record_id] = id;
    const objLink = linkIds(getField(r, '所属目标'));
    const objectiveId = objLink.length ? (objRecIdToId[objLink[0]] || objLink[0]) : '';
    const teamName = sel(getField(r, '所属团队'));
    let teamId = teamNameToId[teamName] || '';
    if (!teamId && objectiveId) {
      const o = objectives.find(x => x.id === objectiveId);
      if (o) teamId = o.teamId;
    }
    const rawProgress = num(getField(r, '进度'));
    const progress = rawProgress > 1 ? Math.round(rawProgress) : Math.round(rawProgress * 100);
    const plannedDate = dateOnly(getField(r, 'KR计划完成时间'));
    const rawStatus = sel(getField(r, '状态')) || '进行中';
    // 风险重算：未完成且超过计划完成时间 → 有风险
    let status = rawStatus;
    if (rawStatus !== '已完成' && plannedDate) {
      const today = new Date();
      const planned = new Date(plannedDate);
      if (planned < today) {
        status = '有风险';
      }
    }
    return {
      id, objectiveId, teamId,
      title: txt(getField(r, 'KR标题')),
      progress,
      status,
      plannedDate,
      updatedAt: dateOnly(getField(r, 'KR状态更新时间') || getField(r, '更新时间')),
    };
  });

  // 双周报
  let biweeklyReports = raw.reports.records.map(r => {
    const id = r.record_id;
    const teamName = sel(getField(r, '所属团队'));
    const teamId = teamNameToId[teamName] || '';
    const krLinks = linkIds(getField(r, '本期更新KR'));
    const krUpdates = krLinks.map(rid => {
      const krId = krRecIdToId[rid] || rid;
      const kr = keyResults.find(k => k.id === krId);
      return { krId, title: kr ? kr.title : '', progress: kr ? kr.progress : 0, status: kr ? kr.status : '' };
    });
    return {
      id, teamId,
      title: txt(getField(r, '报告标题')),
      period: txt(getField(r, '周期')),
      progressSummary: txt(getField(r, '本期进展')),
      problemsNeeds: txt(getField(r, '问题与需求')),
      recorder: txt(getField(r, '记录人')),
      krUpdates,
      createdAt: dateOnly(getField(r, '创建时间')),
    };
  });

  // 打卡
  const checkins = raw.checkins.records.map(r => {
    const id = r.record_id;
    const teamName = sel(getField(r, '所属团队'));
    const teamId = teamNameToId[teamName] || '';
    const teamPartLinks = linkIds(getField(r, '团队内参与人'));
    const teamParticipantIds = teamPartLinks.map(rid => memberRecIdToId[rid] || rid);
    const extraRaw = getField(r, '其他参与人');
    const extraParticipants = Array.isArray(extraRaw) ? extraRaw.map(x => typeof x === 'string' ? x : (x.text || x.name || '')).filter(Boolean) : (txt(extraRaw) ? txt(extraRaw).split(/[,，]/).map(s => s.trim()).filter(Boolean) : []);
    const photosRaw = getField(r, '打卡照片');
    const photos = Array.isArray(photosRaw) ? photosRaw.map(a => a.file_token || a.name || 'photo').filter(Boolean) : [];
    return {
      id, teamId,
      activityTime: dt(getField(r, '活动时间')),
      content: txt(getField(r, '研讨内容')),
      photos,
      teamParticipantIds,
      extraParticipants,
    };
  });

  // 汇总
  const identityTypes = ['成员', '志愿者', '内部导师', '外部导师'];
  const identityStats = identityTypes.map(t => {
    const ms = members.filter(m => m.identity === t);
    const participation = checkins.reduce((a, c) => a + (c.teamParticipantIds || []).filter(id => {
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
      syncedAt: new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }),
      source: 'feishu-api (GitHub Actions)',
      note: '由 scripts/sync-feishu-api.mjs 从飞书开放平台 API 同步。',
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
    log('④ --dry-run：未写入文件。');
    return;
  }

  const content = `// 由 sync-feishu-api.mjs 自动同步：${data.meta.syncedAt}\n// 数据来源：飞书开放平台 API（GitHub Actions 自动同步）\nwindow.KANBAN_DATA = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(OUT, content, 'utf8');
  log(`④ 已写入 ${path.relative(ROOT, OUT)}`);
  log('完成。');
}

function log(m) { console.log(m); }
function fail(m) { console.error('\n[同步失败] ' + m); process.exit(1); }

main().catch(e => fail(e.message || String(e)));
