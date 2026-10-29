/**
 * Nghịch Thủy Hàn - Máy Chủ Chuyển Đổi QR Chuẩn VNG Games
 * Sử dụng thư viện chuẩn Node.js và module qrcode để tạo mã QR siêu tốc, ổn định tuyệt đối.
 * Tự động vượt rào SSL và CORS của máy chủ upstream.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const UPSTREAM_CONVERT_ORIGIN = 'https://103.159.51.79:8443';

// Bộ nhớ đệm lưu trữ liên kết QR theo ID để sinh ảnh tức thì không phụ thuộc upstream
const qrCache = new Map();

// Agent bỏ qua lỗi SSL certificate cho upstream server
const insecureAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

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

// Chuyển tiếp request sang backend convert (103.159.51.79:8443)
// Đồng thời tạo sẵn QR Data URL ngay trên server để đảm bảo 100% hiển thị
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

        // Nếu chuyển đổi thành công và có liên kết nạp game qr_url
        if (data && data.result && data.result.qr_url) {
          const targetQrUrl = data.result.qr_url;

          // Lưu vào cache bộ nhớ theo ID kết quả
          if (data.id) {
            qrCache.set(data.id, targetQrUrl);
          }

          // Sinh trực tiếp Base64 Data URL của mã QR (độ phân giải cao, lề chuẩn)
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
        // Fallback gửi nguyên bản nếu không parse được JSON
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

// Proxy lấy ảnh QR hoặc payload từ upstream
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

const server = http.createServer(async (req, res) => {
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
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const bodyBuffer = Buffer.concat(chunks);
      proxyConvert(req, res, bodyBuffer);
    });
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

  // 4. API: Proxy kết quả QR & Payload (với cơ chế sinh trực tiếp nếu có trong cache)
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
    } catch (_) {
      // Fallback xuống proxyPassGet nếu lỗi
    }
  }

  if (pathname.startsWith('/api/results/') || pathname.startsWith('/f/')) {
    proxyPassGet(req, res, pathname + (parsedUrl.search || ''));
    return;
  }

  // 5. Phục vụ Static Files
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // Chặn path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
        return;
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` NGHỊCH THỦY HÀN · BỘ CHUYỂN MÃ QR VNG PRO `);
  console.log(` Máy chủ đang chạy tại: http://localhost:${PORT}`);
  console.log(` Tích hợp bộ sinh QR trực tiếp siêu tốc & chống lỗi`);
  console.log(`====================================================`);
});

process.on('uncaughtException', err => {
  console.error('[Uncaught Exception]:', err.message || err);
});

process.on('unhandledRejection', reason => {
  console.error('[Unhandled Rejection]:', reason);
});
