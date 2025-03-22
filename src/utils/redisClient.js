const Redis = require('ioredis');

const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "",
  maxRetriesPerRequest: null,
  tls: {}, // Enables SSL
};
// Create a Redis client using ioredis
const redisClient = new Redis(redisConfig);

// Handle connection errors
redisClient.on('error', (err) => {
  console.error('Redis error: ', err);
});

module.exports = redisClient;
