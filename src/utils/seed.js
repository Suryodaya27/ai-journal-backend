const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const tags = [
  { name: "Work & Career" },
  { name: "Health & Wellness" },
  { name: "Personal Growth" },
  { name: "Goals & Achievements" },
  { name: "Emotions & Mood" },
  { name: "Relationships" },
  { name: "Habits & Routines" },
  { name: "Challenges" },
  { name: "Gratitude" },
  { name: "Productivity" },
  { name: "Finance" },       // Optional
  { name: "Hobbies" },       // Optional
  { name: "Travel" },        // Optional
  { name: "Ideas" },         // Optional
  { name: "Sleep" },         // Optional
];

async function seedTags() {
  try {
    console.log("Seeding tags...");

    for (const tag of tags) {
      await prisma.tag.create({
        data: tag,
      });
    }

    console.log("Tags seeded successfully!");
  } catch (error) {
    console.error("Error seeding tags:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedTags();
