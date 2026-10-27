// Local test server: serves public/ and runs api/*.js against a real local
// Postgres through the fake Supabase client. Not used in production.
//   TEST_DATABASE_URL=postgres://… node test/dev-server.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const fake = require('./fake-supabase');
const sbPath = require.resolve('@supabase/supabase-js', { paths: [root] });
require.cache[sbPath] = { id: sbPath, filename: sbPath, loaded: true, exports: { createClient: fake.createClient } };
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-test-secret-123456';
process.env.SUPABASE_URL = 'http://fake'; process.env.SUPABASE_SERVICE_KEY = 'fake';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const file = path.join(root, u.pathname + '.js');
    if (!fs.existsSync(file) || u.pathname.includes('_lib')) { res.writeHead(404); return res.end('no'); }
    let body = '';
    for await (const ch of req) body += ch;
    req.query = Object.fromEntries(u.searchParams);
    try { req.body = body ? JSON.parse(body) : {}; } catch (e) { req.body = {}; }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    return require(file)(req, res);
  }
  let p = u.pathname === '/' ? '/index.html' : u.pathname;
  let f = path.join(root, 'public', p);
  if (!fs.existsSync(f)) f = path.join(root, 'public', 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}).listen(+process.argv[2] || 3100, () => console.log('dev server on', process.argv[2] || 3100));
