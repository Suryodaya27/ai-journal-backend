const { getBatchEntries } = require("../utils/redis_functions");
const { batchProcessQueue } = require("./bullMqProcessor");

setInterval(async () => {
  try {
    const batchSize = 10;
    const parsedEntries = await getBatchEntries("journalBatchQueue", batchSize);
    if(!parsedEntries) return;
    await batchProcessQueue.add("batch-process", parsedEntries);

    console.log(`✅ Flushed ${parsedEntries.length} entries from Redis to BullMQ.`);
  } catch (error) {
    console.error("❌ Error processing journal batch:", error);
  }
}, 5000);
