// Tiny game server: serves the production build in dist/ and accepts the
// New Game face snapshot (POST /api/photo?name=...) into photos/.
//   npm run build-only && node serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PHOTOS = path.join(ROOT, 'photos');
const PORT = Number(process.argv[2] || process.env.PORT || 5180);
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.jpeg': 'image/jpeg',
    '.task': 'application/octet-stream', '.webmanifest': 'application/manifest+json',
};

fs.mkdirSync(PHOTOS, {recursive: true});

http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'POST' && url.pathname === '/api/photo') {
        const raw = (url.searchParams.get('name') || 'player').slice(0, 16);
        const safe = raw.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'player';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = path.join(PHOTOS, `${safe}-${stamp}.jpg`);
        const chunks = [];
        req.on('data', c => { chunks.push(c); if (chunks.reduce((n, b) => n + b.length, 0) > 5e6) req.destroy(); });
        req.on('end', () => {
            fs.writeFile(file, Buffer.concat(chunks), err => {
                res.writeHead(err ? 500 : 200, {'Content-Type': 'text/plain'});
                res.end(err ? 'write failed' : path.relative(ROOT, file));
            });
        });
        return;
    }

    let p = path.normalize(decodeURIComponent(url.pathname));
    if (p === '/' || p === '\\') p = '/index.html';
    const file = path.join(DIST, p);
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, {'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
                            'Content-Length': st.size, 'Cache-Control': 'no-cache'});
        fs.createReadStream(file).pipe(res);
    });
}).listen(PORT, () => console.log(`game: http://localhost:${PORT}  photos → ${PHOTOS}`));
