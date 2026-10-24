# Awesome DSH Plugin 公开来源与许可审计

核查结论：这个社区目录明确以 CC0-1.0 发布目录数据，可作为候选发现来源；不能把它当作官方精选、插件质量保证或第三方素材的统一授权。`plugins.json` 的 6,565 条与 `index.json` 的 3,382 条属于不同生成范围。

本次只做公开 HTTPS GET、数据计数与静态源码阅读，没有运行下载到的代码，没有安装插件，也没有使用浏览器或私人资料。来源文件、精确 URL、抓取 UTC 时间、HTTP 状态、字节数及完整 SHA-256 见 [source-license-evidence.json](data/source-license-evidence.json)；原始证据在 [upstream/](data/upstream/)。

## 1. 来源身份与版本

- canonical 仓库：[awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，默认分支 `main`。
- 本次固定阅读的 commit：[`a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/commit/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff)。
- GitHub tree 回应未截断，包含 **6,565** 个 `data/plugins/*.yml` 条目文件。
- 网站快照抓取于 **2026-10-23 12:49:13–12:49:15 UTC**；仓库证据另于随后数分钟抓取。未读取部署日志来证明网站由该 commit 逐字节生成；条目数相同只是交叉核对，不替代构建来源证明。
- README 自称社区索引，并明确与 DeepSeek 无隶属关系。品牌名称和官方格式兼容不代表官方维护或官方审核。[声明](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/README.zh.md#L6748-L6754)

## 2. 两份 JSON 的范围

| 核对项 | 本次快照 | 含义 |
| --- | ---: | --- |
| `plugins.json.plugins` | 6,565 | 全目录条目；包括 npm 与 GitHub / Release 安装来源 |
| `index.json.plugins` | 3,382 | 可表达为该生产器的官方 format 1 市场索引的子集 |
| 全目录有 npm 映射 | 3,383 | 都有非空版本；不等于每条已入 format 1 索引 |
| 全目录无 npm 映射 | 3,182 | 在当前生产器中不会进入 `index.json` |
| 有 npm 映射但未入索引 | 1 | 具体跳过原因未确认 |
| 分类 | 23 | 编辑维护的功能分类，不是质量级别 |

`plugins.json` 生成链是 `data/plugins/*.yml` → 生成中英 README → `build-site.mjs` 解析并校验语言与分类一致性 → 对全部目录条目生成 JSON。语言缺项、重复或分类不一致会令构建失败，代码没有把这类错误悄悄过滤成较小的成功目录。[条目模型](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/lib/entries.mjs#L1-L27) · [README 解析与一致性](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/build-site.mjs#L104-L171) · [JSON 写出](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/build-site.mjs#L1117-L1177)

`index.json` 直接读取同一批 YAML 条目，合并 `data/npm-map.json`。每条必须有 npm 包名、确切版本、整数发布时间，并通过官方解析器校验；缺少任一字段或单条格式被拒绝，就跳过该条并计数。每条只输出缓存记录的一个当前版本，描述按语言截到约 160 字符，不是完整能力说明。[生成入口](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/build-index.mjs#L9-L41) · [生成与过滤规则](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/lib/market-index.mjs#L112-L156) · [描述截断](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/lib/market-index.mjs#L52-L95)

**这里“只收 npm”是该目录当前生产器的实现边界。** 源码说明 GitHub 条目未被表达，是因为它没有记录 Git 版本所需的 commit SHA；不能改写成“官方 format 1 不支持 Git”。本次实际索引所有版本的 `source.type` 都是 `npm`。[源码说明](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/lib/market-index.mjs#L1-L15)

唯一有 npm 映射却不在索引的条目是 `qinyre/dsh-plugin-archive-manager`，npm 名 `dsh-plugin-archive-manager`、目录版本 `0.3.0`。公开 `plugins.json` 没有发布时间字段，本次没有取得构建时的 npm 缓存和拒绝日志，因此只能确认缺项，不能断言它因缺发布时间、格式不合规、安全问题或维护者主动排除。未为这一条扩展抓取全生态。

`plugins.json.updated` 是所有条目 `added` 日期的最大值，本次为 `2026-10-22`，**不是抓取时间，也不是每个插件最近核查时间**。npm 版本、下载量、能力扫描各有来源和时间边界。[字段生成](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/build-site.mjs#L1119-L1173)

## 3. 收录、分类与更新机制

README 与贡献指南说明，条目由社区 PR 和维护者主动收录组成；主要要求包括 `dsh.bundle`、真实代码、仓库至少存在一天、维护状态、功能描述属实和分类贴合。CI 检查形式，维护者声称会阅读目标源码核对描述；本次只核查了这项公开政策，没有逐条验证评审是否发生。[README](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/README.zh.md#L35-L45) · [贡献要求与评审](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/contributing.md#L41-L107)

分类是 23 个稳定 ID，英文为基础语言，中文为对应展示名称；分类可拆分、改名或合并。它适合筛选和浏览，不应作为功能经过实测或质量优劣的证据。[分类定义](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/lib/entries.mjs#L12-L27) · [分类调整说明](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/contributing.md#L98-L102)

README 明确“不排名、不评判优劣”，并说明收录不等于安全审查。归档、消失、长期停更、明显缺陷的条目可经维护者处理移除；因此“收录数”不能换算为活跃、兼容、可安装或安全插件数。[收录说明](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/README.zh.md#L33-L45) · [评审边界](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/contributing.md#L79-L107)

npm 映射由探测器读取目标仓库的包名，再查询 npm registry；设计上要求 registry 的 repository 指回所收录 GitHub 仓库。实际实现是忽略大小写的 `repoField.includes(owner/repo)` 字符串包含检查，并非解析 URL 后严格核对 canonical owner；因此只能记为上游映射规则，不能当作我们已独立核实发行者身份或安全性。[npm 映射规则](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/probe-npm.mjs#L1-L28) · [比对实现](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/probe-npm.mjs#L112-L136)

构建工作流设置每日 `02:23 UTC` 探测；普通提交可使用缓存及时更新目录，npm 目录包在计划或手动构建时发布。因此 Pages、npm 镜像、版本和探测信息可能存在时间差，不能仅凭更新日期声称实时一致。[工作流](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/.github/workflows/build-site.yml#L1-L46) · [缓存与探测](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/.github/workflows/build-site.yml#L150-L233) · [npm 发布](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/.github/workflows/build-site.yml#L258-L287)

## 4. 许可：已证实与未覆盖

| 对象 | 本次可证实的范围 | 使用边界 |
| --- | --- | --- |
| 目录仓库本身 | 根 `LICENSE` 为 CC0 1.0 Universal；根 package.json 与 GitHub API 同样标为 CC0-1.0 | 这是维护者的许可声明；不等于已逐个清除所有外来权利 |
| `plugins.json` / `index.json` 目录分发 | 发布脚本把两份数据写进 `dsh-plugin-catalog`，复制根 LICENSE，显式声明 CC0-1.0；实时 npm 元数据也声明 CC0-1.0 | 有比“公开可下载”更直接的目录再利用依据；保留来源、快照和原插件归属，避免误导背书 |
| 网站源码 | 位于上述仓库；本次未发现额外的站点整体 LICENSE | 不能由此推定所有嵌入字体、图标、品牌、头像、截图均已转成 CC0 |
| 每个链接的插件代码、安装包、作者 README 和素材 | 作者各自提供；目录还单独输出第三方 README 文本并链接图片 | 必须分别核对原作者许可证或授权，目录许可证不会自动给第三方代码、全文和图片重新授权 |

根许可证的适用范围限定于声明者拥有的权利；第 4 节明确不放弃商标/专利权，不提供担保，也不负责为第三方权利取得许可。本审计据此区分目录许可与第三方内容许可，不作“整个插件生态都可任意复制”的结论。[根许可证](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/LICENSE#L32-L38) · [限制条款](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/LICENSE#L102-L121)

目录发布脚本是对数据范围最直接的证据：两份 JSON 同包导出，并复制 LICENSE。实时 npm 元数据本次返回 `dsh-plugin-catalog@2026.1023.9552`、许可 `CC0-1.0`；没有下载或执行这个包，也没有把该包内容认定为与网站快照完全一致。[发布脚本](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/publish-catalog.mjs#L98-L161) · [npm 元数据](https://registry.npmjs.org/dsh-plugin-catalog/latest)

## 5. 对本项目的落地含义

- 发现候选优先用全目录；官方市场索引用于可安装来源的补充，不能用它的较小数量判断其他条目不存在。
- 目录描述、分类、下载量、星标和能力扫描均保留来源与时间；“目录有记录”“已检查源码”“已运行”“符合用户需求”分开记录。
- 我们的“精选”另立可复核依据；不能把上游自称 curated 或收录标志直接显示为官方审核、质量排名或已验收。
- 可整理目录元数据与自己写的能力摘要；全文、截图、图标、头像及插件包的再分发按各作者许可单独处理。分析阶段保留原地址即可，不自动复制素材或安装代码。

## 6. 证据完整性

所有本次保存的原始响应均回算 SHA-256 和字节数，与抓取记录一致。`data/categories.yml` 的一次 404 查询也保留在记录中，但没有被用作分类依据；实际分类证据来自 `entries.mjs`、`locales.mjs` 与 JSON 元数据。本次未运行上游脚本或本项目测试，因为修改仅为研究证据与审计文档。
