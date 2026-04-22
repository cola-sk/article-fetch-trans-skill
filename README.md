# article-fetch-trans-skill

本仓库是一个本地文章抓取与翻译 Skill，目标是通过已登录浏览器提取正文并生成中文 Markdown 文件。

## 核心功能

- 使用 `browser-harness` 在有登录态的 Chrome 中打开文章
- 从浏览器 DOM 提取并清洗正文（优先 `article/main`）
- 将正文整理为 Markdown 友好结构
- 调用本地 OpenAI 兼容接口翻译为中文
- 输出到当前目录，文件名由文章标题按 `-` 连接生成

## 目录说明

- `scripts/translate-article-skill.mjs`：核心运行脚本
- `SKILL.md`：本地 Skill 的说明与输入输出规范

## 快速使用

```bash
SKILL_DIR="/abs/path/to/article-fetch-trans-skill"
node "$SKILL_DIR/scripts/translate-article-skill.mjs" <article-url>
```

示例：

```bash
SKILL_DIR="/abs/path/to/article-fetch-trans-skill"
node "$SKILL_DIR/scripts/translate-article-skill.mjs" https://x.com/akshay_pachaar/article/2041146899319971922
```

## 参数说明

```bash
node "$SKILL_DIR/scripts/translate-article-skill.mjs" <article-url> [outputFileName] [--baseUrl=http://localhost:3001/v1] [--model=gpt-5-mini] [--timeoutMs=120000]
```

- `article-url`：要抓取的文章页面地址
- `outputFileName`：可选输出文件名；不传时按文章标题自动生成
- `--baseUrl`：本地 OpenAI 兼容服务地址，默认 `http://localhost:3001/v1`
- `--model`：调用的模型名，默认 `gpt-5-mini`
- `--timeoutMs`：browser-harness 运行超时（毫秒），默认 `120000`

## 输出结果

- 默认保存到当前目录
- 文件名由文章标题清洗后按 `-` 连接，包含 `.md` 后缀
- 输出内容为纯 Markdown，不带额外说明文本

## 本地 Skill 安装（可选）

如果你使用 `skills` CLI，可以将当前仓库作为本地 Skill 安装：

```bash
cd article-fetch-trans-skill
npx skills add . -g -y
```

也可以从 Git 仓库直接安装：

```bash
npx skills add git@github.com:cola-sk/article-fetch-trans-skills.git -g -y
```

安装完成后，可通过 Skill 运行或直接执行脚本。

## 依赖说明

- Node.js 18+
- 本地 OpenAI 兼容服务（例如 `http://localhost:3001/v1`）
- 必须安装 `browser-harness`：https://github.com/browser-use/browser-harness

## 工作流程

1. 获取需要翻译的文章 URL
2. 用 `browser-harness` 在有登录态浏览器中打开页面
3. 从 DOM 读取并清洗正文，生成干净文章
4. 调用本地 OpenAI 兼容接口翻译
5. 将翻译内容保存为当前目录下的 Markdown 文件（标题用 `-` 连接）

## 脚本路径说明

- 建议通过 `node <skill_dir>/scripts/translate-article-skill.mjs ...` 运行，避免不同工作目录下相对路径失效。
- `skill_dir` 一般可取 `SKILL.md` 所在目录。

任意目录执行示例：

```bash
SKILL_DIR="/abs/path/to/article-fetch-trans-skill"
node "$SKILL_DIR/scripts/translate-article-skill.mjs" "<article-url>"
```

## 常见问题

- 如果出现 `PermissionError: [Errno 1] Operation not permitted`，说明当前执行环境无权访问 `/tmp/bu-*.sock`，需要在可访问本机浏览器会话的权限下重试
- 如果出现 `RuntimeError: no close frame received or sent`，先重启 harness daemon：
```bash
browser-harness <<'PY'
from admin import restart_daemon
restart_daemon()
PY
```
- 如果出现 `CDP WS handshake failed: HTTP 403`，打开 `chrome://inspect/#remote-debugging` 并在 Chrome 授权弹窗中点击 `Allow`
- 如果默认会话反复异常，可切换会话名执行：`BU_NAME=work node "$SKILL_DIR/scripts/translate-article-skill.mjs" <article-url>`
- 如果页面提取为空，可提高 `--timeoutMs`（如 `180000`），并确认目标页面在当前登录态下可见正文
- 如果文件名被识别为通用标题（如 `X.md`），可通过传入 `outputFileName` 指定输出文件名
- 翻译失败时，请确认 `--baseUrl` 指向可用的本地服务
- 输出文件名若包含非法字符，会被自动清理为合法文件名

## 贡献与扩展

欢迎在 `scripts/translate-article-skill.mjs` 中扩展：

- 支持更多 HTML 内容提取策略
- 增加 `--skipTranslate` 选项，仅导出提取后的 Markdown
- 兼容更多 OpenAI API 版本或本地模型服务
