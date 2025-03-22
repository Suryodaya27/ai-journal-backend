const { GoogleGenerativeAI } = require("@google/generative-ai");
const { z } = require('zod');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function generateSummary(combinedEntries, maxRetries = 3) {
    const prompt = `Summarize the following journal entries with a focus on the user's productivity, recurring emotions, and key events. Highlight patterns and themes that are helpful for growth and improvement. Write it in third person, referring to the user as 'user'. 
    Ensure the summary is concise yet insightful, with a minimum of 100 words:
    ${combinedEntries}`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} of summary generation...`);
            const summaryResponse = await model.generateContent(prompt);
            const summary = summaryResponse.response.text().trim();

            // Basic validation: Check length and presence of key terms
            if (summary) {
                console.log('Validation successful');
                return summary;
            } else {
                throw new Error('Validation failed: Summary does not meet criteria.');
            }
        } catch (error) {
            console.error(`Error on attempt ${attempt}:`, error.message);

            // Retry if not the last attempt
            if (attempt < maxRetries) {
                console.log('Retrying...');
            } else {
                console.error('Max retries reached. Returning null.');
                return null; // Return null if all retries fail
            }
        }
    }
}

async function generateGoalsAndSuggestions(summarized_content, maxRetries = 3) {
    const prompt = `Using the following summarized content, generate actionable output in JSON format with three fields: "goals", "suggestions", and "reminders". 
    Each field should contain up to 5 items, focusing on productivity, maintaining momentum, and monthly reminders. 
    Summarized content: ${summarized_content}

    Expected JSON format:
    {
        "goals": ["Goal 1", "Goal 2", "Goal 3"],
        "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"],
        "reminders": ["Reminder 1", "Reminder 2", "Reminder 3"]
    }`;
    const ResponseSchema = z.object({
        goals: z.array(z.string()).max(5, 'Too many goals provided'),
        suggestions: z.array(z.string()).max(5, 'Too many suggestions provided'),
        reminders: z.array(z.string()).max(5, 'Too many reminders provided'),
    });
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} of goals and suggestion generation...`);
            const goalsResponse = await model.generateContent(prompt);
            let responseText = goalsResponse.response.text();

            // Clean the response
            responseText = responseText.replace(/```json|```/g, '').trim();

            // Parse and validate response
            const parsedResponse = JSON.parse(responseText);
            const validatedResponse = ResponseSchema.parse(parsedResponse);

            // Return validated response if successful
            console.log('Validation successful');
            return validatedResponse;
        } catch (error) {
            console.error(`Error on attempt ${attempt}:`, error.message);

            // Log response text if parsing failed
            if (error instanceof SyntaxError || error.name === 'ZodError') {
                console.error('Invalid response:', error.message);
            }

            // Retry if not the last attempt
            if (attempt < maxRetries) {
                console.log('Retrying...');
            } else {
                console.error('Max retries reached. Failing gracefully.');
                return null; // Return null if all retries fail
            }
        }
    }
}

async function patternDetection(combinedSummarizedEntries, maxRetries = 3) {
    const prompt = `Analyze the following journal entries and identify recurring topics, events, or emotional patterns. 
    Highlight trends that will help the user improve productivity and self-awareness. 
    Emphasize recent entries to reflect the user's current state.
    Entries: ${combinedSummarizedEntries}
    
    Expected JSON format:
    {
        "key themes": ["theme1", "theme2"],
        "mood trends": "Mood description"
    }`;
    const PatternDetectionSchema = z.object({
        "key themes": z.array(z.string()).min(1, 'At least one key theme is required'),
        "mood trends": z.string().nonempty('Mood trends must not be empty'),
    });
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} of pattern detection...`);
            const patternResponse = await model.generateContent(prompt);
            let responseText = patternResponse.response.text().trim();

            // Clean up response
            responseText = responseText.replace(/```json|```/g, '').trim();

            // Parse and validate response
            const parsedResponse = JSON.parse(responseText);
            const validatedResponse = PatternDetectionSchema.parse(parsedResponse);

            console.log('Validation successful');
            return validatedResponse;
        } catch (error) {
            console.error(`Error on attempt ${attempt}:`, error.message);

            if (error instanceof SyntaxError || error.name === 'ZodError') {
                console.error('Invalid response structure:', error.errors || error.message);
            }

            if (attempt < maxRetries) {
                console.log('Retrying...');
            } else {
                console.error('Max retries reached. Returning null.');
                return null; // Return null if all retries fail
            }
        }
    }
}

async function reflectionAndGrowth(pastMonthEntry, currentMonthEntry, maxRetries = 3) {
    const prompt = `Reflect on the past month and set goals for the upcoming month based on the user's entries. 
    Provide actionable reflections on areas for improvement and suggest practical goals for improving productivity and well-being. 
    Past Month Entry: ${pastMonthEntry} 
    Current Month Entry: ${currentMonthEntry}
    
    Expected JSON format:
    {
        "reflection": ["Reflection 1", "Reflection 2"],
    }`;
    const ReflectionAndGoalsSchema = z.object({
        reflection: z.array(z.string()).min(1, 'At least one reflection is required'),
        goals: z.array(z.string()).min(1, 'At least one goal is required'),
    });
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} of reflection and growth generation...`);
            const reflectionResponse = await model.generateContent(prompt);
            let responseText = reflectionResponse.response.text().trim();

            // Clean up response
            responseText = responseText.replace(/```json|```/g, '').trim();

            // Parse and validate response
            const parsedResponse = JSON.parse(responseText);
            const validatedResponse = ReflectionAndGoalsSchema.parse(parsedResponse);

            console.log('Validation successful');
            return validatedResponse;
        } catch (error) {
            console.error(`Error on attempt ${attempt}:`, error.message);

            if (error instanceof SyntaxError || error.name === 'ZodError') {
                console.error('Invalid response structure:', error.message);
            }

            if (attempt < maxRetries) {
                console.log('Retrying...');
            } else {
                console.error('Max retries reached. Failing gracefully.');
                return null; // Return null if retries fail
            }
        }
    }
}

async function createInsights(summary, maxRetries = 3) {
    const prompt = `Using the provided monthly summary, generate actionable insights and identify key themes based on recurring patterns and topics. 
    Ensure the insights are concise, practical, and aligned with the user's growth and development goals. 
    Summary: ${summary}

    Expected JSON format:
    {
        "insights": ["Insight 1", "Insight 2"],
        "key themes": ["Theme 1", "Theme 2"]
    }`;
    const InsightsSchema = z.object({
        insights: z.array(z.string()).min(1, 'At least one insight is required'),
        "key themes": z.array(z.string()).min(1, 'At least one key theme is required'),
    });
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} of creating insights...`);
            const insightsResponse = await model.generateContent(prompt);
            let responseText = insightsResponse.response.text().trim();

            // Clean the response of any extra formatting
            responseText = responseText.replace(/```json|```/g, '').trim();

            // Parse and validate the response
            const parsedResponse = JSON.parse(responseText);
            const validatedResponse = InsightsSchema.parse(parsedResponse);

            console.log('Validation successful');
            return validatedResponse; // Return validated response if successful
        } catch (error) {
            console.error(`Error on attempt ${attempt}:`, error.message);

            // Handle validation or parsing errors
            if (error instanceof SyntaxError || error.name === 'ZodError') {
                console.error('Invalid response structure:', error.message);
            }

            // Retry if not the last attempt
            if (attempt < maxRetries) {
                console.log('Retrying...');
            } else {
                console.error('Max retries reached. Failing gracefully.');
                return null; // Return null if all retries fail
            }
        }
    }
}

async function generateSummaryFromMoodAndContent(content,mood,maxRetries=3){
    const prompt = `Generate a summary of the user's journal entries based on the mood and content provided. 
    Ensure the summary captures the user's emotional state, key events, and productivity levels. 
    Content: ${content}
    Mood: ${mood}`;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} of summary generation...`);
            const summaryResponse = await model.generateContent(prompt);
            const summary = summaryResponse.response.text().trim();

            // Basic validation: Check length and presence of key terms
            if (summary.length >= 10) {
                console.log('Validation successful');
                return summary;
            } else {
                throw new Error('Validation failed: Summary does not meet criteria.');
            }
        } catch (error) {
            console.error(`Error on attempt ${attempt}:`, error.message);

            // Retry if not the last attempt
            if (attempt < maxRetries) {
                console.log('Retrying...');
            } else {
                console.error('Max retries reached. Returning null.');
                return null; // Return null if all retries fail
            }
        }
    }
}

async function generateSummaryFromMoodAndContentForWeek(data,maxRetries=3){
    const prompt = `Generate a summary of the user's journal entries based on the array of mood and content provided of the whole week. 
    Ensure the summary captures the user's emotional state, key events, and productivity levels. 
    Content: ${data}`;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} of summary generation...`);
            const summaryResponse = await model.generateContent(prompt);
            const summary = summaryResponse.response.text().trim();

            // Basic validation: Check length and presence of key terms
            if (summary.length >= 10) {
                console.log('Validation successful');
                return summary;
            } else {
                throw new Error('Validation failed: Summary does not meet criteria.');
            }
        } catch (error) {
            console.error(`Error on attempt ${attempt}:`, error.message);

            // Retry if not the last attempt
            if (attempt < maxRetries) {
                console.log('Retrying...');
            } else {
                console.error('Max retries reached. Returning null.');
                return null; // Return null if all retries fail
            }
        }
    }
}   

module.exports = { generateSummary, generateGoalsAndSuggestions, patternDetection, reflectionAndGrowth, createInsights,generateSummaryFromMoodAndContent,generateSummaryFromMoodAndContentForWeek };
