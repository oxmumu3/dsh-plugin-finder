# 安装、首次使用与卸载

本次发布版本为 `0.10.0-preview.4`，公开预览版。使用以下固定版本来源，已有历史、输入和原生草稿继续保留。

- [版本说明与附件](https://github.com/oxmumu3/dsh-plugin-finder/releases/tag/v0.10.0-preview.4)
- [安装包 dsh-plugin-finder-0.10.0-preview.4.tgz](https://github.com/oxmumu3/dsh-plugin-finder/releases/download/v0.10.0-preview.4/dsh-plugin-finder-0.10.0-preview.4.tgz)
- [SHA256SUMS](https://github.com/oxmumu3/dsh-plugin-finder/releases/download/v0.10.0-preview.4/SHA256SUMS)

## 兼容范围

| 官方 DSH 版本 | 本版能力 |
|---|---|
| `0.2.1-rc.2` / `0.2.1-rc.3` | 分类浏览、搜索、历史，以及在当前工作区执行方案和启动官方 Creator。实际结果以本轮验收记录为准。 |
| `0.2.0-rc.2` | 分类浏览、搜索和历史；不支持本版直接执行。 |
| 其他或无法识别的版本 | 尚未确认兼容，不把安装成功当作执行能力已支持。 |

包声明要求 Node `>=22.13`。Finder 沿用宿主已配置模型，不需要另外填写模型 Key。已在现用 Desktop `0.2.1-rc.2` 验证一个此前未安装的 npm 插件自动安装并使用；创建路径沿用 preview.8 的真实 Creator 验收。历史与场景边界见[当前工作区流程](workspace-flow-preview.md)。

## 安装或更新 Finder

在正在使用的 DSH 原生「插件 → 添加插件」中，粘贴以下完整来源：

```text
https://github.com/oxmumu3/dsh-plugin-finder/releases/download/v0.10.0-preview.4/dsh-plugin-finder-0.10.0-preview.4.tgz
```

按宿主提示核对包名、兼容诊断并安装／更新、启用，确认实际显示 `0.10.0-preview.4`，再打开侧栏「发现好插件」。首页显示需求输入；「历史方案」保留原任务及各版本。也可先下载包，使用 Release 的 `SHA256SUMS` 核对后，填入安装包在**宿主机器**上的完整路径。重要历史可先从「历史方案」导出备份。

CLI 管理的宿主可使用以下命令，将 `your-profile` 换成真实目标：

```sh
dsh plugin --profile your-profile add "https://github.com/oxmumu3/dsh-plugin-finder/releases/download/v0.10.0-preview.4/dsh-plugin-finder-0.10.0-preview.4.tgz"
```

Desktop 与终端同名 `dsh` 可能来自不同安装，优先使用当前应用的原生插件页。不为升级另建无关 profile，不清除 `plugin_finder_history` 或会话草稿；重启和激活要求以目标宿主提示为准。

## 第一次使用

1. **输入需求，点「帮我找方案」。** 系统连续理解、搜索和组织方案；需要调整时补充一句话，原版本仍保留。
2. **方案合适，点「使用这个方案」。** 这会授权安装、启用方案中的插件并执行任务。Finder 自动完成所选插件的首次安装，确认已加载后在当前工作区执行，进度和结果留在本页，无需再去插件管理器。额外构建脚本许可等真实授权仍按宿主提示处理。
3. **方案不满足，点「创建自己的插件」。** 沿用已有需求，只补关键缺项；点「开始创建」后由官方 Creator 在同一工作区执行。

当前会话所属工作区或唯一工作区可作为可靠目标，系统自动沿用；无法可靠判断时才显示选择。主路径不要求复制材料、切换项目或手动发送准备好的草稿。插件安装作用于当前 Harness profile，任务和结果绑定当前工作区。已有同来源同版本插件直接复用；遇到版本冲突、来源无法确认、需重启或额外许可时说明真实原因，不擅自替换。重新打开任务只恢复原执行关联并观察，不重复提交。

首页右侧先给一个具体场景：没有偏好依据时为「试试这个」，有本机依据时为「猜你喜欢」。精选下方还有六类插件目录，每类先展示三个，展开可搜索全量。点「查看使用方案」会核对所选来源，再进入使用流程；目录浏览不调用模型或安装插件，不需要切换导航标签。详情见[当前工作区流程](workspace-flow-preview.md)。

## 搜索、费用与记录

来源失败或 GitHub 限流不等于没有插件；所有来源不可用时应修复网络问题后重试。公开索引与 JSON 使用 5 分钟内存缓存，宿主市场缓存由宿主管理。候选作者声明和资料读取不等于功能已验证。

需求理解、推荐及执行沿用宿主模型与账户额度。首屏不调用模型；匹配通常调用模型两次，修改、重试和执行会有后续调用。查询词用于外部搜索，需求和候选资料会交给宿主配置的模型；第三方服务可能另有账号、授权或费用。

本机保留任务、历史版本、反馈和精确执行关联。新需求不删除旧内容；单任务 JSON 可导出／导入，分享前检查其中的私人信息。每任务业务历史上限为 8 MB，达到上限会报错并保留旧版本，不静默裁剪。

集中摘要回传默认关闭，不影响搜索、执行和本机历史。明确同意后只处理后续新操作，不批量补传历史；共创及其派生记录只存本机。停止回传不自动删除已收到的记录，删除以服务端确认作为依据。完整范围见[数据回传说明](data-sharing.md)。

## 常见卡点

| 现象 | 处理方式 |
|---|---|
| 未出现侧栏入口或仍是旧版 | 在当前宿主插件页核对实际安装、启用版本及激活诊断；其他 profile 的安装不会自动出现在这里。 |
| 没有默认模型 | 配置宿主全局默认模型，再通过「更多」重新读取配置。 |
| 全部搜索来源失败 | 保留需求，核对网络并重试；不能据此判断生态没有合适插件。 |
| 某来源限流、README 缺失或版本不一致 | 查看覆盖不足与未知项，必要时核对作者资料；不把未验证部分写成已支持。 |
| 执行不可用 | 核对是否为官方 `0.2.1-rc.2` 及必要宿主服务是否可用；旧版仍可查看历史和搜索。 |
| 当前工作区无法确定 | 选择真实目标。已有执行关联继续绑定原工作区，不自动换成另一个项目。 |
| 重开任务后执行状态未知 | 接回原记录核对状态；Finder 不自动重发同一执行请求。 |
| 原执行工作区或会话不可用 | 保留历史关联并核对目标，不能把新建会话当作原任务已经恢复。 |
| 会话结束但结果不符合需求 | 按实际产出判断，继续补充需求或创建自己的插件；该轮结束不是功能验收。 |
| 点了停止 | 核对宿主实际停止状态；已经完成的文件修改或其他操作不会因此撤销。 |
| 本机保存成功但集中同步异常 | 本机保存不等于服务端收到；查看回传状态及具体错误。 |

## 历史公开下载：0.3.0-preview.2

以下链接只对应历史公开包，不包含 0.8 的工作区执行流程。旧版使用原生会话的未发送草稿接续，由用户检查后发送；这段历史行为不作为当前版本操作说明。历史安装与实跑证据保持原样，不替代本版验收。

- [历史 Release、附件与校验记录](https://github.com/oxmumu3/dsh-plugin-finder/releases/tag/v0.3.0-preview.2)
- [历史安装包 dsh-plugin-finder-0.3.0-preview.2.tgz](https://github.com/oxmumu3/dsh-plugin-finder/releases/download/v0.3.0-preview.2/dsh-plugin-finder-0.3.0-preview.2.tgz)

需要安装该历史版本时，在原生插件管理器填入上述精确安装包来源，核对兼容诊断后按宿主提示安装。CLI 管理的目标应使用匹配版本的官方 CLI，并将 `your-profile` 替换为实际 profile：

```sh
dsh plugin --profile your-profile add "/absolute/path/dsh-plugin-finder-0.3.0-preview.2.tgz"
```

`--profile` 位于 `add` 之前。Desktop 使用应用管理的保留 profile，普通 CLI 可能拒绝管理；此时使用原生插件页，不绕过版本或 profile 检查。参数依据官方[打包与安装插件](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/user/develop/basic/publish.zh.md)和[CLI 行为参考](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/cli/reference/README.zh.md)，实际帮助与管理器提示优先。

## 卸载与升级

在 DSH 原生插件页找到 `dsh-plugin-finder`，按宿主提示停用、卸载或升级。CLI 管理的实际 profile 可使用：

```sh
dsh plugin --profile your-profile remove dsh-plugin-finder
```

本机领域数据独立于安装包，停用或卸载不代表历史已删除。当前提供单任务导出／导入，不提供历史永久删除入口。卸载也不代替集中记录删除；如需删除已回传记录，先在插件内申请并等待服务端确认。离线待删除时保留插件和本机状态，以便重试。

需要公开反馈时可到 [GitHub Issues](https://github.com/oxmumu3/dsh-plugin-finder/issues) 提供版本、复现步骤及预期／实际结果，分享前检查日志和截图中的敏感内容。
