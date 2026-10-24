# Finder 自动首次安装验收记录

> 这是发布前的本机验收记录，已隐藏本机路径和会话身份。下文preview.10包的哈希对应当时本机验收包；公开发行包随后仅更新文档、署名及验证记录脱敏，运行文件保持一致。公开附件的校验值以 [v0.9.0-preview.10 的 SHA256SUMS](https://github.com/oxmumu3/dsh-plugin-finder/releases/download/v0.9.0-preview.10/SHA256SUMS)为准。

2026-10-24。现用 DeepSeek Harness Desktop 0.2.1-rc.2，desktop profile；通过它的官方 Host WebUI 验收，未冒充原生 Electron 窗口截图。

## 结论

首次安装缺口已补齐：自然语言描述 → 真实检索 → 点击一次「使用这个方案」 → Finder 自动安装并启用此前不存在的插件 → 原工作区直接执行 → 原页打开实际产物。本轮没有在管理器提前安装所选插件，也没有给执行模型追加人工指令。

最终现用版本为 **0.9.0-preview.10**，installed/enabled/active，57个发布文件与最终包逐字节一致。初次真实安装执行在preview.9完成；preview.10只补构建脚本许可的错误文案/409状态和版本信息，安装、执行实现保持不变。随后在preview.10刷新恢复、查看同一结果通过。未公开发布或push。

## 实际路径与证据

| 环节 | 本轮观察 |
| --- | --- |
| 安装前 | 官方listBundles中不存在dsh-tool-qrcode；未卸载已有插件制造首次安装 |
| 真实检索 | GitHub与Awesome公开目录live，完整目录6704条；已核对候选8个，所选dsh-tool-qrcode具有作者manifest证据。未核对全量，不能称穷尽市场 |
| 用户动作 | 输入目标并「帮我找方案」，方案出现后点击「使用这个方案」；不进入管理器 |
| 自动准备 | dsh-tool-qrcode@1.0.0，official installBundle applied，bundle enabled=true，entry include:tool-qrcode active |
| 顺序 | 06:52:33.637Z准备ready，06:52:33.957Z才发送首个模型请求 |
| 实际使用 | 模型调用qrcode_status、qrcode_plan、qrcode_make；无手工补装或追加执行消息 |
| 结果 | first-install-workspace/finder-first-install-20261024.svg，6858字节，296×296，纯矢量；Finder页内图片加载完成 |
| 独立验码 | macOS Core Image解码为 https://example.com/finder-first-install-20261024 ，完全匹配；未访问该网址 |
| 恢复 | 升级preview.10、刷新、继续原方案后同session/attempt/install request，seq129，首请求仍1次，工具调用不增加 |

原brief.md SHA256：`e3d165fe9298ad80b2adb3e13e8a703b6e3e060c4dbf6be09fc3d31902a8aa45`，未改变。
SVG SHA256：`4909d22f6c524cba2ab82026fb16497a97aa6772b4b457238a78ff6f9f13e463`。

执行身份：task `redacted-record-id`，workspace `redacted-record-id`，session `session-redacted-record-id`，attempt `redacted-record-id`，模型request `redacted-record-id`，安装request `redacted-record-id`。

模型额外尝试的Swift扫码校验两次卡住，模型自行取消并返回结果，耗时数分钟；这部分不能称快速或稳定。没有人工帮模型完成收尾。其正文如实说未扫码回读；验收代理另外以现成Pillow栅格化、macOS Core Image独立解码通过，不能混为模型自身完成。插件默认输出到profile目录，模型自动复制到工作区；最终简短说明在会话中，未要求用户复制。

## 实现与校验

安装从提示词中的希望，改为服务端可核实步骤：使用已保存方案的精确来源，先持久化安装claim，再通过官方管理器安装/启用，核对准确bundle、entry和active后才允许模型请求。未知结果恢复不盲重装；并发合并、取消、组合部分成功、历史导入权限和旧会话恢复均有测试。构建脚本许可、来源冲突、需重启等真实障碍原页准确提示，不自动越权或假装完成。

全套 **651/651** 通过，无跳过；生产build通过；独立审查完成。实现commit `3dc4b71`，最终错误提示/版本commit `ade8831`。57文件源码/打包/安装一致。

最终包：`dsh-plugin-finder-0.9.0-preview.10.tgz`，2,407,458字节，SHA256 `cc903342ca2df46180a4f6bc04708e89b831fe8f372ee6042251b098fd263953`。中间preview.9包和原验收证据也保留，未覆盖历史附件。

## 历史、草稿与运行边界

升级前私有备份：`<local-home>/Documents/Codex/backups/dsh-plugin-finder/2026-10-24/desktop-before-preview9`，manifest SHA256 `ee571122ec513de20bd191b2532a032a8c778d3496db0f76ecb7a4531ef96705`。

最终独立审计：原8任务serialized 8/8完全一致，23修订、4feedback、3handoffs、1Creator关联、3执行记录、1旧域feedback全部原样保留；当前9任务只新增本轮验收。23个草稿键（21会话+2Finder）完整二进制键/值一致，原LevelDB文件也一致。阶段审计因执行期间历史文件变化记为不通过稳定性检查，最终静态复核才计通过，未隐去阶段报告。

原Desktop PID90087、Host PID90115保留，无宿主重启、系统代理/SSRUN/WARP修改、微信客户端操作。选中插件安装作用于desktop profile；任务与文件绑定当前workspace，不能声称插件安装为workspace隔离。所选QR插件保持安装可用。

本轮现场证明一个npm来源插件的首次安装使用；固定commit Git、组合失败恢复等有单测，不把它们说成所有插件现场验收。未知tarball/本地来源不自动安装，真实额外许可/版本冲突仍会暂停说明。创建路径沿用上一轮preview.8真实Creator创建/安装/计数/撤销/刷新证据，本轮专项补首次安装，没有重新制造另一个创建插件。首页对齐、精选、六类商店未改。

本地完整报告和证据在Agent/output/dsh-plugin-finder-first-install-2026-10-24/，私有原始本轮会话留在上述备份目录旁的first-install-acceptance-private，不混入公开资料。历史设计、旧HTML、公告及文章草稿保留。本次没有承诺任意组合或长期稳定性。
