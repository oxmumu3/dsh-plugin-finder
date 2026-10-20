# 补齐原设计的我的方案与历史方案

这是已确认原型的实现遗漏修复，不是重新定义产品。原型 `plugin-finder-prototype-v1/index.html` 有“找方案 / 我的方案”内部导航，`app.js` 有历史回看和调整方案后保留原历史的行为；真实首版只做了单个 `workflow.current`，新分析覆盖它，新需求直接删除它。

## 用户行为

- “找方案”继续原有三步流程；“我的方案”展示本机历史任务，含时间、需求、方案、结果与版本，可以回看并继续。
- “新需求”只切到空白需求，不删除任何已有任务、版本、反馈或 DSH 会话。保存失败不清空当前屏幕。
- 当前方案可以保存结果反馈，也可以填写“哪里不合适 / 希望怎样调整”后继续优化。优化重新理解反馈，回到可核对的需求，再重新检索；旧推荐与反馈保留为旧版本。
- 恢复历史不调用模型、不联网重搜、不安装或发送。历史接续保存精确工作区与会话 ID；“继续原会话”只打开它，不重新注入草稿。
- 提供当前任务 JSON 导出、本机备份导入；导入幂等并标明恢复来源，不覆盖当前新需求，不把后来人工替代方案冒充旧推荐。

## 数据与接口

保留原 `plugin_finder` v1 的 workflow 与 feedback 不做破坏性 schema 改写。新建独立 `plugin_finder_history` v1 领域，tasks 表为 `{id,serialized}`，每条序列化任务内含元数据和不可变的理解/方案版本、反馈与会话接续信息；global 为 `{activeTaskId:null,activeRevisionId:null}`。每任务有明确容量上限，超出时拒绝写入并保留旧记录，不静默淘汰。先持久任务、后切活动指针。旧格式2 current 如存在则幂等迁移；当前用户已清空的旧推荐用完整 checkpoint 显式导入为“从备份恢复”。旧反馈无关联不猜配。

服务响应的 `workflow` 含旧字段及 taskId/revisionId/revisionNumber、createdAt、updatedAt、feedback、handoff、revisions 摘要；`history` 为任务摘要数组，另含 historyTotal。服务增加 history/open/refine/handoff/import/export；客户端始终带精确 taskId/revisionId，旧标签页不能静默写入另一任务。

验收：A→新需求→B→重载仍能回看 A；A反馈→调整→新版本仍能读旧版与反馈；重载后能打开精确原会话且不注入；旧 current 迁移及 checkpoint 重复导入不重复/覆盖；存储失败不宣称已保存且不清屏；来源 URL 凭据过滤仍生效；现有动态搜索与安装边界保持。
