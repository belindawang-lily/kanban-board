# 澎π计划AI训练营 · 运营进度看板

训练营运营数据看板：总览 / 队伍管理 / OKR / 双周报 / 日常打卡 / 项目快报 六个模块。

- **公网地址**：<https://belindawang-lily.github.io/kanban-board/>
- **数据源**：[飞书多维表格](https://qcnjj22jqvr1.feishu.cn/base/NVokbNXaca3oihspnCicYyccnVe)（队员在此填报）
- **使用手册**：[USER_MANUAL.html](USER_MANUAL.html)（面向管理员与队员）

## 架构

```
飞书多维表格 ──GitHub Actions 每日定时拉取──▶ data.js ──▶ GitHub Pages 公网展示
```

- 零后端：数据存飞书，看板为纯静态 HTML，无需服务器
- 自动同步：每天北京时间 18:00 一次；推送代码到 main 也会触发
- 编辑闭环：看板内所有「新建/填报」按钮跳转飞书 Base 对应表，数据在飞书侧持久化

## 页面说明

| 页面 | 功能要点 |
|------|---------|
| `index.html` | 6 项核心指标、各队 OKR 进度总览（点击行进入单队）、打卡 Top6、双周报提交率、身份参与统计 |
| `team-management.html` | 队伍详情、成员名册（身份/角色/OA号/累计参与）、导出名单 CSV |
| `okr.html` | O→KR 树形展示、进度与状态、状态分布；支持 `?team=队伍ID` 单队视图 |
| `biweekly-report.html` | 双周报时间线、进展与问题、关联 KR 更新；支持单队视图 |
| `checkin.html` | 打卡时间线、身份参与统计、导出 CSV（按队伍/按人）；支持单队视图 |
| `quick-brief.html` | 一键生成整体或单队快报，浏览器打印导出 PDF |

## 目录结构

```
kanban-board/
├─ index.html / team-management.html / okr.html
├─ biweekly-report.html / checkin.html / quick-brief.html
├─ USER_MANUAL.html           # 使用手册（交付文档）
├─ assets/
│  ├─ css/kanban.css
│  └─ js/
│     ├─ data.js              # 数据快照（同步脚本自动覆盖）
│     └─ app.js               # 数据层 + 共享组件 + 飞书跳转 + CSV 导出
├─ scripts/
│  ├─ sync-feishu-api.mjs     # 飞书开放平台 API 同步（GitHub Actions 用）
│  └─ sync-via-lark-cli.mjs   # lark-cli 同步（本地手动用）
└─ .github/workflows/sync-and-deploy.yml
```

## 数据同步

### 自动（GitHub Actions）

- 触发：cron `0 10 * * *`（北京时间 18:00）+ push 到 main + 手动
- 依赖仓库 Secrets：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`（飞书自建应用凭证）
- 流程：拉取飞书 6 张表 → 生成 `data.js` → 提交推送 → 部署 Pages

### 本地手动

```bash
# 方式1：飞书 API（需环境变量 FEISHU_APP_ID / FEISHU_APP_SECRET）
node scripts/sync-feishu-api.mjs

# 方式2：lark-cli（需本机已登录）
node scripts/sync-via-lark-cli.mjs
```

团队归属经「所属团队」单选字段匹配；KR 进度归一化为 0–100 整数；未完成且过计划完成时间的 KR 自动标记「有风险」。

## 飞书 Base 结构

| 表 | 字段 |
|----|------|
| 队伍 | 队伍名称 · 周期开始 · 周期结束 · 状态 · 课题 |
| 成员 | 姓名 · 所属团队 · 角色 · 身份 · OA号 |
| 目标 | 目标标题 · 负责人 · 所属团队 |
| 关键结果 | KR标题 · 所属目标 · 状态 · 进度 · KR计划完成时间 · 所属团队 |
| 双周报 | 报告标题 · 周期 · 所属团队 · 记录人 · 本期进展 · 问题与需求 · 本期更新KR |
| 打卡 | 研讨内容 · 活动时间 · 所属团队 · 团队内参与人 · 其他参与人 · 打卡照片 |

## 权限

- 飞书 Base 侧：高级权限已开启，12 个团队角色（团队1编辑~团队12编辑），各角色仅可编辑本团队记录，全员可读全部记录
- 看板侧：公网只读，无登录控制

## 已知限制

1. 数据延迟：最长滞后 24 小时；GitHub Actions 整点高峰可能顺延数分钟至 1 小时；紧急可在 Actions 页面手动触发
2. 外网访问：`github.io` 为境外站点，国内直连不稳定
3. 打卡照片：不下载落库（避免撑大仓库），看板显示飞书临时下载链接（24 小时有效，随每日同步刷新），点击查看/下载原图
4. 定时任务：仓库连续 60 天无活动时 GitHub 会自动暂停 cron（本项目每日自动提交，正常不会触发）

## 技术栈

纯 HTML + CSS + 原生 JS，无构建、无外部依赖；Node 18+ 运行同步脚本。
