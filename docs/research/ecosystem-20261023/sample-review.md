# 首页18项作者资料核验

用途不同且资料可读的代表入口，不是热门排名。只读作者README，无安装、执行、登录或私人数据访问。作者原文快照已忽略，不纳入可提交资料或安装包；保留URL、时间、hash和下表短结论。

| 分类 | 用途与作者来源 | 核验边界 |
|---|---|---|
| work | [把待办放进项目看板，手动或定时推进](https://github.com/cloader/dsh-taskboard) | 作者README明确任务看板、按项目绑定、手动与定时执行；人工验收与任务执行分开。未安装此插件。 |
| work | [从 Zotero 找论文、笔记和可引用的证据](https://github.com/Vncntvx/dsh-zotero) | 作者README明确通过本机Zotero API检索文献、PDF、笔记与引用；需Zotero桌面端，写入另有确认，可选学术联网组件默认关闭。 |
| work | [下载邮箱发票并整理报销汇总](https://github.com/EthanYoQ/Invoice-Downloader/tree/main/plugins/dsh-invoice-downloader) | 子目录README支持本地IMAP发票下载、OCR与Excel汇总；需Python 3.10+和首次联网安装引擎，OCR文本默认交给已选模型提取，不能说全链离线。 |
| content | [直接看 Markdown 图表、公式和表格](https://github.com/BioAIEvolu/dsh-md-studio) | 作者README明确Mermaid/KaTeX/GFM原生文件预览，渲染库随包；文档远程图片仍可能联网。此处仅核用途，不把其他阶段实跑移作全版本保证。 |
| content | [读取和生成 Word、Excel、PowerPoint](https://github.com/kw78/dsh-office-tools) | 作者README列出Word/Excel/PowerPoint读写工具；限会话工作区，PPT图片是链接而非嵌入，更新对含二进制部件的文档有限制。 |
| content | [用语音听写输入需求](https://github.com/PensiveFei/dsh-voice-scribe) | 作者README明确语音输入与草稿追加；浏览器Web Speech或外部ASR选择各有环境/数据前提，未核验识别质量。 |
| knowledge | [检索过去对话，并保留来源的本地记忆](https://github.com/ECNU/EduWork/tree/main/packages/dsh-memory) | 子目录README明确本地记忆与跨会话检索、管理、导入导出；0.2.0声明Node 24.18+及DSH 0.2.1-rc.2，不是所有宿主即装即用。 |
| knowledge | [把一句话补成目标明确的任务描述](https://github.com/benrong2048-boop/dsh-prompt-polish) | 作者README明确提示词润色、替换/发送/复制由用户选择，显示模型及token用量；这不是免费或无模型调用工具。 |
| knowledge | [围绕大纲、角色和审校推进长篇小说](https://github.com/lifangjin/dsh-maoying) | 作者README明确网文创作工作流、主编与五帮手、novel目录及面板；需要选择创作preset，不代表作品质量或全自动成书已验证。 |
| experience | [用简洁的全屏视图专注阅读回复](https://github.com/boogoo619/dsh-focus-overlay) | 作者README明确全屏阅读遮罩、工具过程折叠及共享输入草稿；属于阅读界面增强，不改模型能力。 |
| experience | [为任务安排专注和休息时间](https://github.com/yongfanbeta/dsh-pomodoro) | 作者README明确25/5/15可调专注/休息、任务关联、本地CSV；计时/统计并非任务实际完成的证明。 |
| experience | [切换舒适的明暗界面外观](https://github.com/Nwflower/dsh-claude-style) | 作者README明确Claude/DeepSeek视觉主题及明暗切换；许可标示MIT+PolyForm Shield，不将可见源码等同无条件开源。 |
| develop | [从手机接着使用 Harness](https://github.com/saya-ch/dsh-mobile) | 作者README明确手机连接电脑Harness；原生App仅Android，浏览器路径另行支持，需设备/网络配置。 |
| develop | [只读查看 Git 或 SVN 的文件差异](https://github.com/f-e-n-g-0531/dsh-vcs) | 作者README明确Git/SVN只读变更与历史；非商业许可，商业用途需另行书面授权。 |
| develop | [让 Agent 在可见浏览器中完成网页操作](https://github.com/Tencent/BrowserSkill/tree/main/packages/dsh-plugin-browserskill) | 子目录README明确bsk工具、Agent Window与实时页面；需bsk CLI和Chrome/Edge扩展连接，不是安装DSH插件就完成全部前提。 |
| manage | [查看模型花费与预算](https://github.com/Han-1413141/dsh-cost-meter) | 作者README明确会话花费、当日总量、预算及价格同步；当前README标1.9.30而目录版本1.9.26，记录此版本时间差，不把说明当该精确版本实测。 |
| manage | [把其他工具的对话历史迁入 Harness](https://github.com/Nwflower/dsh-chat-import) | 作者README明确从其他Agent导入会话后在DSH续聊；未读取任何用户会话，未验证各格式兼容性。 |
| manage | [核对并配置已有模型的上下文窗口](https://github.com/HOWILLMAKEIT/dsh-model-context-catalog) | 作者README明确从models.dev或CLIProxyAPI核对已配置模型上下文、选择后保存；默认保留已有容量，外部容量资料可能随时间变化。 |
