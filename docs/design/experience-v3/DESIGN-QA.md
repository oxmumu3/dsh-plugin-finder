# Finder 界面交付检查（可执行）

这份清单不是审美教程，是**每次改界面都要跑的步骤**。来源见文末，规则按本仓库的实际问题挑出来。

## 1. 动代码之前

- **先写 token 计划**：这次用到哪几个间距、哪几个字号、哪几个圆角，从既有刻度里选。临时编一个 17px 就是后面「看着乱」的起点。
- **对照 AI 默认审美 tell 自查**：统一圆角卡片套卡片、每张卡都 hover 位移、标题上方小标签、emoji 当图标、链接一律带箭头、一键渐变按钮。命中就说明是默认产物，不是选择。
- **先确认能看见真实渲染**：`node scripts/render-experience.mjs <dir>` 把真实视图组件 + 真实样式表渲成 HTML。不要对着设计稿 HTML 调生产样式——生产 CSS 里原有的约束（例如 `.pfv_home_card` 的 `min-height:208px`）不会出现在设计稿里，这就是「上线才发现挤」的常见原因。

## 2. 改的时候

- **CSS 特异性**：覆盖必须先确认原有规则的存在与先后，不要假设没有冲突。
- **一处用力**：整页只允许一个视觉主角（这里是方案卡），其余克制。
- **文案即界面**：按钮动词与结果一致；空态与失败态各说清下一步；不用开关状态或内部术语当标题。

## 3. 交付之前（脚本能查的必须脚本查）

渲染后截图，然后：

- **对齐**：同一页所有顶层块左右边缘是否共线（差 0px）。
- **刻度**：间距、字号是否都在刻度上；不在的逐个说明理由。
- **对比度**：正文 ≥ 4.5:1，大字 ≥ 3:1；禁用态属豁免，单独计数。
- **裁切与重叠**：有无内容被裁、子元素溢出父容器、绝对定位元素压住别的内容。
- **疏密**：块与块之间是否明显大于块内；连续区块间距完全一样也会读成「一坨」。
- **可读的状态**：只靠颜色区分的状态（进度、完成、跳过）必须同时有文字，颜色只是加强。

## 4. 交付之后

- 截图作为基线留在仓库里；下次改动先对比基线，差异要能解释。
- 真实宿主里的表现仍需用户确认，脚本通过不等于用户认可。

## 来源

- [Visual Regression as a Feedback Loop — Steve Kinney](https://stevekinney.com/courses/self-testing-ai-agents/visual-regression-as-a-feedback-loop)：截图不是 CI 保险，是 agent 唯一的「外观」反馈通道；组件级截图抓设计系统漂移；关动画、遮动态内容、固定环境才能稳定。
- [Anthropic frontend-design skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design)：先写 token 计划、先反 default tell、再实现、实现后截图自评。
- [Impeccable](https://github.com/pbakaus/impeccable)：62 条确定性 detector、把产品真相放 PRODUCT.md、视觉系统放 DESIGN.md、编辑后用 hook 扫。
- [Refactoring UI 的刻度体系](https://github.com/s0xDk/refactoring-ui-skill)：间距/字号/字重/圆角都从刻度取值，不要 ad hoc。
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)：焦点可见、命中区、空态与失败态、文案明确。
- [better-layout](https://github.com/asymmetric-al/core)：用间距而不是线来分组；组间至少是组内的两倍；所有内容对齐到少量共同边。
