---
name: article-fetch-trans-skill
description: Extract an arbitrary article URL and translate it into Chinese Markdown using a local OpenAI-compatible service.
---

# Article-to-Markdown Skill

## 目标

将任意文章地址在已登录浏览器中打开、提取干净正文并翻译成中文 Markdown 文件。

## 输入

- `articleUrl`: 任意文章页面 URL
- `outputFileName`（可选）：输出文件名；不传时自动用文章标题生成
- `baseUrl`（可选）：本地 OpenAI 服务地址，默认 `http://localhost:3001/v1`
- `model`（可选）：使用模型，默认 `gpt-5-mini`
- `timeoutMs`（可选）：browser-harness 超时，默认 `120000`

## 输出

- 生成一个包含文章标题、元信息和翻译后正文的 Markdown 文件。
- 默认保存到当前目录（`process.cwd()`）。
- 默认文件名为：`文章标题` 清洗后按 `-` 连接，再追加 `.md`。

## 工作流程

1. 获取需要翻译的文章地址。
2. 使用 `browser-harness` 能力在有登录态的浏览器中打开该地址。
3. 从浏览器 DOM 提取正文候选区域并清洗，生成干净文章 Markdown 源文本。
4. 将文章内容发送到本地 OpenAI 兼容接口（`/chat/completions`）进行翻译。
5. 将翻译结果保存为 Markdown 到当前目录，文件名为文章标题（用 `-` 连接）。

## 脚本路径说明

- 建议使用 skill 目录的绝对路径执行脚本，避免因当前工作目录不同而找不到 `scripts/translate-article-skill.mjs`。
- 可将 `SKILL.md` 所在目录作为 `skill_dir`。

### 任意目录执行示例

```bash
# 已知 SKILL.md 绝对路径时：
SKILL_DIR="$(cd "$(dirname "/abs/path/to/article-fetch-trans-skill/SKILL.md")" && pwd)"
node "$SKILL_DIR/scripts/translate-article-skill.mjs" "https://example.com/article"
```

## 决策点

- 提取优先级：`article` > `main` > 常见内容容器（`article/post/content/blog/...`）> `body`。
- 清洗时移除 `script/style/nav/footer/aside/广告` 等噪声节点。
- 翻译失败时返回错误并附带服务响应摘要，便于排查。

## 完成标准

- 成功生成 `.md` 文件，默认文件名由文章标题按 `-` 连接生成。
- 文件内容包含文章标题、基本元信息以及完整的中文翻译文本。
- 输出为纯 Markdown，不包含额外解释。

## 故障排查

- `browser-harness failed ... PermissionError: [Errno 1] Operation not permitted`：
  当前运行环境无法访问 `browser-harness` 的本地 socket（`/tmp/bu-*.sock`），需要在允许访问本机浏览器会话的权限下重试。
- `RuntimeError: no close frame received or sent`：
  `browser-harness` 会话已失效，先执行 daemon 重启：

```bash
browser-harness <<'PY'
from admin import restart_daemon
restart_daemon()
PY
```
- `fatal: CDP WS handshake failed: HTTP 403`：
  打开 `chrome://inspect/#remote-debugging`，在 Chrome 弹窗中点击 `Allow`，然后重新执行。
- 默认会话仍异常时：
  可切换会话名重试（例如 `BU_NAME=work node <skill_dir>/scripts/translate-article-skill.mjs <url>`），避免复用损坏的默认会话。
- 页面提取到空内容：
  脚本已内置多次重试和 `main/body` 兜底；若仍失败，增大 `--timeoutMs`（如 `180000`）并确认目标页面已登录且可见正文。
- 标题被识别为通用值（如 `X`）：
  脚本会自动回退到 `h1/正文首行`；如仍不符合预期，直接传 `outputFileName` 覆盖文件名。

## 使用示例

```bash
node <skill_dir>/scripts/translate-article-skill.mjs https://x.com/akshay_pachaar/article/2041146899319971922
```

```bash
node <skill_dir>/scripts/translate-article-skill.mjs https://example.com/blog/post/123 --model=gpt-5-mini
```

```bash
node <skill_dir>/scripts/translate-article-skill.mjs https://example.com/post/123 --baseUrl=http://localhost:3001/v1 --timeoutMs=180000
```

默认输出到当前目录，文件名基于文章标题自动生成（`-` 连接）。

## 自定义扩展

- 增加 `--skipTranslate`，仅输出提取的纯 Markdown 文本。
- 兼容更多本地模型端点，如 `/responses` 或其他 OpenAI API 版本。
