const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const {setRedis,getRedis} = require("../utils/redis_functions")

const getGoalsAndSuggestionsAndreminders = async (req, res) => {
    try {
        const userId = req.userId;
        const key = `${userId}-goals`;
        // Check if the data is cached
        const cachedData = await getRedis(key);
        if (cachedData) {
            // Return cached data
            return res.status(200).json(cachedData);
        }

        // Fetch goals and suggestions for the user
        const goalsAndSuggestions = await prisma.goalsAndSuggestions.findFirst({
        where: {
            userId,
        },
        });
        // Cache the data
        await setRedis(key, goalsAndSuggestions);
        // Return goals and suggestions
        return res.status(200).json(goalsAndSuggestions);
    } catch (error) {
        // Handle server errors
        return res.status(500).json({ error: error.message });
    } finally {
        await prisma.$disconnect();
    }
};  

module.exports = { getGoalsAndSuggestionsAndreminders };