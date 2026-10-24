# 精选目录身份与发行核对

核对日期：2026-10-22。目录统一 `checkedAt` 为 `2026-10-22T16:21:36Z`。本记录只证明以下来源和资产在核对时的状态，不证明插件安装、真实模型任务、手机送达或用户接受。

## 收录决定

| 产品卡片 | 核对版本 | 状态 | 依据与处理 |
| --- | --- | --- | --- |
| Agent Twin | `dsh-agent-twin@0.3.0` | available | 当前公开 owner 为 `oxmumu3`；实际下载精确 Release 资产，核对包内身份、兼容文档及 SHA-256。发行仍是 prerelease。 |
| 微信家庭助手 | `dsh-family-assistant@0.1.0-preview.4` | preview | 本机 README/package 明确为未公开本地预览。无公开同版本资产证据，`install:null`。 |
| DSH Dot | `dsh-project-companion@0.12.0-preview.1` | preview | 本机 README/package 与配套桥接说明；当前候选无已核对的同版本公开资产，`install:null`。 |
| Dot 连接 Harness | `dot-dsh-connector@0.3.0-preview.3` | private | 本机 README/package 明确为单人私有连接。`dot-dsh-management` 合入该卡；无公开发行证据，`install:null`。 |

本机来源仅阅读产品的 README、package 元信息；未读取家庭运行数据、凭据、私人聊天或业务文件。目录不包含本机路径。自研策展表达作者选择理由，不是官方收录或质量认证。

DSH Dot 的 `dsh-wechat@0.11.1-dot.2` 是基于社区插件的配套桥接，列为组件，不单独占一张卡。OpenAI Dot 和 DeepSeek Harness 是运行平台，不标为自研插件。

## Agent Twin 的公开 readback

优先调用 GitHub connector：仓库元数据返回 `oxmumu3/ai-twin-starter`、`visibility:public`、仓库 ID `1425173537`。同一 connector 的 releases GET 返回 `[]`，与后续无认证公开 GitHub REST 返回不一致；不据此断言没有发行。为核对这一差异，使用公开 HTTPS GET 读取一手 GitHub API，并实际下载公开资产；未使用浏览器、登录态或写操作。

| readAt (UTC) | 请求 | 结果 |
| --- | --- | --- |
| `2026-10-22T16:20:53.704224Z` | [公开 releases API](https://api.github.com/repos/oxmumu3/ai-twin-starter/releases) | HTTP 200；返回 `v0.3.0`、`v0.2.0`、`v0.1.0`，均为 prerelease、非 draft。 |
| `2026-10-22T16:20:54.443430Z` | [精确 tag API](https://api.github.com/repos/oxmumu3/ai-twin-starter/releases/tags/v0.3.0) | HTTP 200；release ID `417004231`，`published_at:2026-10-19T07:14:21Z`；包含下列两个精确资产。 |
| `2026-10-22T16:21:30.667349Z` | [dsh-agent-twin-0.3.0.tgz](https://github.com/oxmumu3/ai-twin-starter/releases/download/v0.3.0/dsh-agent-twin-0.3.0.tgz) | HTTP 200；实际读入 67,859 bytes；最终下载主机 `release-assets.githubusercontent.com`。 |
| `2026-10-22T16:21:32.934982Z` | [SHA256SUMS](https://github.com/oxmumu3/ai-twin-starter/releases/download/v0.3.0/SHA256SUMS) | HTTP 200；实际读入 91 bytes；校验条目与包一致。 |

资产信息：

```text
package asset ID: 655528257
package SHA-256: 8da2ee6b1132e9132fe7772dd2b3ba157c9dfe4d52d53cd360b1ed00c33c250b
SHA256SUMS asset ID: 655528254
SHA256SUMS SHA-256: 7407679000ff849657c8360637cda1d4bbfee0fa7fea628126b7895bc87c6517
```

包哈希同时匹配 Release API `digest` 与下载的 `SHA256SUMS` 内容。仅在内存中读取 tar 成员，未执行包、安装脚本或插件。包内 `package/package.json` 确认 `name:dsh-agent-twin`、`version:0.3.0`、仓库指向 `oxmumu3/ai-twin-starter`、Node.js `>=22`、peer `@deepseek-ai/dsh-tools:0.2.1-rc.2`。包内 `docs/dsh-install.md` 面向 Harness `0.2.1-rc.2`，明确通道只读探测、权限 dry-run、无自动外发或常驻服务；据此填写卡片前提和限制。

安装来源固定到 `v0.3.0` 与同版本 `.tgz`，不用 `/latest`。`available` 只表示该精确公开下载资产已读回；界面仍须应用时间有效性与版本匹配检查，复制来源不触发安装。此轮没有运行该插件或复验真实 Slack 授权、模型质量、服务在线状态。

## 其他条目的公开边界

以下公开 GET 只用于判断当前是否有可核对入口；404 可能表示不存在、不可公开访问或其他访问边界，不证明私人仓库不存在。

| readAt (UTC) | 请求范围 | 结果与目录决定 |
| --- | --- | --- |
| `2026-10-22T16:20:54.978325Z` | `api.github.com/repos/oxmumu3/dsh-project-companion` | HTTP 404；不生成该地址下的产品说明或安装链接。 |
| `2026-10-22T16:21:30.663980Z` | `api.github.com/repos/oxmumu3/dsh-family-assistant` | HTTP 404；保留 README 明示的本地预览状态。 |
| `2026-10-22T16:21:31.830326Z` | `api.github.com/repos/oxmumu3/dot-dsh-connector` | HTTP 404；保留 README 明示的单人私有接入状态。 |
| `2026-10-22T16:20:55.316370Z` / `2026-10-22T16:21:33.044806Z` | DSH Dot 本机旧 README 所指的历史 GitHub owner，仓库元数据 / releases GET | HTTP 200；公开最高 tag 为 `v0.6.0-preview.1`，与本机 `0.12.0-preview.1` 不同。历史 owner 和旧下载不进入新目录，未下载或重新验收旧包。 |

这三张卡片 `sourceUrls:[]`、`install:null`，通过卡片详情说明用途、前提、版本及证据边界。空来源列表表示没有适合公开展示的已核对产品入口，不用平台主页冒充产品来源。

## 数据契约与检查

导出 `featuredCatalog` 数组：

```js
{
  id: 'agent-twin',                 // 四个稳定产品 ID 之一
  title: '把项目经验整理成自己的 AI 分身',
  subtitle: 'Agent Twin · AI 分身',
  summary: '场景说明',
  why: '自研策展理由',
  audience: ['适用人群'],
  topics: ['twin'],                 // twin | family | projects | connections
  scenario: '可编辑的实际需求，保留必要的平台约束，不预选插件产品或包名',
  requirements: ['使用前提'],
  limitations: ['版本和验收边界'],
  components: ['dsh-agent-twin'],
  status: 'available',             // available | preview | private
  version: '0.3.0',
  checkedAt: '2026-10-22T16:21:36Z',
  sourceUrls: ['https://github.com/oxmumu3/ai-twin-starter/releases/tag/v0.3.0'],
  install: {                      // preview/private 均为 null
    spec: 'https://github.com/oxmumu3/ai-twin-starter/releases/download/v0.3.0/dsh-agent-twin-0.3.0.tgz',
    version: '0.3.0',
    verifiedAt: '2026-10-22T16:21:36Z'
  }
}
```

先运行新增六项测试，观察到 0/6 通过：目录缺失导致 `0 !== 4` 和缺少指定卡片，而不是语法或依赖错误。随后添加目录并简化测试导入，定向命令 `node --test test/featured-catalog.test.mjs` 验证六项通过。检查覆盖：四个唯一产品、必需解释字段、组件归组、通用场景草稿、精确公开安装资产与预览不可安装、公开 HTTPS 来源及无私有路径/身份凭据。

本记录不替代 owner 的全套回归、界面验收或后续发行核对。未 push、发布、安装、发送消息、操作微信客户端或修改网络配置。

审查修正：家庭助手与 DSH Dot 的场景草稿明确保留微信入口这一必要约束，避免检索将其他消息平台当成满足需求。新增相应断言后观察到 5/6 通过、平台约束测试失败；补齐两份场景后重新验证 6/6 通过。禁止以插件产品或包名预选检索结果，不等于删去用户场景所需的平台。
