import express from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve static files from dist
app.use(express.static(path.join(__dirname, 'dist')));

// Handle SPA routing - catch all routes and serve index.html
app.use((req, res) => {
  // Skip API routes and static files
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start HTTP server (removing HTTPS for now)
const PORT = 3000;
http.createServer(app).listen(PORT, '0.0.0.0', () => {
  const networkInterfaces = os.networkInterfaces();
  const localIP = Object.values(networkInterfaces)
    .flat()
    .find(iface => iface.family === 'IPv4' && !iface.internal)?.address;

  console.log(`🚀 HTTP Server running on:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  if (localIP) {
    console.log(`   Network: http://${localIP}:${PORT}`);
  }
  console.log('\n📱 Server is ready!\n');
});