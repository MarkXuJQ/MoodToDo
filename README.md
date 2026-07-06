# Layered Todo

离线优先的打卡日记、Todo 和情绪复原指数记录工具。当前版本是最小可运行 PWA：macOS 可在浏览器运行，Android 可通过 Chrome 打开并安装到桌面。

## 当前能力

- 记录每日打卡日记、心情描述、标签和本地图片附件。
- 添加、完成、删除当日 Todo。
- 使用自定义 `MES 情绪复原指数` 将心情描述量化为 0-100 分，并保存晴朗度、负荷度、能量感、修复感、反思度等组成项。
- 使用 IndexedDB 做本地持久化，图片以 Blob 存入 `attachments` 表。
- 使用 `changes` 变更日志记录本地写入，为后续 WebDAV 增量同步预留结构。
- 统计记录按 `月份 -> 周 -> 日期` 展示，不把每天记录铺平成单层列表。

## 数据结构

IndexedDB 数据库名：`layered_todo_local`

- `entries`：每日记录，包含日期、正文、心情文本、MES 分析结果和标签。
- `todos`：每日事项，包含完成状态和完成时间。
- `attachments`：本地附件，包含图片 Blob、文件名、类型、大小和关联日记。
- `changes`：同步队列，包含实体类型、实体 ID、操作、设备 ID、时间和快照。

后续 WebDAV 同步可从 `changes` 表生成远端增量包，并把图片附件按 `attachments/{id}` 存储。

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
gh repo create todo --private --description "Offline-first layered todo journal with local mood metrics." --source=. --remote=origin --push
```
