const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const dayjs = require("dayjs");
const {
  generateSummaryFromMoodAndContentForWeek,
  reflectionAndGrowth,
} = require("../utils/google_functions");

// first i will get entries for current week by getting entries from todays date and -7 to it , and then get entries of past week from -7 from current to -14th date
// entries should be in form mood-entry, then summary and do the stuff

async function getEntries(userId, startDate, endDate) {
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
      select: { mood: true, content: true },
    });
    return journals;
  } catch (error) {
    console.error("Error in getEntries:", error);
    throw error;
  }
}

async function getReflectionsCronJob() {
  try {
    const users = await prisma.user.findMany(); // Get all users
    const startDate = dayjs().subtract(7, "day").toDate(); // Start of current month
    const endDate = dayjs().toDate(); // End of current month

    for (const user of users) {
      const userId = user.id;

      const weekEntries = await getEntries(userId, startDate, endDate);
      const pastWeekEntries = await getEntries(
        userId,
        dayjs(startDate).subtract(7, "day").toDate(),
        startDate
      );
      if (weekEntries.length === 0 || pastWeekEntries.length === 0) {
        console.log(
          `No entries found for user ${userId} for the week ${startDate} to ${endDate}`
        );
        continue;
      }
      const currentWeekSummary =
        generateSummaryFromMoodAndContentForWeek(weekEntries);
      const pastWeekSummary =
        generateSummaryFromMoodAndContentForWeek(pastWeekEntries);
      const reflection = reflectionAndGrowth(
        pastWeekSummary,
        currentWeekSummary
      );
      console.log(reflection);
      // Save reflection to database
      const reflectionData = {
        userId,
        reflection,
      };
      // create new data or update existing one
      const existingReflection = await prisma.reflections.findFirst({
        where: { userId },
      });
      if (existingReflection) {
        await prisma.reflections.update({
          where: { id: existingReflection.id },
          data: reflectionData,
        });
      } else {
        await prisma.reflections.create({ data: reflectionData });
      }
    }
  } catch (error) {
    console.error("Error in getReflectionsCronJob:", error);
    throw error;
  }
}

getReflectionsCronJob().finally(() => {
  prisma.$disconnect();
});
