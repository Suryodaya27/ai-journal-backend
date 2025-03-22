require('./jobs/entriesBatcher');

const express = require('express');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const Redis = require('ioredis');
const authrouter = require('./routes/auth.routes');
const journalrouter = require('./routes/journal.routes');
const airouter = require('./routes/goalsAndSuggestions.routes');
const app = express();
const cors = require('cors');


// Use CORS with default options or customize as needed
app.use(cors({
  origin: 'http://localhost:5173', // Allow your frontend's origin
  credentials: true,             // Allow cookies to be sent
}));

const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "",
  tls: {}, // Enables SSL
};
// Initialize Redis client
const redisClient = new Redis(redisConfig);

// Configure rate limiter using rate-limiter-flexible with Redis store
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'middleware',  // Key prefix for rate limiting
  points: 10,  // 10 requests
  duration: 60,  // Per minute
});

// Apply rate limiting middleware globally or to specific routes
const rateLimitMiddleware = (req, res, next) => {
  rateLimiter.consume(req.ip)  // Consume one point per request, based on IP
    .then(() => {
      next(); // Continue if rate limit is not exceeded
    })
    .catch(() => {
      res.status(429).json({
        error: 'Too many requests, please try again later.'
      });
    });
};

// Apply rate limiting middleware globally (for all routes)
app.use(rateLimitMiddleware);

// Middleware for parsing JSON
app.use(express.json());

// Routes for authentication
app.use('/api/auth', authrouter);

// Routes for journal entries
app.use('/api/journal', journalrouter);

// Routes for goals and suggestions
app.use('/api', airouter);

// Start the server
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
