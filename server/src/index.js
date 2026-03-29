/**
 * Rafa Agent Server - Entry Point
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import chatRoutes from './routes/chat.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: { error: '请求过于频繁，请稍后再试' }
});
app.use('/api', limiter);

// Routes
app.use('/api', chatRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Rafa Agent Server running on port ${PORT}`);
  console.log(`🤖 Model: ${process.env.ANTHROPIC_MODEL || 'kimi-k2.5'}`);
});
