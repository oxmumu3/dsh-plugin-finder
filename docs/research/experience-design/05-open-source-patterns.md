# 两个 AI 界面开源项目的源码核对

2026-10-23。独立代理通过 GitHub connector 只读获取 canonical 元信息、固定commit的README、许可及少量相关源码；未clone、运行、安装或修改上游代码。此补充将 [研究综合](03-research-synthesis.md) 中的界面范式与具体实现对应，不是换栈建议或可用性测试。

## 固定版本与许可

| 项目 | 核对版本 | 实际许可范围 |
|---|---|---|
| `ant-design/x` | [`fc3a0cc7f35993dbb1ea3f792e4ba978a7294ed1`](https://github.com/ant-design/x/commit/fc3a0cc7f35993dbb1ea3f792e4ba978a7294ed1)，2026-10-12 | 根API返回license=null且根目录无LICENSE；直接读取 [packages/x/LICENSE](https://github.com/ant-design/x/blob/fc3a0cc7f35993dbb1ea3f792e4ba978a7294ed1/packages/x/LICENSE) 与 [packages/x-sdk/LICENSE](https://github.com/ant-design/x/blob/fc3a0cc7f35993dbb1ea3f792e4ba978a7294ed1/packages/x-sdk/LICENSE)，均为MIT。不能将根字段空值误报为无许可。 |
| `assistant-ui/assistant-ui` | [`e4564a484574ac74127bc905abdcb609a7418cd5`](https://github.com/assistant-ui/assistant-ui/commit/e4564a484574ac74127bc905abdcb609a7418cd5)，2026-10-23 | 根 [LICENSE](https://github.com/assistant-ui/assistant-ui/blob/e4564a484574ac74127bc905abdcb609a7418cd5/LICENSE) 为MIT。 |

已读固定版本 [Ant README](https://github.com/ant-design/x/blob/fc3a0cc7f35993dbb1ea3f792e4ba978a7294ed1/README.md) 与 [assistant-ui README](https://github.com/assistant-ui/assistant-ui/blob/e4564a484574ac74127bc905abdcb609a7418cd5/README.md)。本轮不复制其组件源码，仅借鉴状态与组件组织。

## 三个可落实的参考

### 1. 等待、中止、失败、重试属于同一个任务生命周期

Ant官方 [openai-callback.tsx](https://github.com/ant-design/x/blob/fc3a0cc7f35993dbb1ea3f792e4ba978a7294ed1/packages/x/docs/x-sdk/demos/x-chat/openai-callback.tsx#L144-L166) 用 `requestPlaceholder` 展示等待，`requestFallback` 区分AbortError与其他失败，中止时保留已有内容。[消息与操作](https://github.com/ant-design/x/blob/fc3a0cc7f35993dbb1ea3f792e4ba978a7294ed1/packages/x/docs/x-sdk/demos/x-chat/openai-callback.tsx#L257-L298) 使用消息id/status，重试针对具体消息；输入与中止共享isRequesting/abort状态。

Finder对应：保留原请求与已返回内容，取消或重试回到同一任务；错误块里提供恢复，不能只弹笼统toast。具体后端是否真的取消、重试是否幂等，仍需自己的接口验收。

### 2. 先按语义区分解释、过程和成果

assistant-ui官方 [assistant-message-gui.tsx](https://github.com/assistant-ui/assistant-ui/blob/e4564a484574ac74127bc905abdcb609a7418cd5/examples/with-generative-ui/components/assistant-message-gui.tsx#L123-L184) 用GroupedParts区分文本、reasoning、tool-call和generative-ui。普通工具可分组，专用交互结果独立呈现。

Finder对应：对话解释、检索状态和可操作方案不应全部成为聊天长文，也不应全部藏在过程日志。方案拥有自己的持续状态。**本轮不采用暴露内部思维链的做法**；前端只显示真实可公开的请求状态与来源。

### 3. 动态界面有受控组件、降级和操作回流

同一源码通过 [componentsAllowlist与UnknownComponentFallback](https://github.com/assistant-ui/assistant-ui/blob/e4564a484574ac74127bc905abdcb609a7418cd5/examples/with-generative-ui/components/assistant-message-gui.tsx#L52-L58) 约束组件，[工具降级与错误](https://github.com/assistant-ui/assistant-ui/blob/e4564a484574ac74127bc905abdcb609a7418cd5/examples/with-generative-ui/components/assistant-message-gui.tsx#L172-L190) 和 [Reload](https://github.com/assistant-ui/assistant-ui/blob/e4564a484574ac74127bc905abdcb609a7418cd5/examples/with-generative-ui/components/assistant-message-gui.tsx#L215-L234) 分别呈现。补读的 [contact-form-tool-ui.tsx](https://github.com/assistant-ui/assistant-ui/blob/e4564a484574ac74127bc905abdcb609a7418cd5/examples/with-generative-ui/components/contact-form-tool-ui.tsx#L19-L44) 与其 [提交动作](https://github.com/assistant-ui/assistant-ui/blob/e4564a484574ac74127bc905abdcb609a7418cd5/examples/with-generative-ui/components/contact-form-tool-ui.tsx#L79-L87) 展示了参数→控件→addResult→结果回流。

Finder对应：模型只提供验证过的结构化数据，由现有受控React组件渲染；按钮与编辑回到对应task/version，而不是界面上换标签后后端仍保持旧方案。不能把允许列表机制本身当成完整安全隔离的证明，也不直接执行模型HTML。

## 不能由这些材料推出什么

源码只证明固定版本中有这些组织方式，不能证明Finder适配成本、性能、可访问性、用户满意度、安全隔离、持久化或重试可靠性。没有运行上游示例，没有进行用户测试；不因为读到新组件库就替换当前React/Host集成。
