#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

const USAGE = `Usage: node ${path.basename(__filename)} <article url> [outputFileName] [--baseUrl=http://localhost:3001/v1] [--model=gpt-5-mini] [--timeoutMs=120000]\n\nExample:\n  node ${path.basename(__filename)} https://x.com/akshay_pachaar/article/2041146899319971922\n`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const articleUrl = args[0];
let outputFileName = args[1] && !args[1].startsWith('--') ? args[1] : '';
const options = {};
for (const arg of args.slice(1)) {
  if (arg.startsWith('--baseUrl=')) {
    options.baseUrl = arg.split('=')[1];
  }
  if (arg.startsWith('--model=')) {
    options.model = arg.split('=')[1];
  }
  if (arg.startsWith('--timeoutMs=')) {
    options.timeoutMs = arg.split('=')[1];
  }
}

const DEFAULT_BASE_URL = 'http://localhost:3001/v1';
const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_TIMEOUT_MS = 120000;
const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
const model = options.model || DEFAULT_MODEL;
const browserTimeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

if (!Number.isFinite(browserTimeoutMs) || browserTimeoutMs <= 0) {
  console.error(`Invalid --timeoutMs value: ${options.timeoutMs}`);
  process.exit(1);
}

try {
  new URL(articleUrl);
} catch {
  console.error(`Invalid article url: ${articleUrl}`);
  process.exit(1);
}

function sanitizeFileName(value) {
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/['"`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'article';
}

function normalizeText(html) {
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, content) => `\n\n# ${stripHtmlTags(content)}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, content) => `\n\n## ${stripHtmlTags(content)}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, content) => `\n\n### ${stripHtmlTags(content)}\n\n`)
    .replace(/<\/?div[^>]*>/gi, '\n')
    .replace(/<\/?section[^>]*>/gi, '\n')
    .replace(/<\/?article[^>]*>/gi, '\n')
    .replace(/<\/?header[^>]*>/gi, '\n')
    .replace(/<\/?footer[^>]*>/gi, '\n');
  return stripHtmlTags(text);
}

function stripHtmlTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizePlainText(text) {
  return (text || '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function runBrowserHarness(url) {
  const pythonScript = `
import json
import os

url = os.environ.get("ARTICLE_URL", "").strip()
if not url:
  raise RuntimeError("ARTICLE_URL is empty")

new_tab(url)
wait_for_load(30)
wait(2)

extract_js = """(() => {
  try {
  const getMeta = (selector, attr = "content") => {
    const node = document.querySelector(selector);
    return node ? (node.getAttribute(attr) || "").trim() : "";
  };

  let title =
    getMeta('meta[property="og:title"]') ||
    getMeta('meta[name="twitter:title"]') ||
    (document.title || "").trim();
  const author =
    getMeta('meta[name="author"]') ||
    getMeta('meta[property="article:author"]');
  const description =
    getMeta('meta[name="description"]') ||
    getMeta('meta[property="og:description"]');

  const scored = [];
  const seen = new Set();
  const push = (el, selector) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    const text = (el.innerText || "").replace(/\\s+/g, " ").trim();
    if (text.length < 180) return;
    const paragraphCount = el.querySelectorAll("p").length;
    let score = text.length + paragraphCount * 80;
    if (selector.includes("article")) score += 1500;
    if (selector === "main" || selector.includes("main")) score += 600;
    scored.push({ el, selector, score, textLength: text.length, paragraphCount });
  };

  const seedSelectors = [
    "article",
    "main article",
    "main",
    "[role='main']",
    "[itemprop='articleBody']",
    ".article",
    ".post",
    ".post-content",
    ".entry-content",
    ".article-content",
    ".blog-content",
    "#article",
    "#content",
    "#main",
  ];

  for (const selector of seedSelectors) {
    document.querySelectorAll(selector).forEach((el) => push(el, selector));
  }

  document.querySelectorAll("section,div").forEach((el) => {
    const marker = [el.id || "", el.className || ""].join(" ");
    if (/(article|post|content|story|entry|blog)/i.test(marker)) {
      push(el, "section/div:content-like");
    }
  });

  const winner =
    scored.sort((a, b) => b.score - a.score)[0] ||
    { el: document.body, selector: "body", score: 0, textLength: (document.body?.innerText || "").length };

  const sourceEl = winner.el || document.body;
  const h1Title = (
    sourceEl.querySelector("h1")?.textContent ||
    document.querySelector("article h1, main h1, h1")?.textContent ||
    ""
  ).trim();
  const genericTitle = /^(x|twitter|x\\s*\\/\\s*twitter)$/i.test((title || "").trim());
  if (!title || genericTitle) {
    title = h1Title || title;
  }

  const clone = sourceEl.cloneNode(true);
  clone.querySelectorAll("script,style,noscript,iframe,svg,canvas,form,nav,footer,header,aside").forEach((node) => node.remove());
  clone.querySelectorAll("[aria-hidden='true'],[hidden],.ad,.ads,.advertisement,.social-share,.related,.recommend").forEach((node) => node.remove());

  const cleanHtml = clone.innerHTML || "";
  const cleanText = (clone.innerText || sourceEl.innerText || "").replace(/\\u00A0/g, " ").trim();
  if (!title || /^(x|twitter|x\\s*\\/\\s*twitter)$/i.test((title || "").trim())) {
    const firstLine = cleanText
      .split(/\\n+/)
      .map((line) => line.trim())
      .find((line) => line.length >= 8);
    if (firstLine) {
      title = firstLine.slice(0, 120);
    }
  }

  return {
    url: location.href,
    title,
    author,
    description,
    selector: winner.selector || "body",
    score: winner.score || 0,
    cleanHtml,
    cleanText
  };
  } catch (err) {
    return {
      error: String(err),
      stack: err?.stack || ""
    };
  }
})()"""

payload = None
for _ in range(3):
  payload = js(extract_js)
  if payload and (payload.get("cleanHtml") or payload.get("cleanText")):
    break
  wait(1.2)

if not payload:
  payload = js("""(() => {
    const main = document.querySelector("main");
    const root = main || document.body;
    const title =
      (document.querySelector("article h1, main h1, h1")?.textContent || "").trim() ||
      (document.title || "").trim();
    return {
      url: location.href,
      title,
      author: "",
      description: "",
      selector: main ? "main" : "body",
      score: 0,
      cleanHtml: root?.innerHTML || "",
      cleanText: (root?.innerText || "").trim()
    };
  })()""")

print("__ARTICLE_CAPTURE_START__")
print(json.dumps(payload, ensure_ascii=False))
print("__ARTICLE_CAPTURE_END__")
`;

  const result = spawnSync('browser-harness', {
    input: pythonScript,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ARTICLE_URL: url,
    },
    timeout: browserTimeoutMs,
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error('`browser-harness` command not found. Please install and run browser-harness setup first.');
    }
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    throw new Error(`browser-harness failed (exit ${result.status}):\n${stderr || stdout || 'no output'}`);
  }

  const stdout = result.stdout || '';
  const start = '__ARTICLE_CAPTURE_START__';
  const end = '__ARTICLE_CAPTURE_END__';
  const sIdx = stdout.indexOf(start);
  const eIdx = stdout.indexOf(end);

  if (sIdx === -1 || eIdx === -1 || eIdx <= sIdx) {
    throw new Error(`Failed to parse browser-harness output:\n${stdout.trim() || '(empty)'}`);
  }

  const jsonText = stdout.slice(sIdx + start.length, eIdx).trim();
  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Invalid JSON from browser-harness: ${error.message}\n${jsonText.slice(0, 500)}`);
  }

  if (payload?.error) {
    throw new Error(`Browser extraction JS error: ${payload.error}\n${payload.stack || ''}`.trim());
  }

  if (!payload || (!payload.cleanHtml && !payload.cleanText)) {
    throw new Error('No article content extracted from browser.');
  }

  return payload;
}

function buildMarkdown(article) {
  const title = article.title || article.url || articleUrl;
  const body = article.cleanHtml ? normalizeText(article.cleanHtml) : normalizePlainText(article.cleanText);
  const headerLines = ['# ' + title, ''];
  if (article.author) headerLines.push(`作者：${article.author}`, '');
  if (article.description) headerLines.push(article.description, '');
  headerLines.push(`原文链接：${article.url || articleUrl}`, '');
  headerLines.push(`提取方式：browser-harness (${article.selector || 'body'})`, '');
  headerLines.push('---', '');
  return headerLines.join('\n') + '\n' + body + '\n';
}

function getOutputFilePath(title) {
  if (outputFileName) {
    const ext = path.extname(outputFileName);
    if (!ext) {
      outputFileName += '.md';
    }
    return path.resolve(process.cwd(), outputFileName);
  }
  const fileName = `${sanitizeFileName(title)}.md`;
  return path.resolve(process.cwd(), fileName);
}

async function translateMarkdown(markdown) {
  const payload = {
    model,
    messages: [
      { role: 'system', content: '你是一个精通中英文翻译的专业编辑。' },
      {
        role: 'user',
        content: `请将下面英文文章翻译成中文，并保留原有标题、一级/二级标题、列表和段落结构，输出为 Markdown 格式。仅返回 Markdown 内容，不要添加额外说明。\n\n${markdown}`,
      },
    ],
    max_tokens: 20000,
    temperature: 0.2,
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI provider error: ${response.status} ${response.statusText}\n${body}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.text;
  if (!content) {
    throw new Error(`No valid response from provider: ${JSON.stringify(data)}`);
  }
  return content;
}

async function main() {
  try {
    console.log(`Opening article in logged-in browser via browser-harness: ${articleUrl}`);
    const article = runBrowserHarness(articleUrl);
    const markdown = buildMarkdown(article);

    console.log('Translating to Chinese using', model, 'at', baseUrl);
    const translated = await translateMarkdown(markdown);

    const outputPath = getOutputFilePath(article.title || articleUrl);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, translated, 'utf-8');
    console.log(`Saved translated markdown to ${outputPath}`);
  } catch (error) {
    console.error('Error:', error.message || error);
    process.exit(1);
  }
}

main();
