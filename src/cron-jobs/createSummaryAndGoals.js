const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { generateSummary,generateGoalsAndSuggestions,generateSummaryFromMoodAndContent } = require("../utils/google_functions");

const createSummaryAndGoals = async (content,mood,userId) => {
    try{
        const currentMonthYear = String(new Date().getMonth()) + "-"+ String(new Date().getFullYear());
        // get current month and check for this months summary , if present update it else create a new one
        summary = await prisma.montlyEntrySummary.findFirst({
            where:{
                userId : userId,
                monthYear : currentMonthYear
            }
        })
        goalsAndSuggestions = await prisma.goalsAndSuggestions.findFirst({
            where:{
                userId : userId
            }
        })
        summarized_entry = await generateSummaryFromMoodAndContent(content,mood);
        console.log("Summarized Entry: ",summarized_entry);
        if (summary){
            new_content = summary.content + summarized_entry;
            summarized_content = await generateSummary(new_content);
            goals_and_suggestions = await generateGoalsAndSuggestions(summarized_content);
            await prisma.montlyEntrySummary.update({
                where:{
                    id : summary.id
                },
                data:{
                    content: summarized_content
                }
            })
            await prisma.goalsAndSuggestions.update({
                where:{
                    id : goalsAndSuggestions.id,
                },
                data:{
                    content: goals_and_suggestions
                }
            })
        }
        else{
            await prisma.montlyEntrySummary.create({
                data:{
                    userId,
                    monthYear: currentMonthYear,
                    content: summarized_entry
                }
            })
            goals_and_suggestions = await generateGoalsAndSuggestions(summarized_entry);
            await prisma.goalsAndSuggestions.create({
                data:{
                    userId,
                    content: goals_and_suggestions
                }
            })
        }
    }
    catch(error){
        console.log(error);
    }
    finally{
        await prisma.$disconnect();
    }
}


module.exports = { createSummaryAndGoals };