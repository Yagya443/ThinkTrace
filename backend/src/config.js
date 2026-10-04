import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 5000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  githubToken: process.env.GITHUB_TOKEN || '', // optional, only raises GitHub API rate limits
  ai: {
    provider: process.env.AI_PROVIDER || 'ollama',
    url: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
    model: process.env.AI_MODEL || 'gemma3:4b',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 60000,
  },
};
