import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import routes from './routes/index.js';
import { AppError } from './utils/AppError.js';

const app = express();
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', routes);

app.use((_req, res) => res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (max 5 MB).' : 'The upload could not be processed.';
    return res.status(400).json({ error: msg, code: 'UPLOAD' });
  }
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.', code: 'INTERNAL' });
});

app.listen(config.port, () => {
  console.log(`ThinkTrace API on http://localhost:${config.port}  (model: ${config.ai.model} @ ${config.ai.url})`);
});
