# 用户同意后的集中匹配记录

用户已明确纠正并授权：一期不能依靠用户手工导出，需同意后自动记录并回传，由我们集中汇总。按此执行，不再要求重复审批。

## 产品

默认关闭，首次不自动展开授权。用户首先通过反馈调整自己的方案；集中回传是可选参与，不把作者改进或未来通知当作已有收益。页头和反馈区可主动打开告知，再提供“同意并自动回传”“暂不同意”，不影响插件发现功能。告知发送经常见敏感模式清理的需求/方案/反馈摘要、候选与所选插件精确版本，用于集中改进匹配及向相关作者提供去标识汇总；不读取任务文件、完整会话或模型凭据，不直接发送原始需求字段。路径与凭据清理是启发式处理，不保证完全匿名。设置常驻，可停止回传；删除已回传记录有独立按钮和真实回执。没有实际安装观测则写unknown，主动反馈是用户报告。

不同意前零采集请求；仅采同意之后开始的新动作，不倒灌旧历史。操作开始锁定同意周期，保存前再次核验；关闭后旧周期不会因重新启用而复活。新反馈会带上所关联需求、方案的最小摘要及必要插件版本上下文，但不重传旧需求事件。首次保存反馈后可给一次非阻断说明；之后同意不会追溯上传刚保存的反馈。

## 集中协议 v1（根目录 src/telemetry-contract.js 为共享白名单）

POST /v1/register body {policyVersion,consentedAt,clientVersion,environment:'production'|'test'} -> {installationId,uploadToken,deleteToken}。随机匿名安装/同意周期身份，无客户端静态密钥。
POST /v1/events Authorization Bearer uploadToken body {schemaVersion:1,events:[...]} -> {acceptedEventIds:[...],receivedAt}。批量≤20、请求≤64KB；eventId全局幂等；严格字段和长度限制。
DELETE /v1/installation Authorization Bearer deleteToken -> {deleted:true}。撤销并删除事件；晚到旧token不可写。
GET /admin/summary、/admin/cases?plugin=…、/admin/creator-report?plugin=… 仅服务器ADMIN_TOKEN可读，不公开事件库。测试环境默认从正式汇总排除。90天保留，限制注册与写入，秘密不进源码/安装包。

事件 {schemaVersion:1,eventId,epochId,taskId,revisionId,type,occurredAt,clientVersion,hostVersion,data}。IDs均为遥测随机/HMAC关联，不发本机真实task/session/workspaceID。type为intent_confirmed、plan_generated、plan_selected、feedback_submitted、refinement_submitted、handoff_prepared。data白名单见共享模块：task需求摘要/能力/约束；plan类型/标题/理由/分工摘要；plugins name/version/commit/repository/sourceType/modelSelected/userSelected/installationStatus；feedback outcome/note/stage/evidence:'user_reported'；draftStatus。不包含README、nextPrompt或专用原始路径字段；摘要额外清理常见路径和文件名模式。

## 持久性与边界

待发送事件与revision/feedback同次task JSON写入，不假设storage-domain跨表事务。遥测同意/令牌/ACK用独立plugin_finder_telemetry v1域；不会改旧域。ACK另存且只按明确返回IDs确认；网络失败后台指数退避，重启从本周期尚未ACK事件补发，不扫描旧workflow补造事件。队列有容量限制且显示同步异常，不阻断主体功能。导出和导入剥离传输标记与ACK，恢复备份不触发采集。停止清除待发送资格并取消在途；删除离线显示待处理，不谎称完成。作者无自动外发；我们先获得受保护的按插件汇总。

## 验收

无同意零请求；同意后自动回传；关闭即时停止；断网重启补发且不重复；备份不倒灌；旧真实历史保留；数据清理样本不含路径/邮箱/密钥；公网写接口无读权限，admin未授权拒绝；测试数据与正式统计分开。当前本人真实历史保持默认未同意，先用明确标记的合成数据跑公网闭环，不替用户点同意。
