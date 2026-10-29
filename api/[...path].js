/**
 * Vercel Serverless Function Proxy & QR Engine
 * Xử lý các request /api/* và /f/* trên Vercel Serverless
 */
const https = require('https');
const QRCode = require('qrcode');

const UPSTREAM_CONVERT_ORIGIN = 'https://103.159.51.79:8443';
const insecureAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
const qrCache = new Map();

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function handleCORS(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return true;
  }
  return false;
}

async function getRequestBody(req) {
  if (req.body) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body));
    if (typeof req.body === 'string') return Buffer.from(req.body);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function proxyConvert(req, res, bodyBuffer) {
  const targetUrl = new URL(UPSTREAM_CONVERT_ORIGIN + '/api/convert');
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Content-Length': Buffer.byteLength(bodyBuffer)
  };

  const options = {
    method: 'POST',
    agent: insecureAgent,
    headers: headers,
    timeout: 30000
  };

  const proxyReq = https.request(targetUrl, options, proxyRes => {
    const chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
    proxyRes.on('end', async () => {
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      
      try {
        const data = JSON.parse(rawBody);

        if (data && data.result && data.result.qr_url) {
          const targetQrUrl = data.result.qr_url;

          if (data.id) {
            qrCache.set(data.id, targetQrUrl);
          }

          try {
            const dataUrl = await QRCode.toDataURL(targetQrUrl, {
              width: 360,
              margin: 2,
              errorCorrectionLevel: 'M',
              color: {
                dark: '#000000',
                light: '#ffffff'
              }
            });
            data.result.qr_data_url = dataUrl;
          } catch (qrErr) {
            console.error('[QR Generation Error]:', qrErr.message);
          }
        }

        sendJSON(res, proxyRes.statusCode || 200, data);
      } catch (_) {
        res.writeHead(proxyRes.statusCode || 200, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(rawBody);
      }
    });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy(new Error('Yêu cầu quá thời gian chờ (timeout 30s)'));
  });

  proxyReq.on('error', err => {
    console.error('[Convert Proxy Error]:', err.message);
    sendJSON(res, 502, {
      error: {
        code: 'upstream_error',
        message: 'Không kết nối được máy chủ chuyển đổi: ' + err.message
      }
    });
  });

  proxyReq.write(bodyBuffer);
  proxyReq.end();
}

function proxyPassGet(req, res, targetPath) {
  const targetUrl = new URL(UPSTREAM_CONVERT_ORIGIN + targetPath);
  const options = {
    method: 'GET',
    agent: insecureAgent,
    headers: {
      'Accept': '*/*'
    }
  };

  const proxyReq = https.request(targetUrl, options, proxyRes => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': proxyRes.headers['cache-control'] || 'public, max-age=86400'
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error('[Proxy Get Error]:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Lỗi kết nối tệp: ' + err.message);
  });

  proxyReq.end();
}

module.exports = async (req, res) => {
  if (handleCORS(req, res)) return;

  const parsedUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = parsedUrl.pathname;

  // 1. API: Cấu hình hệ thống
  if (pathname === '/api/config') {
    const targetUrl = new URL(UPSTREAM_CONVERT_ORIGIN + '/api/config');
    const proxyReq = https.request(targetUrl, { method: 'GET', agent: insecureAgent }, proxyRes => {
      let raw = '';
      proxyRes.on('data', chunk => raw += chunk);
      proxyRes.on('end', () => {
        try {
          const cfg = JSON.parse(raw);
          cfg.local_proxy = true;
          sendJSON(res, 200, cfg);
        } catch (_) {
          sendJSON(res, 200, {
            public_base_url: 'https://hyper-league.io.vn',
            qr_ready: true,
            conversion_kinds: ['face', 'makeup', 'hair', 'top', 'bottom', 'photo'],
            local_proxy: true
          });
        }
      });
    });
    proxyReq.on('error', () => {
      sendJSON(res, 200, {
        public_base_url: 'https://hyper-league.io.vn',
        qr_ready: true,
        conversion_kinds: ['face', 'makeup', 'hair', 'top', 'bottom', 'photo'],
        local_proxy: true
      });
    });
    proxyReq.end();
    return;
  }

  // 2. API: Chuyển đổi mã diện mạo
  if (pathname === '/api/convert' && req.method === 'POST') {
    try {
      const bodyBuffer = await getRequestBody(req);
      proxyConvert(req, res, bodyBuffer);
    } catch (e) {
      sendJSON(res, 400, { error: { message: 'Lỗi đọc dữ liệu: ' + e.message } });
    }
    return;
  }

  // 3. API: Tạo ảnh QR tức thì theo văn bản / URL
  if (pathname === '/api/qr') {
    const text = parsedUrl.searchParams.get('text');
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Thiếu tham số text');
      return;
    }

    try {
      const pngBuffer = await QRCode.toBuffer(text, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: 'M'
      });
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(pngBuffer);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Lỗi tạo mã QR: ' + e.message);
    }
    return;
  }

  // 4. API: Proxy kết quả QR & Payload
  const qrMatch = pathname.match(/^\/api\/results\/([A-Za-z0-9_-]+)\/qr\.png$/);
  if (qrMatch && qrCache.has(qrMatch[1])) {
    const targetUrl = qrCache.get(qrMatch[1]);
    try {
      const pngBuffer = await QRCode.toBuffer(targetUrl, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: 'M'
      });
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(pngBuffer);
      return;
    } catch (_) {}
  }

  if (pathname.startsWith('/api/results/') || pathname.startsWith('/f/')) {
    proxyPassGet(req, res, pathname + (parsedUrl.search || ''));
    return;
  }

  // Mặc định trả về 404 cho các route không khớp
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
};
