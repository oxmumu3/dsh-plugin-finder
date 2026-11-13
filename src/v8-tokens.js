// v8 颜色与字体变量。全部指向宿主变量，回退值只在宿主没有该变量时生效（SPEC 第 2 节）。
// 界面里不再写任何色值，只引用这里的变量。

export const v8TokensCss = `
.pf_v8 {
  --ink: var(--dsw-alias-label-primary, #191b1f);
  --ink2: var(--dsw-alias-label-secondary, #4b5058);
  --ink3: var(--dsw-alias-label-tertiary, #868c95);
  --ink4: var(--dsw-alias-label-caption, #b9bdc3);
  --bg: var(--dsw-alias-bg-base, #f8f8f6);
  --card: var(--dsw-alias-bg-layer-2, #ffffff);
  --line: var(--dsw-alias-border-l2, #e7e7e2);
  --line2: var(--dsw-alias-border-l4, #d0d0c9);
  --hover: var(--dsw-alias-interactive-bg-hover, rgba(25, 27, 31, .05));
  --primary: var(--dsw-alias-button-primary-fill, #191b1f);
  --on-primary: var(--dsw-alias-label-primary-inverted, #ffffff);
  --have: var(--dsw-alias-link, #4d6bfe);
  --build: var(--dsw-alias-state-warn-primary, #dd8500);
  --ok: var(--dsw-alias-state-success-primary, #2fa36b);
  --serif: "Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", Georgia, serif;
  --sans: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif);
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --ease: cubic-bezier(.2, .8, .2, 1);
}
`;

// 深色回退：宿主没给变量时（离线渲染、测试环境）用这一套。
export const v8DarkFallbackCss = `
.pf_v8[data-theme="dark"] {
  --ink: #eceded; --ink2: #b5b9bf; --ink3: #7e848d; --ink4: #4f545b;
  --bg: #141517; --card: #1d1f22; --line: #2a2c30; --line2: #3b3e43;
  --hover: rgba(236, 237, 237, .07);
  --primary: #eceded; --on-primary: #141517;
  --have: #8198ff; --build: #f0a530; --ok: #4cc38a;
}
`;

// 只在离线渲染时用：真宿主在深色下会给同名变量，这里把 SPEC 第 2 节的深色回退
// 直接挂到宿主变量名上，让不依赖宿主的渲染页也能出深色截图。不进打包的样式。
export const v8HostDarkCss = `
.dark {
  --dsw-alias-label-primary: #eceded;
  --dsw-alias-label-secondary: #b5b9bf;
  --dsw-alias-label-tertiary: #7e848d;
  --dsw-alias-label-caption: #4f545b;
  --dsw-alias-bg-base: #141517;
  --dsw-alias-bg-layer-1: #1a1b1e;
  --dsw-alias-bg-layer-2: #1d1f22;
  --dsw-alias-border-l2: #2a2c30;
  --dsw-alias-border-l3: #33363b;
  --dsw-alias-border-l4: #3b3e43;
  --dsw-alias-interactive-bg-hover: rgba(236, 237, 237, .07);
  --dsw-alias-button-primary-fill: #eceded;
  --dsw-alias-label-primary-inverted: #141517;
  --dsw-alias-link: #8198ff;
  --dsw-alias-state-warn-primary: #f0a530;
  --dsw-alias-state-success-primary: #4cc38a;
  --dsw-alias-state-business-primary: #8198ff;
}
`;
