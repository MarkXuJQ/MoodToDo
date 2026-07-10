# 心象仪

心象仪是一个离线优先的打卡日记、Todo 和心情模糊量化工具。当前版本是最小可运行 PWA：macOS 可在浏览器运行，Android 可通过 Chrome 打开并安装到桌面。

它的核心不是把每天的记录铺成平面流水账，而是从完整日记中提取真正有关的情绪线索，投影到一个可回顾的“心象空间”，再把这一天长成心象花园里的一株植物。

## 当前能力

- 在 localhost 直接运行，主数据落到本地 SQLite 文件：`data/xinxiangyi.sqlite`。
- 提供六个主界面：仪表盘、Todo 看板、心象花园、历史记录、回顾和设置。
- 记录每日打卡日记、标签和本地图片附件；新记录不再单独填写“心情描述”。
- 添加、完成、删除当日 Todo。
- 生成 `心象分`：将完整日记模糊量化为 0-100 分，并保存清晰度、负荷度、能量感、修复感、反思度等组成项。
- 生成 `心象象限`：把今日状态归入高能舒展、高能紧绷、低能修复、低能承压四类。
- 提供 `心象花园`：每天的日记只生成一株植物，心情象限决定天气和植物种类，诚实打卡固定获得基础成长，不因低落情绪减少奖励。
- 根据日记长度、复盘线索、完成 Todo 和图片生成少量成长加成，并提供连续打卡、低落时仍记录、象限收集等成就。
- 提供总结页面：用月历热力图观察心象分、打卡状态和事项完成情况。
- 支持一周回顾：选择任意一周，查看心象均值、打卡天数、事项完成率和每日状态。
- 支持 OpenAI-compatible 大模型 API 生成周总结，API Key 只保存在本机浏览器 `localStorage`。
- 设置页内提供系统总览、本地 SQLite 文件状态、统计卡片配置和 WebDAV/坚果云同步配置。
- 使用 SQLite 做本地持久化，图片先以 BLOB 存入 `attachments` 表。
- 提供心情折线图和随数据变化的圆环进度展示。
- 使用 `changes` 变更日志记录本地写入，为后续 WebDAV 增量同步预留结构。
- 统计记录按 `月份 -> 周 -> 日期` 展示，不把每天记录铺平成单层列表。

## 心象算法

当前算法版本：`xinxiang-v0.3-journal-vector`

当前最小版本先用词汇近似模拟未来的向量模型：

1. 从完整日记中提取清晰、负荷、能量、修复、反思等信号；普通叙述主要影响样本充分度，不直接抬高或压低分数。
2. 将信号投影为四维心象向量：`valence`、`arousal`、`resilience`、`clarity`。
3. 以 `valence` 和 `arousal` 划分象限，得到今天的大致心情状态。
4. 用 sigmoid 曲线将模糊向量压缩为 0-100 的 `心象分`，避免线性加减分过于僵硬。
5. 根据象限生成回顾提示，帮助后续关联 Todo、睡眠、运动、地点、人物和图片附件。

为了适应长日记，当前词法层会限制同一关键词的重复计数，跳过“没有压力”“不焦虑”等否定语境，并过滤“积累了”之类的中文子串误命中。没有明确情绪线索的普通日常叙述会保持在中性心象附近。

后续可把第 1 步替换为 word2vec 或 embedding：

- 以“心情原点”为中心，把文本向量投影到愉悦度、唤醒度、恢复力、清晰度等轴。
- 用历史记录微调每个用户自己的轴权重。
- 用相似日回顾找出重复模式，例如“高能紧绷后第二天低能承压”或“散步图片出现后修复感升高”。
- 当前先用 WebDAV 同步跨端 JSON 快照；后续再升级为基于变更日志的跨设备增量合并。

## 数据结构

SQLite 数据库文件：`data/xinxiangyi.sqlite`

- `entries`：每日记录，包含日期、日记正文、兼容旧数据的心情文本、心象分析结果和标签；新记录统一写入日记正文。
- `todos`：每日事项，包含完成状态和完成时间。
- `attachments`：本地附件，包含图片 BLOB、文件名、类型、大小和关联日记。
- `changes`：同步队列，包含实体类型、实体 ID、操作、设备 ID、时间和快照。
- `weeklySummaries`：周总结缓存，包含周起始日期、模型、服务商、总结正文和更新时间。

本地 SQLite 只负责当前设备的高效读写；WebDAV 不直接同步本机 `data/` 目录或裸 SQLite 文件，而是同步跨端快照。桌面端可生成一个独立的本地同步包目录：`sync/xinxiangyi-sync/`。后续增量同步可从 `changes` 表生成远端增量包，并把图片附件从 BLOB 拆到独立对象存储。

## 页面框架

- `今日台`：今日记录、今日 Todo、心象分、心情趋势和云同步入口。
- `心象花园`：把日记、心象向量、连续打卡、Todo 和附件推导为植物、成长阶段与成就。
- `日记浏览`：用年度热力图回看长期心象记录。
- `Todo`：独立事项看板，按过去、今天、以后、已完成组织推进状态。
- `总结`：月历热力图、一周回顾、大模型周总结。
- `设置`：系统总览、统计卡片配置、本地数据库、WebDAV 和游戏接口。

## 心象花园

花园不维护第二份独立游戏存档。植物、经验、阶段、天气和成就都由已有日记、心象向量、连续打卡、Todo 与附件实时推导，因此跨端同步后不会出现“日记已同步但游戏进度丢失”的分叉。

当前实现仍是日记成果可视化。下一版 Merge-3 养成系统已先进入策划阶段，尚未创建游戏存档或安装图形引擎；详细规则、经济系统、同步边界和技术路线见 [心象花园 Merge-3 养成游戏策划稿](docs/mind-garden-merge-game-design.md)。

- `低能承压`：守夜蕨，静夜细雨。
- `高能紧绷`：风铃草，有风的午后。
- `低能修复`：晨露芽，清晨薄雾。
- `高能舒展`：向阳花，晴光漫游。

每篇日记固定获得基础成长经验。心象分只改变植物与天气，不决定奖励多少；修改同一天的日记会重新计算这株植物，而不会重复种植。

## 大模型周总结

总结页内可以配置兼容 OpenAI Chat Completions 的接口：

- Endpoint 示例：`https://api.openai.com/v1/chat/completions`
- 基础网关地址也可直接填写：例如 `https://www.heiyucode.com`，本地代理会自动补成 `/v1/chat/completions`
- Model 示例：`gpt-4o-mini`
- API Key：只保存在当前浏览器本地，不写入 SQLite 同步队列。

生成周总结时，浏览器会先把请求发给本地 SQLite API，再由本地 API 转发到配置的模型接口。这样可以避开浏览器直接访问外部大模型接口时常见的 CORS / `failed to fetch` 问题。生成结果会存入 `weeklySummaries`，之后可以继续手动修改和保存。

## WebDAV / 坚果云同步

设置页提供 WebDAV 配置，今日台提供一个自动同步按钮：

- Server URL 默认：`https://dav.jianguoyun.com/dav/`
- Username：坚果云账号邮箱
- Password：坚果云应用密码
- Remote Path 默认：`/xinxiangyi-sync`

当前版本采用跨端快照同步，但界面不要求用户选择上传或拉取：

1. 本地有未同步内容时，自动生成跨端快照并上传 `xinxiangyi-native-snapshot.json` 与 `manifest-native.json`。
2. 本地没有未同步内容时，自动尝试下载远端 `xinxiangyi-native-snapshot.json`。
3. 桌面端仍可兼容导入旧版 `xinxiangyi.sqlite`，并会在导入后迁移生成跨端 JSON 快照。
4. 桌面端替换本地数据前会在 `data/.sync/` 保留一份本地备份。
5. 设置页可开启“打开后每天自动同步”，每天首次打开应用时执行一次。

不要把本机 `data/` 整个目录作为坚果云同步目录。`data/` 是某一台设备的本地工作区，里面可能包含 SQLite 主库、临时文件和备份。坚果云中建议只创建一个专用远端目录，例如 `/xinxiangyi-sync`，让应用通过 WebDAV 在里面维护同步协议文件。

桌面端设置页提供“生成本地同步包”按钮。它会把当前需要同步的文件整理到：

```text
sync/xinxiangyi-sync/
```

当前同步包包含：

```text
sync/xinxiangyi-sync/
├── xinxiangyi-native-snapshot.json
├── manifest-native.json
└── README.txt
```

手动上传或手动配置坚果云时，只需要上传 `sync/xinxiangyi-sync/` 这个目录里的内容。不要上传 `data/`、`data/.sync/` 或 `data/xinxiangyi.sqlite`。

当前先采用自用简单同步模式：

1. 在 Mac、Windows 或 Android 上编辑后，点击应用里的同步按钮上传当前设备快照。
2. 换到另一台设备时，先点击同步按钮拉取云端快照，再开始编辑。
3. 如果某台设备需要强制恢复云端数据，可以在设置页使用“从云端恢复”。
4. 当前阶段暂不做复杂冲突合并；如果多台设备同时离线编辑，最后上传的快照会成为云端版本。

这套方式适合单人多设备备份/恢复。它还不是实时增量同步，也不会处理“两个设备同时编辑同一天”的复杂冲突。后续要做真正多端同步时，再基于 `changes`、`updatedAt`、`deviceId`、`syncState`、附件哈希和远端 manifest 做合并策略。

## 开发

```bash
npm install
npm run dev
```

`npm run dev` 会同时启动本地 SQLite API 和 Vite 前端。默认数据库文件位于：

```text
data/xinxiangyi.sqlite
```

局域网调试 Android：

```bash
npm run dev -- --host 0.0.0.0
```

构建：

```bash
npm run build
```

## GitHub

本地仓库可以直接推到 private GitHub repo：

```bash
gh auth login -h github.com
gh repo create xinxiangyi --private --description "Offline-first mood-vector todo journal." --source=. --remote=origin --push
```
