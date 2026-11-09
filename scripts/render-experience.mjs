// Render the REAL Finder view with the REAL stylesheet, then measure it.
// This is the loop that was missing: it catches crowding, overlaps and off-scale
// values before anything is installed on the user's machine.
//
//   node scripts/render-experience.mjs <outDir>
//
// It writes one HTML file per state plus a measured report as JSON on stdout.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createExperienceView } from '../src/experience-view.js';
import { finderCss } from '../src/client-style.js';
import { experienceCss } from '../src/experience-style.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'docs/design/experience-v3/render'));
const ExperienceView = createExperienceView(React);

// A controller that records nothing and refuses nothing.
const controller = new Proxy({}, { get: () => () => {} });

const request = '我想做一个自己的小工具：把会议记录整理成可核对的待办，保留原文位置，确认后再写入任务工具。';
const lastSearches = [{
  id: 'demo-1', searchedAt: '2026-11-08T22:38:00.000Z', request: '在 DSH 里做一个学习知识库插件：以对话为入口，把学习的主线与支线、知识点卡片、进度状态持久化下来。',
  planKind: 'combo', sources: [
    { id: 'market', title: 'DSH 已配置市场', status: 'ok', total: 0, used: 0 },
    { id: 'awesome', title: 'Awesome DSH 完整社区目录', status: 'ok', total: 9412, used: 1 },
    { id: 'npm', title: 'GitHub dsh-plugin topic', status: 'ok', total: 0, used: 0 },
    { id: 'featured', title: 'Awesome DSH Plugin 插件精选', status: 'ok', total: 4790, used: 0 },
  ],
}];

const plan = {
  kind: 'native', title: '不用装插件，DSH 自带就能做。',
  rationale: '告诉它笔记在哪个文件夹，DSH 会读出待办、按项目分组、标上出处，在对话里给你一份清单草稿，不改任何文件。',
  pluginIds: [], steps: [], limits: ['它还不知道你的笔记放在哪，开始时会先问你。', '这次只读不写，不会安装插件，也不会改文件。'],
  gaps: [],
};
const candidates = [
  { id: 'dsh-taskboard', name: 'dsh-taskboard', version: '0.9.1', summary: '把待办整理成项目看板，可以定时执行。' },
  { id: 'dsh-todos', name: 'dsh-todos', version: '0.3.0', summary: '在侧栏里记录和勾选待办。' },
];

const states = {
  home: {
    view: 'home', homeRequest: request, bootstrapLoaded: true, modelReady: true,
    searchHistory: lastSearches, request: '', plan: null, candidates: [],
  },
  searching: {
    view: 'find', searching: true, busy: 'recommend', homeRequest: request, bootstrapLoaded: true,
  },
  plan: {
    view: 'find', request, plan, candidates, revisionNumber: 2, bootstrapLoaded: true,
    discovery: { status: 'ok', sources: [] },
    conversation: [{ id: 'm1', role: 'user', text: '只整理这周改过的笔记就行。' }, { id: 'm2', role: 'assistant', text: '可以，开始时我只读本周修改过的笔记。' }],
    expertAvailable: false,
  },
};

const wrapper = (body, css) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Finder render</title>
<style>${css}</style>
<style>
html,body{margin:0;background:#14161b;color:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
.shell{max-width:1080px;margin:0 auto;padding:0}
</style></head>
<body><div class="shell"><div class="pf_root pf_v2" style="height:auto">${body}</div></div></body></html>`;

const files = [];
await mkdir(out, { recursive: true });
for (const [name, state] of Object.entries(states)) {
  const markup = renderToStaticMarkup(React.createElement(ExperienceView, {
    state, controller, busy: Boolean(state.busy), modelReady: true, copyText: async () => '', sections: {},
  }));
  const file = join(out, `${name}.html`);
  await writeFile(file, wrapper(markup, `${finderCss}\n${experienceCss}`));
  files.push(file);
}
console.log(JSON.stringify({ out, files }, null, 2));
