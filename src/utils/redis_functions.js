const redisClient = require("./redisClient");

// Function to set data in Redis
const setRedis = (key, value, ttl = 3600) => {
  // Default TTL of 1 hour
  return redisClient.setex(key, ttl, JSON.stringify(value)); // Using setex to set value with TTL
};

// Function to get data from Redis
const getRedis = async (key) => {
  const data = await redisClient.get(key);
  return data ? JSON.parse(data) : null; // Parse JSON if data exists
};

// Function to delete data from Redis
const delRedis = (key) => {
  return redisClient.del(key); // Using del to delete the key
};

// push elements to the list
const pushElements = async (key, value) => {
  return redisClient.lpush(key, value);
};

// get batch entries
const getBatchEntries = async (key, batchSize) => {
  const batch = await redisClient.lrange(key, 0, batchSize - 1);

  if (batch.length === 0) return; // No pending jobs

  // Remove processed jobs from Redis
  await redisClient.ltrim(key, batchSize, -1);

  // Parse entries and push them to the BullMQ queue
  const parsedEntries = batch.map(JSON.parse);
  if (parsedEntries.length === 0) return
  return parsedEntries;
};

module.exports = {
  setRedis,
  getRedis,
  delRedis,
  pushElements,
  getBatchEntries,
};
