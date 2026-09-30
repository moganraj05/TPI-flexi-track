// Serves the built HR web console (webfrontend/dist) on WEB_PORT (default
// 8080). Any path that isn't a real file gets index.html, so refreshing a
// page such as /app/dashboard or /register works instead of showing 404.
// Uses the backend's own Express install - no extra packages needed.
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const express = require(path.join(ROOT, 'backend', 'node_modules', 'express'));

const DIST = path.join(ROOT, 'webfrontend', 'dist');
const PORT = Number(process.env.WEB_PORT) || 8080;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('webfrontend/dist is missing. Run "npm run setup" first.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');

// Hashed build assets never change, so browsers may cache them for a year;
// index.html and the service worker must always be re-checked so a new
// build reaches users on their next visit.
app.use(
  express.static(DIST, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

app.use((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).end();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[web] HR web console on http://0.0.0.0:${PORT}`);
});
