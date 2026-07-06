# 心象仪

心象仪是一个离线优先的打卡日记、Todo 和心情模糊量化工具。当前版本是最小可运行 PWA：macOS 可在浏览器运行，Android 可通过 Chrome 打开并安装到桌面。

它的核心不是把每天的记录铺成平面流水账，而是把一句心情描述投影到一个可回顾的“心象空间”，生成分数、象限和关联线索。

## 当前能力

- 记录每日打卡日记、心情描述、标签和本地图片附件。
- 添加、完成、删除当日 Todo。
- 生成 `心象分`：将心情描述模糊量化为 0-100 分，并保存晴朗度、负荷度、能量感、修复感、反思度等组成项。
- 生成 `心象象限`：把今日状态归入高能舒展、高能紧绷、低能修复、低能承压四类。
- 提供总结页面：用月历热力图观察心象分、打卡状态和事项完成情况。
- 支持一周回顾：选择任意一周，查看心象均值、打卡天数、事项完成率和每日状态。
- 支持 OpenAI-compatible 大模型 API 生成周总结，API Key 只保存在本机浏览器 `localStorage`。
- 使用 IndexedDB 做本地持久化，图片以 Blob 存入 `attachments` 表。
- 使用 `changes` 变更日志记录本地写入，为后续 WebDAV 增量同步预留结构。
- 统计记录按 `月份 -> 周 -> 日期` 展示，不把每天记录铺平成单层列表。

## 心象算法

当前算法版本：`xinxiang-v0.2-lexical-vector`

当前最小版本先用词汇近似模拟未来的向量模型：

1. 从心情描述中提取晴朗、负荷、能量、修复、反思等信号。
2. 将信号投影为四维心象向量：`valence`、`arousal`、`resilience`、`clarity`。
3. 以 `valence` 和 `arousal` 划分象限，得到今天的大致心情状态。
4. 用 sigmoid 曲线将模糊向量压缩为 0-100 的 `心象分`，避免线性加减分过于僵硬。
5. 根据象限生成回顾提示，帮助后续关联 Todo、睡眠、运动、地点、人物和图片附件。

后续可把第 1 步替换为 word2vec 或 embedding：

- 以“心情原点”为中心，把文本向量投影到愉悦度、唤醒度、恢复力、清晰度等轴。
- 用历史记录微调每个用户自己的轴权重。
- 用相似日回顾找出重复模式，例如“高能紧绷后第二天低能承压”或“散步图片出现后修复感升高”。
- 用 WebDAV 同步本地变更日志和附件，保持跨设备的私有数据一致。

## 数据结构

IndexedDB 数据库名：`xinxiangyi_local`

- `entries`：每日记录，包含日期、正文、心情文本、心象分析结果和标签。
- `todos`：每日事项，包含完成状态和完成时间。
- `attachments`：本地附件，包含图片 Blob、文件名、类型、大小和关联日记。
- `changes`：同步队列，包含实体类型、实体 ID、操作、设备 ID、时间和快照。
- `weeklySummaries`：周总结缓存，包含周起始日期、模型、服务商、总结正文和更新时间。

后续 WebDAV 同步可从 `changes` 表生成远端增量包，并把图片附件按 `attachments/{id}` 存储。

## 大模型周总结

总结页内可以配置兼容 OpenAI Chat Completions 的接口：

- Endpoint 示例：`https://api.openai.com/v1/chat/completions`
- Model 示例：`gpt-4o-mini`
- API Key：只保存在当前浏览器本地，不写入 IndexedDB 同步队列。

生成周总结时，应用会把选中一周的日期、心象分、象限、心情描述、日记正文、标签和 Todo 完成状态发送给配置的接口。生成结果会存入 `weeklySummaries`，之后可以继续手动修改和保存。

## 开发

```bash
npm install
npm run dev
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
