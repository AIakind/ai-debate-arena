// server.js - Bulletproof AI Debate Arena
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const http = require('http');
require('dotenv').config(); // Keep this for local development

const app = express();
const port = process.env.PORT || 3001;
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Strong AI personalities
const AI_PERSONALITIES = {
    marcus: {
        name: "Marcus",
        role: "The Capitalist",
        color: "bg-blue-600",
        avatar: "💼",
        systemPrompt: "You are Marcus, a hardcore capitalist. You believe free markets solve everything. Speak confidently about business, profits, and competition. Reference economic data when possible. Keep responses around 40-50 words but complete your thoughts." // Adjusted prompt
    },
    zara: {
        name: "Zara",
        role: "The Progressive",
        color: "bg-green-600",
        avatar: "🌱",
        systemPrompt: "You are Zara, a fierce progressive. You fight for social justice and equality. Speak passionately about helping people and fixing systemic issues. Reference inequality and injustice. Keep responses around 40-50 words but complete your thoughts." // Adjusted prompt
    },
    viktor: {
        name: "Viktor",
        role: "The Realist",
        color: "bg-gray-600",
        avatar: "⚖️",
        systemPrompt: "You are Viktor, a pragmatic realist. You focus on what actually works and point out problems with idealistic plans. Speak bluntly about trade-offs and human nature. Keep responses around 40-50 words but complete your thoughts." // Adjusted prompt
    },
    aria: {
        name: "Aria",
        role: "The Futurist",
        color: "bg-purple-600",
        avatar: "🚀",
        systemPrompt: "You are Aria, a tech-optimist futurist. You believe technology will solve humanity's problems. Speak enthusiastically about innovation and future possibilities. Keep responses around 40-50 words but complete your thoughts." // Adjusted prompt
    }
};

// Curated debate topics with context (rest of this is unchanged)
const DEBATE_TOPICS = [
    {
        topic: "Should companies be allowed to replace workers with AI without providing retraining?",
        context: "AI chatbots have replaced 40% of customer service jobs at major companies, saving billions but displacing thousands of workers. Only 31% found comparable employment.",
        category: "Technology"
    },
    {
        topic: "Should Universal Basic Income replace traditional welfare systems?",
        context: "Finland's UBI trial gave citizens $800 monthly. Mental health improved and entrepreneurship increased, but critics worry about work incentives and costs.",
        category: "Economy"
    },
    {
        topic: "Is nuclear power essential for fighting climate change?",
        context: "47 new nuclear reactors are under construction globally. Nuclear produces clean energy but creates radioactive waste lasting 10,000 years.",
        category: "Environment"
    },
    {
        topic: "Should social media algorithms be regulated to protect teen mental health?",
        context: "Research shows teens using algorithm-driven platforms 3+ hours daily have 67% higher depression rates. Internal documents reveal companies knew this.",
        category: "Technology"
    },
    {
        topic: "Should wealth taxes be implemented to reduce extreme inequality?",
        context: "The richest 1% control 47% of global wealth while bottom 50% own just 2%. This matches 1929 levels before the Great Depression.",
        category: "Economy"
    },
    {
        topic: "Should cryptocurrency be banned due to environmental impact?",
        context: "Bitcoin mining consumes more electricity than Argentina and produces 65 million tons of CO2 annually, but enables financial inclusion for 2 billion unbanked people.",
        category: "Technology"
    },
    {
        topic: "Can renewable energy replace fossil fuels without grid reliability issues?",
        context: "Renewables hit 30% of global electricity but require massive battery storage. California's grid nearly collapsed when solar overheated and wind stopped.",
        category: "Environment"
    },
    {
        topic: "Should gig economy workers be classified as employees or contractors?",
        context: "California's law requiring Uber to provide benefits increased driver pay 28% but reduced rides 21% and increased prices 17%.",
        category: "Economy"
    },
    {
        topic: "Should deepfake technology be banned or strictly regulated?",
        context: "89% of online disinformation now uses deepfakes. They're used for political manipulation and non-consensual pornography, but also enable creative applications.",
        category: "Technology"
    },
    {
        topic: "Should gene editing be limited to diseases or allowed for enhancement?",
        context: "CRISPR has eliminated hereditary diseases in 2,100 embryos, but wealthy families use it for intelligence and athletic enhancement, creating genetic inequality.",
        category: "Society"
    }
];

let currentDebate = {
    topic: '',
    context: '',
    messages: [],
    scores: {marcus: 0, zara: 0, viktor: 0, aria: 0},
    isLive: false,
    viewers: 1247,
    topicTimer: 1200,
    category: ''
};

const wss = new WebSocket.Server({
    server,
    clientTracking: true,
    perMessageDeflate: false
});

const clients = new Set();

function broadcast(data) {
    const message = JSON.stringify(data);
    console.log(`📡 Broadcasting to ${clients.size} clients:`, data.type);

    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error('Error sending to client:', error);
                clients.delete(client);
            }
        } else {
            clients.delete(client);
        }
    });
}

function getRandomTopic() {
    return DEBATE_TOPICS[Math.floor(Math.random() * DEBATE_TOPICS.length)];
}

// === START MODIFIED getAIResponse FUNCTION ===
async function getAIResponse(personality, topic, context, recentMessages, isResponse = false) {
    const aiData = AI_PERSONALITIES[personality];

    // --- IMPORTANT: Check for API Key ---
    if (!process.env.HUGGINGFACE_API_KEY) {
        console.warn("HUGGINGFACE_API_KEY is not set. Using fallback responses.");
        const fallbacks = {
            marcus: "Market forces will optimize this situation better than any government intervention.",
            zara: "We need policies that prioritize people over profits and protect vulnerable communities.",
            viktor: "The real-world implementation has trade-offs that both sides are ignoring here.",
            aria: "Emerging technology will solve these problems in ways we haven't imagined yet."
        };
        return fallbacks[personality];
    }

    let promptContent;
    let apiMessages = [];

    // Always start with the system prompt for the chat completion API
    apiMessages.push({ role: "system", content: aiData.systemPrompt });

    if (isResponse && recentMessages.length > 0) {
        const lastMessage = recentMessages[recentMessages.length - 1];

        // Add a few relevant recent messages to the API call's message history.
        // This is crucial for conversational models to understand context and avoid repetition.
        // Hugging Face chat completion models expect a structured conversation.
        const relevantHistory = recentMessages.slice(-4); // Take the last 4 non-system messages
        relevantHistory.forEach(msg => {
            // Represent previous AI's messages as 'assistant' and others as 'user' if applicable.
            // For now, assuming `msg.ai` indicates an AI, and `msg.text` is its content.
            // Adjust this logic if you also have "user" messages in `currentDebate.messages` that
            // need to be distinguished.
            apiMessages.push({ role: msg.ai ? "assistant" : "user", content: msg.text });
        });

        // The specific instruction for the current AI's turn
        promptContent = `Previous speaker (${AI_PERSONALITIES[lastMessage.ai].name}) said: "${lastMessage.text}". Given the current debate topic "${topic}" and context "${context}", respond directly to their point. Argue against their perspective, reinforce your own strong opinion, or pivot the discussion while staying on topic. Be direct, opinionated, and concise.`;
        apiMessages.push({ role: "user", content: promptContent });

    } else {
        // Initial prompt for an AI starting a new debate segment
        promptContent = `Topic: ${topic}\nContext: ${context}\n\nGive your strong opinion on this topic as ${aiData.name}. Reference the context. Be opinionated and direct.`;
        apiMessages.push({ role: "user", content: promptContent });
    }

    const models = ["Qwen/Qwen2.5-7B-Instruct", "microsoft/Phi-3.5-mini-instruct"];

    for (const model of models) {
        try {
            const controller = new AbortController();
            // Increased timeout as models can sometimes be slow to respond
            const timeoutId = setTimeout(() => {
                controller.abort();
                console.warn(`⏳ API call to ${model} for ${personality} timed out after 20 seconds.`); // More descriptive timeout
            }, 20000); // Increased to 20 seconds

            console.log(`Attempting to call Hugging Face model: ${model} for ${personality}...`);
            // Uncomment the next line to see the exact payload sent to Hugging Face
            // console.log("Sending messages:", JSON.stringify(apiMessages, null, 2));

            const response = await fetch(
                `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    method: "POST",
                    body: JSON.stringify({
                        model: model,
                        messages: apiMessages, // <-- This is the crucial part: use the structured messages array
                        max_tokens: 150, // Increased token limit for more varied responses
                        temperature: 1.0, // Increased temperature for more creativity
                        // top_p: 0.9, // Optional: You can experiment with top_p for more focused diversity
                        // repetition_penalty: 1.1 // Optional: Can help reduce direct repetition if the model tends to loop
                    }),
                    signal: controller.signal
                }
            );

            clearTimeout(timeoutId); // Clear timeout if response is received in time

            if (response.ok) {
                const result = await response.json();
                // Uncomment the next line to see the raw response from Hugging Face
                // console.log("Raw API result for", personality, ":", JSON.stringify(result, null, 2));

                if (result.choices && result.choices[0] && result.choices[0].message) {
                    let aiResponse = result.choices[0].message.content.trim();

                    // Clean up response - ensure this doesn't accidentally remove too much
                    aiResponse = aiResponse
                        .replace(/^["\']|["\']$/g, '') // Remove leading/trailing quotes
                        .replace(/\b(Marcus|Zara|Viktor|Aria)\s*(thinks?|believes?|says?)\s*/gi, '') // Remove self-references
                        .replace(/^(Look,|Well,|So,|You know,)\s*/gi, '') // Remove common filler starters
                        .replace(/(\r\n|\n|\r)/gm, " ") // Replace newlines with spaces to keep it on one line if desired
                        .trim();

                    if (aiResponse.length > 15) { // Increased minimum length slightly
                        console.log(`✅ ${personality} (via ${model}): "${aiResponse}"`);
                        return aiResponse;
                    } else {
                        console.warn(`⚠️ ${personality} (via ${model}) returned too short/empty response after cleanup: "${aiResponse}". Raw result:`, JSON.stringify(result));
                    }
                } else {
                    console.warn(`⚠️ ${personality} (via ${model}) returned no valid choices or message in result. Raw result:`, JSON.stringify(result));
                }
            } else {
                const errorText = await response.text();
                console.error(`❌ Hugging Face API error (${model}, Status: ${response.status}) for ${personality}: ${errorText}`);
                if (response.status === 401) {
                    console.error("  Reason: Unauthorized. Check your HUGGINGFACE_API_KEY.");
                } else if (response.status === 429) {
                    console.error("  Reason: Rate limit exceeded. Try again later or upgrade.");
                }
            }
        } catch (error) {
            console.error(`❌ API call to ${model} for ${personality} failed (Catch block):`, error.message);
            if (error.name === 'AbortError') {
                console.error(`  Reason: Request timed out. Consider increasing timeout or trying a different model.`);
            }
        }
    }

    // Fallback responses - only reached if all API calls completely fail or return unusable results
    const fallbacks = {
        marcus: "The market will decide, always. It's the most efficient mechanism. No alternative works as well.",
        zara: "Systemic issues demand a just, equitable response. We must act for all, not just a few.",
        viktor: "Idealism meets reality; every solution has a cost and its own set of problems. Be pragmatic.",
        aria: "Innovation will inevitably pave the way forward. The future is bright with tech-driven solutions."
    };
    console.log(`Using fallback for ${personality}.`);
    return fallbacks[personality];
}
// === END MODIFIED getAIResponse FUNCTION ===


// Rest of your server.js code (unchanged from your original, other than the new function above)

let debateInterval;
let topicTimer;

function startDebateLoop() {
    if (debateInterval) return;

    console.log('🎬 Starting debate loop...');

    debateInterval = setInterval(async () => {
        try {
            const nonSystemMessages = currentDebate.messages.filter(m => m.ai !== 'system');
            const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];

            let speakingAI;
            let isResponse = false;

            if (lastMessage && lastMessage.ai !== 'system') {
                speakingAI = selectNextSpeaker(lastMessage.ai);
                isResponse = true;
            } else {
                speakingAI = Object.keys(AI_PERSONALITIES)[Math.floor(Math.random() * 4)];
            }

            console.log(`🎤 ${speakingAI} speaking...`);

            const response = await getAIResponse(
                speakingAI,
                currentDebate.topic,
                currentDebate.context,
                nonSystemMessages, // Pass the filtered messages for context
                isResponse
            );

            const newMessage = {
                id: Date.now(),
                ai: speakingAI,
                text: response,
                timestamp: new Date().toISOString(),
                reactions: Math.floor(Math.random() * 50) + 20
            };

            currentDebate.messages.push(newMessage);
            if (currentDebate.messages.length > 40) {
                currentDebate.messages = currentDebate.messages.slice(-30);
            }

            currentDebate.scores[speakingAI] += Math.floor(Math.random() * 3) + 1;
            currentDebate.viewers += Math.floor(Math.random() * 20) - 10;
            currentDebate.viewers = Math.max(1000, Math.min(5000, currentDebate.viewers));

            broadcast({
                type: 'new_message',
                message: newMessage,
                scores: currentDebate.scores,
                viewers: currentDebate.viewers
            });

        } catch (error) {
            console.error('Debate error:', error.message);
        }
    }, 10000 + Math.random() * 5000);

    // Topic timer
    topicTimer = setInterval(() => {
        currentDebate.topicTimer--;

        if (currentDebate.topicTimer <= 0) {
            const newTopicData = getRandomTopic();
            currentDebate.topic = newTopicData.topic;
            currentDebate.context = newTopicData.context;
            currentDebate.category = newTopicData.category;
            currentDebate.topicTimer = 1200;

            const systemMessage = {
                id: Date.now(),
                ai: 'system',
                text: `🔥 NEW DEBATE: ${newTopicData.topic} (${newTopicData.category})`,
                timestamp: new Date().toISOString()
            };

            currentDebate.messages.push(systemMessage);

            broadcast({
                type: 'topic_change',
                topic: newTopicData.topic,
                context: newTopicData.context,
                category: newTopicData.category,
                timer: currentDebate.topicTimer,
                message: systemMessage
            });

            console.log(`🔄 New topic: ${newTopicData.topic}`);
        } else {
            broadcast({
                type: 'timer_update',
                timer: currentDebate.topicTimer
            });
        }
    }, 1000);
}

function selectNextSpeaker(lastSpeaker) {
    const speakers = Object.keys(AI_PERSONALITIES);
    const available = speakers.filter(s => s !== lastSpeaker);

    // Create opposition
    if (lastSpeaker === 'marcus') return Math.random() > 0.5 ? 'zara' : 'viktor';
    if (lastSpeaker === 'zara') return Math.random() > 0.5 ? 'marcus' : 'aria';
    if (lastSpeaker === 'viktor') return Math.random() > 0.5 ? 'aria' : 'marcus';
    if (lastSpeaker === 'aria') return Math.random() > 0.5 ? 'viktor' : 'zara';

    return available[Math.floor(Math.random() * available.length)];
}


function startDebate() {
    if (debateInterval) {
        console.log('⚠️ Debate already running');
        return;
    }

    console.log('🔄 Starting debate...');

    const topicData = getRandomTopic();
    currentDebate.topic = topicData.topic;
    currentDebate.context = topicData.context;
    currentDebate.category = topicData.category;
    currentDebate.isLive = true;
    currentDebate.messages = [];
    currentDebate.scores = {marcus: 0, zara: 0, viktor: 0, aria: 0};

    const startMessage = {
        id: Date.now(),
        ai: 'system',
        text: `🔴 LIVE: Opinionated AI Debate - ${topicData.topic} (${topicData.category})`,
        timestamp: new Date().toISOString()
    };

    currentDebate.messages.push(startMessage);

    broadcast({
        type: 'debate_update',
        debate: currentDebate
    });

    console.log(`📰 Topic: ${topicData.topic}`);
    startDebateLoop();
}

function stopDebate() {
    console.log('🛑 Stopping debate...');

    if (debateInterval) {
        clearInterval(debateInterval);
        debateInterval = null;
    }
    if (topicTimer) {
        clearInterval(topicTimer);
        topicTimer = null;
    }

    currentDebate.isLive = false;
    currentDebate.scores = {marcus: 0, zara: 0, viktor: 0, aria: 0};

    broadcast({
        type: 'debate_stopped',
        debate: currentDebate
    });
}

// API Routes
app.get('/api/debate', (req, res) => {
    res.json(currentDebate);
});

app.post('/api/debate/start', (req, res) => {
    startDebate();
    res.json({ success: true, message: 'Debate started!' });
});

app.post('/api/debate/stop', (req, res) => {
    stopDebate();
    res.json({ success: true, message: 'Debate stopped' });
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;

    if (!message || !currentDebate.isLive) {
        return res.status(400).json({ error: 'Invalid message or debate not live' });
    }

    const respondingAI = Object.keys(AI_PERSONALITIES)[Math.floor(Math.random() * 4)];

    res.json({ success: true, message: 'AI is thinking about your question...' });

    setTimeout(async () => {
        try {
            console.log(`💬 ${respondingAI} responding to chat: "${message}"`);

            // Create a special chat context
            // For chat, we send the user's direct question as the user prompt.
            // The AI's system prompt defines its persona.
            const chatApiMessages = [
                { role: "system", content: AI_PERSONALITIES[respondingAI].systemPrompt },
                { role: "user", content: `A viewer asked: "${message}". Give your perspective on this question, addressing the viewer directly.` }
            ];

            const response = await fetch(
                `https://api-inference.huggingface.co/models/microsoft/Phi-3.5-mini-instruct/v1/chat/completions`, // Can specify one model for chat
                {
                    headers: {
                        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    method: "POST",
                    body: JSON.stringify({
                        model: "microsoft/Phi-3.5-mini-instruct",
                        messages: chatApiMessages,
                        max_tokens: 100, // Slightly more tokens for chat
                        temperature: 0.8
                    }),
                    signal: new AbortController().signal // Use a fresh controller for this isolated request
                }
            );

            if (response.ok) {
                const result = await response.json();
                if (result.choices && result.choices[0] && result.choices[0].message) {
                    let aiResponse = result.choices[0].message.content.trim();
                    aiResponse = aiResponse
                        .replace(/^["\']|["\']$/g, '')
                        .replace(/\b(Marcus|Zara|Viktor|Aria)\s*(thinks?|believes?|says?)\s*/gi, '')
                        .replace(/^(Look,|Well,|So,|You know,)\s*/gi, '')
                        .trim();

                    const aiMessage = {
                        id: Date.now(),
                        ai: respondingAI,
                        text: `@Viewer: ${aiResponse}`,
                        timestamp: new Date().toISOString(),
                        reactions: Math.floor(Math.random() * 30) + 15,
                        isResponse: true
                    };

                    currentDebate.messages.push(aiMessage);

                    broadcast({
                        type: 'ai_chat_response',
                        message: aiMessage
                    });

                    console.log(`✅ ${respondingAI} responded to chat: "${aiResponse}"`);
                } else {
                    console.warn(`⚠️ Chat API for ${respondingAI} returned no valid choices:`, result);
                    throw new Error("Invalid chat API response structure");
                }
            } else {
                const errorText = await response.text();
                console.error(`❌ Chat API error for ${respondingAI} (Status: ${response.status}): ${errorText}`);
                throw new Error(`Chat API failed with status ${response.status}`);
            }

        } catch (error) {
            console.error('❌ Chat response failed:', error);

            // Send fallback response if AI fails
            const fallbackResponses = {
                marcus: "That's an interesting business question that market dynamics will ultimately resolve.",
                zara: "Thanks for asking - this touches on important social justice issues we need to address.",
                viktor: "Good question, but the practical implementation would be more complex than it appears.",
                aria: "Great question! Technology will likely transform how we think about this entirely."
            };

            const fallbackMessage = {
                id: Date.now(),
                ai: respondingAI,
                text: `@Viewer: ${fallbackResponses[respondingAI]}`,
                timestamp: new Date().toISOString(),
                reactions: Math.floor(Math.random() * 20) + 10,
                isResponse: true
            };

            currentDebate.messages.push(fallbackMessage);

            broadcast({
                type: 'ai_chat_response',
                message: fallbackMessage
            });
        }
    }, 1500);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        websockets: clients.size,
        debate: currentDebate.isLive ? 'live' : 'stopped',
        uptime: process.uptime()
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket handling (unchanged)
wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`👤 Client connected. Total: ${clients.size}`);

    ws.send(JSON.stringify({
        type: 'initial_state',
        debate: currentDebate
    }));

    // Auto-start debate if not already running
    if (!currentDebate.isLive && clients.size === 1) {
        console.log('🎬 Auto-starting debate for first client...');
        setTimeout(() => {
            startDebate();
        }, 2000);
    }

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`👤 Client disconnected. Total: ${clients.size}`);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });

    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        } else {
            clearInterval(pingInterval);
        }
    }, 30000);

    ws.on('close', () => {
        clearInterval(pingInterval);
    });
});

// Start server (unchanged)
server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 BULLETPROOF AI DEBATE ARENA`);
    console.log(`🌐 Server running on port ${port}`);
    console.log(`🔑 HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? '✅' : '❌'}`); // Check key presence
    console.log(`📚 Loaded ${DEBATE_TOPICS.length} debate topics`);
    console.log(`🤖 4 opinionated AI personalities ready`);
    console.log(`🎯 Ready for debates!`);
});

// Graceful shutdown (unchanged)
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down...');
    stopDebate();
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down...');
    stopDebate();
    server.close(() => process.exit(0));
});
