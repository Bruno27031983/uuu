const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || 8085;
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
};

http.createServer((req, res) => {
    // Zabezpečenie proti Path Traversal
    let requestedPath = req.url;
    if (requestedPath === '/') requestedPath = '/index.html';

    // Vytvor absolútnu cestu a normalizuj ju
    const filePath = path.normalize(path.join(__dirname, requestedPath));

    // KRITICKÉ: Over, že výsledná cesta je stále v rámci aktuálneho adresára
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('403 Forbidden');
        return;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('500 Internal Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}).listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
