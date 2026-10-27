// 雅思写作练习 · 本地服务
// 作用：1) 提供 public/ 下的网页  2) 把练习请求转发到你的 OpenAI 兼容接口（避免浏览器跨域、保护 key）
// 运行：node server.js  （需要 Node.js 18+，无第三方依赖）

const http = require('http');
const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// 极简 .env 解析：KEY=VALUE，支持 # 注释和引号
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

// 网页设置里填写的配置优先，其次是 .env
function resolveConfig(override = {}) {
  return {
    baseUrl: (override.baseUrl || process.env.API_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: override.apiKey || process.env.API_KEY || '',
    model: override.model || process.env.MODEL || 'gpt-4o-mini',
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': MIME['.json'] });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) reject(new Error('请求内容过大'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleChat(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: '请求格式错误' });
  }

  const cfg = resolveConfig(body.config);
  if (!cfg.apiKey) {
    return sendJson(res, 400, { error: '还没有配置 API Key：请在 .env 中填写 API_KEY，或在网页右上角「设置」里填写。' });
  }

  const payload = {
    model: cfg.model,
    messages: body.messages,
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.4,
  };

  try {
    const upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return sendJson(res, 502, { error: `接口返回了无法解析的内容（HTTP ${upstream.status}）：${text.slice(0, 300)}` });
    }

    if (!upstream.ok) {
      const msg = data?.error?.message || data?.message || text.slice(0, 300);
      return sendJson(res, upstream.status, { error: `接口报错（HTTP ${upstream.status}）：${msg}` });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return sendJson(res, 502, { error: '接口没有返回文本内容，请检查模型名是否正确。' });
    }
    sendJson(res, 200, { content, model: data.model || cfg.model });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? '请求超时（5 分钟）' : err.message;
    sendJson(res, 502, { error: `无法连接到接口 ${cfg.baseUrl}：${reason}` });
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
  if (req.method === 'GET' && req.url === '/api/status') {
    const cfg = resolveConfig();
    return sendJson(res, 200, { hasKey: Boolean(cfg.apiKey), baseUrl: cfg.baseUrl, model: cfg.model });
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405);
  res.end();
});

const URL_HOME = `http://localhost:${PORT}`;
const shouldOpen = process.argv.includes('--open');

// 用系统默认浏览器打开网页（node server.js --open）
function openBrowser() {
  const { exec } = require('child_process');
  const cmd = process.platform === 'win32' ? `start "" "${URL_HOME}"` : process.platform === 'darwin' ? `open "${URL_HOME}"` : `xdg-open "${URL_HOME}"`;
  exec(cmd, () => {});
}

server.on('error', (err) => {
  // 端口被占用，多半是已经开着一个了：直接打开网页即可
  if (err.code === 'EADDRINUSE') {
    console.log(`\n端口 ${PORT} 已被占用，可能已经在运行了：${URL_HOME}`);
    if (shouldOpen) openBrowser();
    setTimeout(() => process.exit(0), 1500);
    return;
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  const cfg = resolveConfig();
  console.log(`\n✍️  雅思写作练习已启动：${URL_HOME}`);
  console.log(`   接口：${cfg.baseUrl}  模型：${cfg.model}  Key：${cfg.apiKey ? '已配置' : '未配置（可在网页设置中填写）'}`);
  console.log('   关闭这个窗口即可停止运行\n');
  if (shouldOpen) openBrowser();
});
