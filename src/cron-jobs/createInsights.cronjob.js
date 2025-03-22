const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const dayjs = require("dayjs");
const { createInsights } = require("../utils/google_functions");

async function getTagMap(userId, startDate, endDate) {
  try {
    const journalSearchConditions = [];
    if (startDate) {
      journalSearchConditions.push({
        createdAt: { gte: dayjs(startDate).startOf("day").toDate() },
      });
    }
    if (endDate) {
      journalSearchConditions.push({
        createdAt: { lte: dayjs(endDate).endOf("day").toDate() },
      });
    }

    const journals = await prisma.dailyJournalEntry.findMany({
      where: { userId, AND: journalSearchConditions },
      orderBy: { createdAt: "desc" },
      include: { tags: { include: { tag: { select: { name: true } } } } },
    });
    const tagMap = {};
    journals.forEach((journal) => {
      journal.tags.forEach((tag) => {
        const tagName = tag.tag.name;
        tagMap[tagName] = (tagMap[tagName] || 0) + 1;
      });
    });

    return tagMap;
  } catch (error) {
    console.error("Error in getTagMap:", error);
    throw error;
  }
}

async function createInsightsCronJob() {
  try {
    const users = await prisma.user.findMany(); // Get all users
    const startDate = dayjs().startOf("month").toDate(); // Start of current month
    const endDate = dayjs().endOf("month").toDate(); // End of current month
    // const startDate = dayjs().startOf("month").subtract(1, "month").toDate();
    // const endDate = dayjs().endOf("month").subtract(1, "month").toDate();

    for (const user of users) {
      const userId = user.id;

      const monthYear = String(new Date().getMonth()) + "-"+ String(new Date().getFullYear()); // Current month and year
      // const monthYear = `${dayjs().subtract(1, "month").format("MM-YYYY")}`;
      const summary = await prisma.montlyEntrySummary.findFirst({
        where: { userId, monthYear },
      });

      if (summary) {
        const result_json = await createInsights(summary.content);
        // console.log(`Insights for User ${userId} for ${monthYear}:`, result_json);
        const insights = result_json["insights"];
        const key_themes = result_json["key themes"];
        // console.log(`Insights for User ${userId}:`, insights);
        await prisma.insights.create({
          data: {
            userId,
            monthYear,
            insights,
            keyThemes : key_themes,
          },
        });
      } else {
        console.warn(`No summary found for User ${userId} for ${MonthYear}`);
      }
    }
  } catch (error) {
    console.error("Error in createInsightsCronJob:", error);
  }
}

// Schedule the cron job to run at 23:59 on the last day of every month
// cron.schedule("59 23 28-31 * *", () => {
//   if (dayjs().endOf("month").date() === dayjs().date()) {
//     console.log("Running monthly insights cron job...");
//     createInsightsCronJob();
//   }
// });

createInsightsCronJob();
