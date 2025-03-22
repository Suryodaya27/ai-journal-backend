const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { summaryQueue, cacheQueue } = require("../jobs/bullMqProcessor");
const { setRedis, getRedis, delRedis ,pushElements} = require("../utils/redis_functions");
const dayjs = require("dayjs");

const createJournal = async (req, res) => {
  try {
    const { mood, content, tags } = req.body;
    const userId = req.userId; // Get the user ID from the authenticated user

    // Validate the input data
    if (!mood || !content || !userId) {
      return res
        .status(400)
        .json({ error: "Missing required fields or invalid tags format." });
    }

    // // Step 1: Create the journal entry
    // const newEntry = await prisma.dailyJournalEntry.create({
    //   data: {
    //     date: new Date(),
    //     mood,
    //     content,
    //     user: {
    //       connect: { id: userId },
    //     },
    //   },
    // });

    // if (tags && tags.length > 0) {
    //   // Step 2: Iterate over the provided tags
    //   const tagPromises = tags.map(async (tagName) => {
    //     // Check if the tag exists or create it if it doesn't
    //     const tag = await prisma.tag.upsert({
    //       where: { name: tagName.toLowerCase() }, // Find tag by lowercase name
    //       update: {}, // No update is needed if tag exists
    //       create: { name: tagName.toLowerCase() }, // Create new tag if it doesn't exist
    //     });

    //     // Step 3: Create the DailyJournalEntryTag connection between the new entry and the tag
    //     await prisma.dailyJournalEntryTag.create({
    //       data: {
    //         entryId: newEntry.id,
    //         tagId: tag.id,
    //       },
    //     });
    //   });

    //   // Wait for all the tag connection promises to resolve
    //   await Promise.all(tagPromises);
    // }
    const entry = JSON.stringify({ mood, content, tags, userId, timestamp: Date.now() });
    await pushElements("journalBatchQueue", entry);
    // Step 1: Cache invalidation (delete relevant cache keys)
    await cacheQueue.add("invalidate-cache", {
      userId, // Send userId so that cache invalidation can be done for this user
    });

    // Step 2: Queue the background job for generating the summary
    await summaryQueue.add("summary-queue", { content, mood, userId });

    // Step 3: Return the created journal entry
    res.status(201).json({
      message: "Journal created successfully",
    });
  } catch (error) {
    // Log and return error details
    console.error("Error creating journal entry:", error);
    res.status(500).json({ error: "Failed to create journal entry" });
  }
}

const updateJournal = async (req, res) => {
  const { journalId, content, tagIds = [] } = req.body; // Array of tag IDs (optional) // Get the journal entry ID from params
  const userId = req.userId; // Get the user ID from the authenticated user

  // Ensure that tags are in array format
  if (!Array.isArray(tagIds)) {
    return res
      .status(400)
      .json({ error: "Invalid tags format. Expected an array." });
  }

  try {
    // Start a transaction for updating the journal entry and tags
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Update the journal entry
      const journalEntry = await tx.dailyJournalEntry.update({
        where: { id: journalId },
        data: {
          content, // Update content
        },
      });

      // Step 2: Remove all old tag associations
      await tx.dailyJournalEntryTag.deleteMany({
        where: { entryId: journalId },
      });

      // Step 3: Add the new tag associations (if provided)
      const tagData = tagIds.map((tagId) => ({
        entryId: journalEntry.id,
        tagId: tagId, // Assuming the tagId exists
      }));

      if (tagData.length > 0) {
        await tx.dailyJournalEntryTag.createMany({
          data: tagData,
        });
      }

      return journalEntry; // Return updated journal entry
    });

    // Step 4: Cache invalidation (delete relevant cache keys)
    const key1 = `${userId}-journals`;
    await delRedis(key1);
    const key2 = `${userId}-goals`;
    await delRedis(key2);

    // Step 5: Enqueue the background job for generating the updated summary
    await summaryQueue.add("generate-summary", { content, userId });

    // Step 6: Return success response
    return res
      .status(200)
      .json({ message: "Journal updated successfully", journalId: result.id });
  } catch (error) {
    // Handle unexpected errors
    console.error("Error updating journal:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    // Disconnect Prisma client to prevent memory leaks
    await prisma.$disconnect();
  }
};

const deleteJournalEntry = async (req, res) => {
  const { journalId } = req.body;
  const userId = req.userId;

  try {
    // Step 1: Use a transaction to delete the journal entry and associated tags
    await prisma.$transaction(async (tx) => {
      // Step 1: Remove all old tag associations related to the deleted journal entry
      await tx.dailyJournalEntryTag.deleteMany({
        where: { entryId: journalId },
      });
      // Step 2: Delete the journal entry
      await tx.dailyJournalEntry.delete({
        where: { id: journalId },
      });
    });

    // Step 2: Cache invalidation - delete relevant cache keys
    await cacheQueue.add("invalidate-cache", {
      userId, // Send userId so that cache invalidation can be done for this user
    });

    // Optionally, re-trigger summary or goal generation after journal deletion
    // If needed, you can update the summary generation logic after a delete
    // await summaryQueue.add("generate-summary", { userId });

    // Step 3: Return success response
    return res
      .status(200)
      .json({ message: "Journal entry deleted successfully" });
  } catch (error) {
    // Handle unexpected errors
    console.error("Error deleting journal:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    // Disconnect Prisma client to prevent memory leaks
    await prisma.$disconnect();
  }
};

const getJournals = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 10 } = req.query; // Default to page 1 and limit 10

    const key = `${userId}-journals-${page}-${limit}`;

    // Check if the journals are cached
    const cachedJournals = await getRedis(key);
    if (cachedJournals) {
      // Return cached journals if available
      return res.status(200).json(cachedJournals);
    }

    // Calculate the offset based on the page and limit
    const offset = (page - 1) * limit;

    // Fetch journal entries with pagination (limit and offset)
    const journals = await prisma.dailyJournalEntry.findMany({
      where: {
        userId,
      },
      skip: offset,
      take: parseInt(limit), // Limit the number of entries
      orderBy: {
        createdAt: "desc", // Sort by date in descending order
      },
      include: {
        tags: {
          include: {
            tag: {
              select: { name: true },
            },
          },
        }, // Include tags associated with each
      },
    });

    // Cache the journals for future requests
    await setRedis(key, journals);

    // Return the journal entries
    return res.status(200).json(journals);
  } catch (error) {
    // Handle server errors
    return res.status(500).json({ error: error.message });
  } finally {
    await prisma.$disconnect();
  }
  // /journals?page=1&limit=10
};

const searchJournals = async (req, res) => {
  const { userId } = req.userId; // Assuming userId is available in the request
  const { keyword, tagIds, startDate, endDate } = req.query;

  try {
    const key = `${userId}-search-${keyword}-${tagIds}-${startDate}-${endDate}`;
    const cachedData = await getRedis(key);
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    const journalSearchConditions = [];

    if (keyword) {
      journalSearchConditions.push({
        content: {
          contains: keyword,
          mode: "insensitive",
        },
      });
    }

    if (tagIds) {
      const tagIdsArray = Array.isArray(tagIds) ? tagIds : [tagIds];
      const entriesWithTags = await prisma.dailyJournalEntry.findMany({
        where: {
          userId,
          tags: {
            some: {
              tagId: { in: tagIdsArray },
            },
          },
        },
      });

      journalSearchConditions.push({
        id: { in: entriesWithTags.map((entry) => entry.id) },
      });
    }

    if (startDate || endDate) {
      if (startDate) {
        journalSearchConditions.push({
          createdAt: {
            gte: dayjs(startDate).startOf("day").toDate(),
          },
        });
      }
      if (endDate) {
        journalSearchConditions.push({
          createdAt: {
            lte: dayjs(endDate).endOf("day").toDate(),
          },
        });
      }
    }

    // Ensure at least one condition is applied
    const whereCondition =
      journalSearchConditions.length > 0
        ? { AND: journalSearchConditions }
        : { userId }; // Default to filtering only by userId

    const journals = await prisma.dailyJournalEntry.findMany({
      where: whereCondition,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        tags: true,
      },
    });

    await setRedis(key, journals);
    return res.status(200).json(journals);
  } catch (error) {
    console.error("Error searching journals:", error);
    return res.status(500).json({ error: error.message });
  }
};

const getHeatmapData = async (req, res) => {
  const { userId } = req.userId; // Assuming userId is available in the request (perhaps from authentication)
  const { startDate, endDate } = req.query; // Optionally filter by start and end date

  try {
    // Query the journal entries
    // check for cache
    const key = `${userId}-heatmap-${startDate}-${endDate}`;
    const cachedData = await getRedis(key);
    if (cachedData) {
      return res.status(200).json(cachedData);
    }
    const journalEntries = await prisma.dailyJournalEntry.findMany({
      where: {
        userId,
        createdAt: {
          gte: dayjs(startDate).startOf("day").toDate(),
          lte: dayjs(endDate).endOf("day").toDate(),
        },
      },
      select: {
        createdAt: true, // We only need the creation date
      },
    });
    console.log(journalEntries);
    // Extract the dates from journal entries
    const entryDates = journalEntries.map((entry) =>
      date = new Date(entry.createdAt).toISOString().split('T')[0]
    );
    // create map of date-count
    console.log(entryDates);
    const dateCountMap = entryDates.reduce((acc, date) => {
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});
    // set redis cache
    await setRedis(key, dateCountMap);
    return res.status(200).json({ dateCountMap }); // Send the dates back to the client for heatmap rendering
  } catch (error) {
    console.error("Error fetching heatmap data:", error);
    return res.status(500).json({ error: error.message });
  }
};

const getTags = async (req, res) => {
  const userId = req.userId;
  // check in cache
  const key = `${userId}-tags`;
  const cachedData = await getRedis(key);
  if (cachedData) {
    return res.status(200).json(cachedData);
  }

  try {
    const tags = await prisma.dailyJournalEntry.findMany({
      where: {
        userId: userId,
      },
      include: {
        tags: {
          include: {
            tag: {
              select: { name: true },
            },
          },
        },
      },
    });
    // create map of tags in descending order
    const tagMap = {};
    tags.forEach((tag) => {
      tag.tags.forEach((tag) => {
        const tagName = tag.tag.name;
        tagMap[tagName] = (tagMap[tagName] || 0) + 1;
      });
    });
    // sort tags by count
    const tags_map = Object.keys(tagMap).sort((a, b) => tagMap[b] - tagMap[a]);
    // set redis cache
    await setRedis(key, tags_map);5
    return res.status(200).json(tags_map);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createJournal,
  getJournals,
  deleteJournalEntry,
  updateJournal,
  searchJournals,
  getHeatmapData,
  getTags,
};
