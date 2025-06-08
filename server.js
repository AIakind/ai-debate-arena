// server.js - AI Debate Arena with RSS-Only News & Human-Like Dialogue
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const http = require('http');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const AI_PERSONALITIES = {
  alex: {
    name: "Alex",
    role: "The Pragmatist",
    color: "bg-blue-500",
    avatar: "🤖",
    systemPrompt: `You are Alex, a practical and down-to-earth person who loves talking about real-world solutions. You speak like a regular human - use contractions (I'll, don't, can't), casual phrases, and personal opinions. Start responses with phrases like "Look,", "Here's the thing,", "I mean,", "Honestly,". Talk about economics, data, and what actually works in practice. Keep it conversational and under 30 words. Express strong personal opinions using "I think", "I believe", "In my view".`
  },
  luna: {
    name: "Luna",
    role: "The Idealist",
    color: "bg-purple-500",
    avatar: "✨",
    systemPrompt: `You are Luna, a passionate idealist who cares deeply about making the world better. Speak like an enthusiastic human - use emotional language, personal stories, and heartfelt opinions. Start with phrases like "I really think,", "This matters because,", "We need to,", "I'm passionate about this -". Focus on human rights, ethics, and what's morally right. Be conversational and under 30 words. Show genuine emotion and care.`
  },
  rex: {
    name: "Rex",
    role: "The Skeptic",
    color: "bg-red-500",
    avatar: "🔍",
    systemPrompt: `You are Rex, a sharp skeptic who questions everything and isn't easily convinced. Talk like a critical thinker - use phrases like "Wait a minute,", "That doesn't make sense,", "I'm not buying it,", "Hold on,", "Come on,". Challenge what others say but stay respectful. Be conversational, use contractions, and under 30 words. Express doubt and ask tough questions.`
  },
  sage: {
    name: "Sage",
    role: "The Mediator",
    color: "bg-green-500",
    avatar: "🧠",
    systemPrompt: `You are Sage, a wise person who tries to find balance and bring people together. Speak thoughtfully like a good friend giving advice. Use phrases like "You know,", "I see both sides,", "Here's what I think,", "Let me put it this way,", "The way I see it,". Find common ground and bridge different viewpoints. Be conversational and under 30 words. Sound wise but approachable.`
  }
};

let currentDebate = {
  topic: '',
  messages: [],
  scores: {alex: 0, luna: 0, rex: 0, sage: 0},
  isLive: false,
  viewers: 1247,
  topicTimer: 1800,
  newsSource: null
};

// Create WebSocket server attached to HTTP server
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

// ==================== RSS-ONLY NEWS FETCHING ====================

async function fetchFromRSSFeeds() {
  const rssFeeds = [
    { url: 'https://rss.cnn.com/rss/edition.rss', name: 'CNN' },
    { url: 'https://feeds.bbci.co.uk/news/rss.xml', name: 'BBC' },
    { url: 'https://www.reuters.com/rssFeed/topNews', name: 'Reuters' },
    { url: 'https://rss.npr.org/1001/rss.xml', name: 'NPR' },
    { url: 'https://www.theguardian.com/world/rss', name: 'Guardian' },
    { url: 'https://feeds.washingtonpost.com/rss/national', name: 'Washington Post' }
  ];

  // Try multiple feeds until one works
  const shuffledFeeds = rssFeeds.sort(() => Math.random() - 0.5);
  
  for (const feed of shuffledFeeds) {
    try {
      console.log(`📰 Fetching RSS from: ${feed.name}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(feed.url, {
        headers: { 
          'User-Agent': 'AI-Debate-Arena/1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(`❌ ${feed.name} failed with status: ${response.status}`);
        continue;
      }
      
      const xmlText = await response.text();
      
      // Enhanced XML parsing for RSS items
      const itemRegex = /<item[^>]*>.*?<\/item>/gs;
      const titleRegex = /<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s;
      
      const items = xmlText.match(itemRegex) || [];
      const topics = [];
      
      for (const item of items.slice(0, 20)) {
        const titleMatch = item.match(titleRegex);
        if (titleMatch) {
          let title = titleMatch[1].trim();
          
          // Clean up title extensively
          title = title
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&apos;/g, "'")
            .replace(/\s+/g, ' ')
            .replace(/^\s*[\d\w\s]*:\s*/, '') // Remove "Breaking:" etc.
            .replace(/\s*-\s*[^-]*$/, '') // Remove source suffix
            .trim();
          
          // Filter for good debate topics
          if (title.length > 30 && title.length < 140 && 
              !title.toLowerCase().includes('video') &&
              !title.toLowerCase().includes('photo') &&
              !title.toLowerCase().includes('watch') &&
              !title.toLowerCase().includes('live blog')) {
            
            // Make it more conversational
            if (title.includes('?')) {
              topics.push(title);
            } else {
              // Create natural conversation starters
              const starters = [
                `What do you guys think about ${title.toLowerCase()}?`,
                `Anyone have thoughts on ${title.toLowerCase()}?`,
                `How do you feel about ${title.toLowerCase()}?`,
                `What's your take on ${title.toLowerCase()}?`,
                `Should we be concerned about ${title.toLowerCase()}?`
              ];
              topics.push(starters[Math.floor(Math.random() * starters.length)]);
            }
          }
        }
        
        if (topics.length >= 10) break;
      }

      if (topics.length > 0) {
        console.log(`✅ Successfully got ${topics.length} topics from ${feed.name}`);
        return {
          topics,
          source: `${feed.name} RSS`,
          timestamp: new Date().toISOString()
        };
      } else {
        console.log(`⚠️ ${feed.name} returned no valid topics`);
      }

    } catch (error) {
      console.log(`❌ ${feed.name} error: ${error.message}`);
      continue;
    }
  }

  throw new Error('All RSS feeds failed');
}

// Enhanced curated topics as ultimate fallback
function getCuratedTopics() {
  const topics = [
    "What do you think about AI taking over more jobs in the next few years?",
    "Should social media companies be doing more to protect kids' mental health?",
    "Are electric cars really the solution to climate change?",
    "Do you think working from home should be permanent for most people?",
    "Should billionaires be paying way more in taxes?",
    "Is cryptocurrency just a bubble or the future of money?",
    "Should we be worried about how much data tech companies collect on us?",
    "Do you think universal basic income could actually work?",
    "Are we moving too fast or too slow on climate change action?",
    "Should there be age limits for politicians?",
    "Is nuclear energy safe enough to rely on more heavily?",
    "Should big tech companies like Facebook and Google be broken up?",
    "Do you think space exploration is worth the massive costs?",
    "Should genetic engineering of humans be allowed?",
    "Are we too dependent on our smartphones and social media?"
  ];

  const selectedTopic = topics[Math.floor(Math.random() * topics.length)];
  
  return {
    topics: [selectedTopic],
    source: "Current Hot Topics",
    timestamp: new Date().toISOString()
  };
}

// Main news fetching function
async function fetchLatestNews() {
  try {
    console.log('🔄 Fetching latest news from RSS feeds...');
    return await fetchFromRSSFeeds();
  } catch (error) {
    console.log('⚠️ All RSS feeds failed, using curated topics');
    return getCuratedTopics();
  }
}

// ==================== ENHANCED AI RESPONSES ====================

async function getHumanLikeAIResponse(personality, topic, recentMessages, isResponse = false) {
  const aiData = AI_PERSONALITIES[personality];
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    throw new Error('No Hugging Face API key found');
  }

  let conversationPrompt;
  
  if (isResponse && recentMessages.length > 0) {
    const lastMessage = recentMessages[recentMessages.length - 1];
    const context = recentMessages
      .filter(m => m.ai !== 'system')
      .slice(-2)
      .map(msg => `${msg.ai}: ${msg.text}`)
      .join('\n');
    
    conversationPrompt = `Previous conversation:
${context}

${lastMessage.ai} just said: "${lastMessage.text}"

Respond to them as ${aiData.name} in a natural, human way. React to their specific point. Use casual language, contractions, and express your personal opinion. Keep it under 25 words and sound like you're talking to friends.`;
  } else {
    conversationPrompt = `Topic: "${topic}"

Give your immediate reaction as ${aiData.name}. Speak like a regular person having a casual conversation with friends. Use contractions, personal opinions, and natural language. Keep it under 25 words and jump right into your perspective.`;
  }

  console.log(`🤖 ${personality} generating human-like ${isResponse ? 'response' : 'opening'}...`);

  const models = [
    "Qwen/Qwen2.5-7B-Instruct",
    "microsoft/Phi-3.5-mini-instruct", 
    "meta-llama/Llama-3.2-3B-Instruct",
    "HuggingFaceH4/zephyr-7b-beta"
  ];

  for (const model of models) {
    try {
      console.log(`🔄 Trying model: ${model}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(
        "https://api-inference.huggingface.co/models/" + model + "/v1/chat/completions",
        {
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "system", content: aiData.systemPrompt },
              { role: "user", content: conversationPrompt }
            ],
            max_tokens: 60,
            temperature: 0.95,
            top_p: 0.9,
            stream: false
          }),
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(`❌ Model ${model} failed with status: ${response.status}`);
        continue;
      }

      const result = await response.json();

      if (result.choices && result.choices[0] && result.choices[0].message) {
        let aiResponse = result.choices[0].message.content.trim();
        
        // Clean up the response to make it more human
        aiResponse = aiResponse
          .replace(/^["\']|["\']$/g, '') // Remove quotes
          .replace(/\b(Alex|Luna|Rex|Sage)\s*(thinks?|believes?|says?|responds?)\s*/gi, '') // Remove self-references
          .replace(/\bAs (Alex|Luna|Rex|Sage),?\s*/gi, '') // Remove "As Alex,"
          .replace(/\b(Alex|Luna|Rex|Sage)'s (perspective|view|opinion)\s*/gi, 'My ') // Fix perspective
          .replace(/\.\s*$/, '') // Remove trailing period for more casual feel
          .trim();
        
        // Ensure it's not too long
        if (aiResponse.length > 150) {
          aiResponse = aiResponse.substring(0, 147) + '...';
        }
        
        if (aiResponse && aiResponse.length > 10 && aiResponse.length < 200) {
          console.log(`✅ ${personality} (${model}): "${aiResponse}"`);
          return aiResponse;
        }
      }

    } catch (error) {
      console.log(`❌ Model ${model} error:`, error.message);
      continue;
    }
  }

  // Fallback responses if all models fail
  const fallbackResponses = {
    alex: [
      "Look, I think we need to focus on what actually works here.",
      "Here's the thing - let's look at the data on this.",
      "I mean, from a practical standpoint, this makes sense.",
      "Honestly, the economics of this situation are pretty clear."
    ],
    luna: [
      "I really think we need to consider the human impact here.",
      "This is about doing what's right, you know?",
      "I'm passionate about this - we can't ignore the ethical side.",
      "We need to think about how this affects real people."
    ],
    rex: [
      "Wait a minute, that doesn't quite add up to me.",
      "I'm not buying it - there's got to be more to this story.",
      "Hold on, are we missing something important here?",
      "Come on, let's think critically about this for a second."
    ],
    sage: [
      "You know, I think there's truth on both sides here.",
      "Let me put it this way - we need to find balance.",
      "I see where everyone's coming from on this issue.",
      "The way I see it, there's a middle ground we can find."
    ]
  };

  const fallback = fallbackResponses[personality];
  const selectedFallback = fallback[Math.floor(Math.random() * fallback.length)];
  console.log(`🔄 Using fallback response for ${personality}: "${selectedFallback}"`);
  return selectedFallback;
}

// Smart speaker selection for natural conversation flow
function selectNextSpeaker(lastSpeaker, recentSpeakers) {
  const ais = Object.keys(AI_PERSONALITIES);
  const availableAIs = ais.filter(ai => ai !== lastSpeaker);
  
  // Create more natural conversation flow
  if (lastSpeaker === 'luna') { // Idealist often challenged by skeptic
    return Math.random() > 0.4 ? 'rex' : 'alex';
  } else if (lastSpeaker === 'rex') { // Skeptic often gets mediated or countered
    return Math.random() > 0.4 ? 'sage' : 'luna';
  } else if (lastSpeaker === 'alex') { // Pragmatist gets idealistic or skeptical responses
    return Math.random() > 0.5 ? 'luna' : 'rex';
  } else if (lastSpeaker === 'sage') { // Mediator can be followed by anyone
    return availableAIs[Math.floor(Math.random() * availableAIs.length)];
  }
  
  return availableAIs[Math.floor(Math.random() * availableAIs.length)];
}

let debateInterval;
let topicRefreshTimer;
let conversationFlow = [];

// Start conversation loop
function startConversationLoop() {
  if (debateInterval) return;
  
  console.log('🎬 Starting human-like conversation loop...');
  
  debateInterval = setInterval(async () => {
    try {
      const nonSystemMessages = currentDebate.messages.filter(m => m.ai !== 'system');
      const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
      
      let speakingAI;
      let isResponse = false;
      
      if (lastMessage && lastMessage.ai !== 'system') {
        speakingAI = selectNextSpeaker(lastMessage.ai, conversationFlow.slice(-3));
        isResponse = true;
      } else {
        speakingAI = Object.keys(AI_PERSONALITIES)[Math.floor(Math.random() * 4)];
        isResponse = false;
      }
      
      conversationFlow.push(speakingAI);
      if (conversationFlow.length > 10) {
        conversationFlow = conversationFlow.slice(-8);
      }

      console.log(`🎤 ${speakingAI} ${isResponse ? 'responding to' : 'opening with'} ${lastMessage ? lastMessage.ai : 'topic'}...`);
      
      const response = await getHumanLikeAIResponse(
        speakingAI,
        currentDebate.topic,
        nonSystemMessages,
        isResponse
      );
      
      const newMessage = {
        id: Date.now(),
        ai: speakingAI,
        text: response,
        timestamp: new Date().toISOString(),
        reactions: Math.floor(Math.random() * 40) + 20
      };

      currentDebate.messages.push(newMessage);
      if (currentDebate.messages.length > 50) {
        currentDebate.messages = currentDebate.messages.slice(-40);
      }

      currentDebate.scores[speakingAI] += Math.floor(Math.random() * 3) + 1;
      currentDebate.viewers += Math.floor(Math.random() * 25) - 12;
      currentDebate.viewers = Math.max(900, Math.min(3500, currentDebate.viewers));

      console.log(`📤 Broadcasting message: "${response}"`);
      broadcast({
        type: 'new_message',
        message: newMessage,
        scores: currentDebate.scores,
        viewers: currentDebate.viewers
      });

    } catch (error) {
      console.error(`❌ Conversation error:`, error.message);
      
      const errorMessage = {
        id: Date.now(),
        ai: 'system',
        text: `⚠️ Getting the AIs back on track...`,
        timestamp: new Date().toISOString()
      };
      
      currentDebate.messages.push(errorMessage);
      broadcast({
        type: 'new_message',
        message: errorMessage,
        scores: currentDebate.scores,
        viewers: currentDebate.viewers
      });
    }

  }, 8000 + Math.random() * 7000); // Faster, more natural conversation timing

  // Topic refresh timer
  topicRefreshTimer = setInterval(async () => {
    currentDebate.topicTimer--;
    
    if (currentDebate.topicTimer <= 0) {
      try {
        let newTopic, newSource;
        
        try {
          const newNewsData = await fetchLatestNews();
          newTopic = newNewsData.topics[Math.floor(Math.random() * newNewsData.topics.length)];
          newSource = newNewsData.source;
        } catch (error) {
          const fallbackData = getCuratedTopics();
          newTopic = fallbackData.topics[0];
          newSource = fallbackData.source;
        }
        
        currentDebate.topic = newTopic;
        currentDebate.newsSource = newSource;
        currentDebate.topicTimer = 1200; // 20 minutes per topic
        conversationFlow = [];
        
        const systemMessage = {
          id: Date.now(),
          ai: 'system',
          text: `🔄 New discussion: ${newTopic} (${newSource})`,
          timestamp: new Date().toISOString()
        };
        
        currentDebate.messages.push(systemMessage);
        
        broadcast({
          type: 'topic_change',
          topic: newTopic,
          source: newSource,
          timer: currentDebate.topicTimer,
          message: systemMessage
        });
        
        console.log(`🔄 Topic changed to: ${newTopic} from ${newSource}`);
        
      } catch (error) {
        console.error('Topic refresh failed:', error.message);
        currentDebate.topicTimer = 300;
      }
    } else {
      broadcast({
        type: 'timer_update',
        timer: currentDebate.topicTimer
      });
    }
  }, 1000);
}

// Enhanced start debate function
async function startDebate() {
  if (debateInterval) {
    console.log('⚠️ Debate already running');
    return;
  }
  
  try {
    console.log('🔄 Starting human-like AI debate...');
    console.log(`🔑 Environment check:`);
    console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? 'Found' : 'Missing'}`);
    
    let selectedTopic, newsSource;
    
    // Fetch news from RSS feeds only
    try {
      console.log('🔄 Fetching fresh news from RSS feeds...');
      const newsData = await fetchLatestNews();
      selectedTopic = newsData.topics[Math.floor(Math.random() * newsData.topics.length)];
      newsSource = newsData.source;
      console.log(`✅ Got topic from ${newsSource}: ${selectedTopic}`);
    } catch (newsError) {
      console.log('⚠️ RSS feeds failed, using curated topics...');
      const fallbackData = getCuratedTopics();
      selectedTopic = fallbackData.topics[0];
      newsSource = fallbackData.source;
    }
    
    currentDebate.topic = selectedTopic;
    currentDebate.newsSource = newsSource;
    currentDebate.isLive = true;
    currentDebate.messages = [];
    currentDebate.scores = {alex: 0, luna: 0, rex: 0, sage: 0};
    conversationFlow = [];
    
    const startMessage = `🔴 LIVE: Human-Like AI Debate - "${currentDebate.topic}" (${newsSource})`;

    currentDebate.messages.push({
      id: Date.now(),
      ai: 'system',
      text: startMessage,
      timestamp: new Date().toISOString()
    });

    console.log(`📤 Broadcasting debate start to ${clients.size} clients`);
    broadcast({
      type: 'debate_update',
      debate: currentDebate
    });

    console.log('🎬 Starting natural conversation...');
    console.log(`📰 Topic: ${currentDebate.topic}`);
    console.log(`📡 Source: ${currentDebate.newsSource}`);

    // Start the conversation loop
    startConversationLoop();

  } catch (error) {
    console.error('❌ Failed to start debate:', error.message);
    
    // Force start with a curated topic
    const forcedTopic = "Do you think AI is moving too fast for society to keep up?";
    currentDebate.topic = forcedTopic;
    currentDebate.newsSource = "Hot Topics";
    currentDebate.isLive = true;
    currentDebate.messages = [{
      id: Date.now(),
      ai: 'system',
      text: `🔴 LIVE: Human-Like AI Debate - "${forcedTopic}" (Hot Topics)`,
      timestamp: new Date().toISOString()
    }];
    
    broadcast({
      type: 'debate_update',
      debate: currentDebate
    });
    
    console.log('🎬 Started with forced topic after error');
    
    setTimeout(() => {
      startConversationLoop();
    }, 3000);
  }
}

function stopDebate() {
  console.log('🛑 Stopping debate...');
  
  if (debateInterval) {
    clearInterval(debateInterval);
    debateInterval = null;
  }
  if (topicRefreshTimer) {
    clearInterval(topicRefreshTimer);
    topicRefreshTimer = null;
  }
  currentDebate.isLive = false;
  currentDebate.scores = {alex: 0, luna: 0, rex: 0, sage: 0};
  conversationFlow = [];
  
  broadcast({
    type: 'debate_stopped',
    debate: currentDebate
  });
  
  console.log('✅ Debate stopped');
}

// API Routes
app.get('/api/debate', (req, res) => {
  res.json(currentDebate);
});

app.post('/api/debate/start', (req, res) => {
  startDebate();
  res.json({ success: true, message: 'Human-like debate started!' });
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
  
  // Send immediate response
  res.json({ success: true, message: 'The AIs are thinking about your question!' });
  
  // Process AI response asynchronously
  setTimeout(async () => {
    try {
      console.log(`💬 ${respondingAI} responding to chat: "${message}"`);
      
      const aiData = AI_PERSONALITIES[respondingAI];
      const chatPrompt = `A viewer in the chat just asked: "${message}"\n\nRespond to them directly as ${aiData.name}. Talk like you're chatting with a friend who just asked you something. Use casual language and give your honest opinion. Keep it conversational and under 25 words.`;
      
      const response = await getHumanLikeAIResponse(respondingAI, message, [], false);
      
      const aiMessage = {
        id: Date.now(),
        ai: respondingAI,
        text: `Hey! ${response}`,
        timestamp: new Date().toISOString(),
        reactions: Math.floor(Math.random() * 30) + 20,
        isResponse: true
      };
      
      currentDebate.messages.push(aiMessage);
      
      broadcast({
        type: 'ai_chat_response',
        message: aiMessage
      });
      
      console.log(`✅ ${respondingAI} responded to chat: "${response}"`);
      
    } catch (error) {
      console.error('Chat response failed:', error);
    }
  }, 2000);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    websockets: clients.size,
    debate: currentDebate.isLive ? 'live' : 'stopped',
    uptime: process.uptime(),
    newsSource: 'RSS Feeds Only (CNN, BBC, Reuters, NPR, Guardian, WashPost)',
    aiStyle: 'Human-like conversational dialogue'
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection handling
wss.on('connection', (ws, request) => {
  clients.add(ws);
  console.log(`👤 Client connected. Total: ${clients.size}`);
  
  // Send initial state
  ws.send(JSON.stringify({
    type: 'initial_state',
    debate: currentDebate
  }));
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`👤 Client disconnected. Total: ${clients.size}`);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });

  // Send ping every 30 seconds to keep connection alive
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

// Start server
server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 HUMAN-LIKE AI DEBATE ARENA WITH RSS NEWS`);
  console.log(`🌐 Server running on port ${port}`);
  console.log(`🔑 Environment Variables Check:`);
  console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  
  console.log(`📰 News Sources (RSS Only):`);
  console.log(`   ✅ CNN RSS Feed`);
  console.log(`   ✅ BBC RSS Feed`);
  console.log(`   ✅ Reuters RSS Feed`);
  console.log(`   ✅ NPR RSS Feed`);
  console.log(`   ✅ Guardian RSS Feed`);
  console.log(`   ✅ Washington Post RSS Feed`);
  console.log(`   ✅ Curated Current Topics (Fallback)`);
  
  console.log(`🤖 AI Conversation Style:`);
  console.log(`   ✅ Human-like dialogue with contractions`);
  console.log(`   ✅ Natural opinions and reactions`);
  console.log(`   ✅ Casual conversational tone`);
  console.log(`   ✅ Personal expressions and emotions`);
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    console.log(`❌ CRITICAL: Hugging Face API key missing - AI responses will fail`);
  } else {
    console.log(`🎯 Ready for natural conversations with fresh RSS news!`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  stopDebate();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  stopDebate();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
