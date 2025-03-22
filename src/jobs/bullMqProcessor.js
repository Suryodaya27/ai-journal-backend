const { Queue, Worker } = require("bullmq");
const Redis = require("ioredis");
const { createSummaryAndGoals } = require("../cron-jobs/createSummaryAndGoals");
const { delRedis } = require("../utils/redis_functions");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const nodemailer = require("nodemailer");

// Centralized Redis configuration (ensure maxRetriesPerRequest is not set or null)
// const redisConfig = {
//   host: process.env.REDIS_HOST || "localhost",
//   port: process.env.REDIS_PORT || 6379,
//   maxRetriesPerRequest: null, // Explicitly set this to null
// };
const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "",
  maxRetriesPerRequest: null,
  tls: {}, // Enables SSL
};

// Create Redis client
const redisClient = new Redis(redisConfig);

// Define the queue
const summaryQueue = new Queue("summary-queue", {
  connection: redisClient, // Use the Redis client
});

const cacheQueue = new Queue("invalidate-cache", {
  connection: redisClient, // Use the Redis client
});

const verificationMailQueue = new Queue("verification-mail-queue", {
  connection: redisClient, // Use the Redis client
});

const batchProcessQueue = new Queue("batch-process", {
  connection: redisClient, // Use the Redis client
});

// Define the worker
const summaryWorker = new Worker(
  "summary-queue",
  async (job) => {
    const { content, mood, userId } = job.data;

    // Process the job (e.g., generate summary and goals)
    try {
      console.log(`Processing job for user ${userId}`);
      await createSummaryAndGoals(content, mood, userId); // Replace with your actual task
    } catch (error) {
      console.error("Error processing job:", error);
      throw error; // Rethrow to ensure job failure is captured
    }
  },
  {
    connection: redisClient, // Ensure the worker gets the Redis connection
  }
);

const cacheInvalidationWorker = new Worker(
  "invalidate-cache",
  async (job) => {
    const { userId } = job.data;

    try {
      // Calculate the total number of journal entries for the user
      const pageCount = await prisma.dailyJournalEntry.count({
        where: { userId },
      });

      const totalPages = Math.ceil(pageCount / 10); // Assuming 10 entries per page

      // Invalidate cache for each page
      for (let i = 1; i <= Math.min(totalPages, 5); i++) {
        const journal_key = `${userId}-journals-${i}-10`; // Example: user-journals-1-10, user-journals-2-10, etc.
        console.log(`Invalidating cache for key: ${journal_key}`);
        await delRedis(journal_key); // Assuming `delRedis` deletes the cache
      }

      // Optionally, invalidate other cache keys like user goals
      const goals_key = `${userId}-goals`;
      await delRedis(goals_key);

      const tags_key = `${userId}-tags`;
      await delRedis(tags_key);
    } catch (error) {
      console.error("Error invalidating cache:", error);
    }
  },
  {
    connection: redisClient, // Ensure the worker gets the Redis connection
  }
);

const mailWorker = new Worker(
  "verification-mail-queue",
  async (job) => {
    try {
      console.log("Sending verification email...");
      const { email, subject, text } = job.data;

      const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject,
        text,
      });

      console.log(`Email sent to ${email}`);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  },
  {
    connection: redisClient, // Ensure the worker gets the Redis connection
  }
);

const batchProcessWorker = new Worker(
  "batch-process",
  async (job) => {
    try {
      const batchEntries = job.data;
      console.log("Processing batch entries...");
      console.log(batchEntries);
      if (!batchEntries || batchEntries.length === 0) return;

      console.log(`🛠️ Processing ${batchEntries.length} journal entries...`);

      // **Step 1: Bulk Insert Journal Entries**
      const createdEntries = await Promise.all(
        batchEntries.map((entry) =>
          prisma.dailyJournalEntry.create({
            data: {
              date: new Date(),
              mood: entry.mood,
              content: entry.content,
              userId: entry.userId,
            },
          })
        )
      );

      console.log(`✅ Created ${createdEntries.length} journal entries.`);
      console.log(createdEntries);

      // **Step 2: Batch Process Tags**
      const tagNames = [
        ...new Set(batchEntries.flatMap((entry) => entry.tags || [])),
      ];

      const existingTags = await prisma.tag.findMany({
        where: { name: { in: tagNames } },
      });

      const existingTagMap = new Map(
        existingTags.map((tag) => [tag.name, tag.id])
      );

      const newTags = tagNames
        .filter((name) => !existingTagMap.has(name))
        .map((name) => ({ name }));

      const createdTags =
        newTags.length > 0
          ? await prisma.tag.createMany({ data: newTags })
          : [];

      const allTags = [...existingTags, ...createdTags];

      const tagMap = new Map(allTags.map((tag) => [tag.name, tag.id]));

      // **Step 3: Associate Tags with Entries**
      const journalTagRelations = batchEntries.flatMap((entry, index) =>
        (entry.tags || []).map((tagName) => ({
          entryId: createdEntries[index].id,
          tagId: tagMap.get(tagName),
        }))
      );

      await prisma.dailyJournalEntryTag.createMany({
        data: journalTagRelations,
      });
    } catch (error) {
      console.error("Error processing batch:", error);
    }
  },
  {
    connection: redisClient, // Ensure the worker gets the Redis connection
  }
);

// Graceful shutdown for worker
process.on("SIGINT", async () => {
  console.log("Shutting down bullmq...");
  await summaryWorker.close(); // Close the worker gracefully
  await cacheInvalidationWorker.close(); // Close the worker gracefully
  await mailWorker.close(); // Close the worker gracefully
  await batchProcessWorker.close(); // Close the worker gracefully
  await redisClient.quit(); // Disconnect Redis client
  process.exit(0); // Exit the process
});

// Export the queue and worker so they can be used in other parts of the app
module.exports = {
  summaryQueue,
  cacheQueue,
  verificationMailQueue,
  batchProcessQueue,
};
