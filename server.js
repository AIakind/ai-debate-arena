// server.js - Railway-Optimized AI Debate Arena
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
    systemPrompt: "You are Alex, a pragmatic debater. Always speak in first person (I, me, my, myself). Focus on economics, data, and practical solutions. Be conversational and respond directly to what others say. Keep responses to 1-2 sentences maximum."
  },
  luna: {
    name: "Luna",
    role: "The Idealist",
    color: "bg-purple-500",
    avatar: "✨",
    systemPrompt: "You are Luna, an idealistic debater. Always speak in first person (I, me, my, myself). Champion human rights, ethics, and moral principles. Be passionate and respond directly to what others say. Keep responses to 1-2 sentences maximum."
  },
  rex: {
    name: "Rex",
    role: "The Skeptic",
    color: "bg-red-500",
    avatar: "🔍",
    systemPrompt: "You are Rex, a skeptical debater. Always speak in first person (I, me, my, myself). Question assumptions and challenge what others say. Be critical but constructive. Keep responses to 1-2 sentences maximum."
  },
  sage: {
    name: "Sage",
    role: "The Mediator",
    color: "bg-green-500",
    avatar: "🧠",
    systemPrompt: "You are Sage, a wise mediator. Always speak in first person (I, me, my, myself). Find common ground and bridge different perspectives. Respond thoughtfully to others' points. Keep responses to 1-2 sentences maximum."
  }
};

// News sources to follow on Twitter
const NEWS_SOURCES = [
  'cnn', 'bbc', 'reuters', 'ap', 'nytimes', 'washingtonpost', 
  'guardiannews', 'wsj', 'ft', 'techcrunch', 'wired', 'verge', 
  'axios', 'politico', 'breaking911', 'abcnews', 'cbsnews'
];

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

// Enhanced fetch news with better error handling
async function fetchNewsFromTwitter() {
  if (!process.env.TWITTER_BEARER_TOKEN) {
    console.log('❌ TWITTER_BEARER_TOKEN not found in environment variables');
    throw new Error('Twitter Bearer Token required for news fetching');
  }

  try {
    console.log('📡 Fetching latest breaking news from Twitter...');
    const newsSource = NEWS_SOURCES[Math.floor(Math.random() * NEWS_SOURCES.length)];
    console.log(`📰 Fetching from @${newsSource}...`);

    const query = `from:${newsSource} -is:retweet -is:reply`;
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=15&tweet.fields=created_at,public_metrics&user.fields=name,username`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Twitter API error: ${response.status} - ${errorText}`);
      throw new Error(`Twitter API failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      console.log(`📰 No recent tweets found from @${newsSource}`);
      throw new Error('No tweets found');
    }

    // Convert tweets to debate topics
    const tweets = data.data.slice(0, 8);
    const topics = tweets.map(tweet => {
      let topic = tweet.text
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/@\w+/g, '')
        .replace(/\n+/g, ' ')
        .replace(/[📰🚨⚡️🔥💥]/g, '')
        .trim()
        .substring(0, 120);
      
      if (topic.length > 25) {
        if (topic.includes('?')) {
          return topic.split('?')[0] + '?';
        } else {
          return `What's your take on this breaking news: ${topic}?`;
        }
      }
      return null;
    }).filter(Boolean);

    if (topics.length > 0) {
      console.log(`✅ Found ${topics.length} debate topics from @${newsSource}`);
      return {
        topics,
        source: newsSource,
        timestamp: new Date().toISOString()
      };
    }

    throw new Error('No valid topics generated');

  } catch (error) {
    console.error('❌ Error fetching Twitter news:', error.message);
    throw error;
  }
}

// Enhanced AI response with retry logic
async function getHuggingFaceChatResponse(personality, topic, recentMessages, isResponse = false) {
  const aiData = AI_PERSONALITIES[personality];
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    throw new Error('No Hugging Face API key found');
  }

  const context = recentMessages
    .filter(m => m.ai !== 'system')
    .slice(-3)
    .map(msg => `${msg.ai}: ${msg.text}`)
    .join('\n');

  let conversationPrompt;
  if (isResponse && recentMessages.length > 0) {
    const lastMessage = recentMessages[recentMessages.length - 1];
    conversationPrompt = `You are in a live debate. ${lastMessage.ai} just said: "${lastMessage.text}"\n\nRespond directly to what they said as ${aiData.name}. Use "I", "me", "my" when speaking. Be conversational and engage with their point.`;
  } else {
    conversationPrompt = `You are starting a debate about: "${topic}"\n\nGive your opening perspective as ${aiData.name}. Use "I", "me", "my" when speaking. Be conversational and state your position clearly.`;
  }

  console.log(`🤖 ${personality} generating ${isResponse ? 'response' : 'opening'}...`);

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
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

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
            max_tokens: 100,
            temperature: 0.9,
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
        
        // Ensure first person usage
        aiResponse = aiResponse
          .replace(/\bAlex thinks?\b/gi, 'I think')
          .replace(/\bLuna believes?\b/gi, 'I believe')
          .replace(/\bRex questions?\b/gi, 'I question')
          .replace(/\bSage suggests?\b/gi, 'I suggest')
          .replace(/\b(Alex|Luna|Rex|Sage)'s perspective\b/gi, 'My perspective')
          .replace(/\b(Alex|Luna|Rex|Sage) would\b/gi, 'I would');
        
        if (aiResponse && aiResponse.length > 15) {
          console.log(`✅ ${personality} (${model}): ${aiResponse}`);
          return aiResponse;
        }
      }

    } catch (error) {
      console.log(`❌ Model ${model} error:`, error.message);
      continue;
    }
  }

  throw new Error(`All AI models failed for ${personality}`);
}

// Smart speaker selection for real conversations
function selectNextSpeaker(lastSpeaker, recentSpeakers) {
  const ais = Object.keys(AI_PERSONALITIES);
  const availableAIs = ais.filter(ai => ai !== lastSpeaker);
  
  if (lastSpeaker === 'luna') {
    return Math.random() > 0.5 ? 'rex' : 'alex';
  } else if (lastSpeaker === 'rex') {
    return Math.random() > 0.5 ? 'luna' : 'sage';
  } else if (lastSpeaker === 'alex') {
    return Math.random() > 0.5 ? 'luna' : 'rex';
  } else if (lastSpeaker === 'sage') {
    return availableAIs[Math.floor(Math.random() * availableAIs.length)];
  }
  
  return availableAIs[Math.floor(Math.random() * availableAIs.length)];
}

let debateInterval;
let topicRefreshTimer;
let conversationFlow = [];

// Start conversation loop with better error handling
function startConversationLoop() {
  if (debateInterval) return;
  
  console.log('🎬 Starting conversation loop...');
  
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
      
      const response = await getHuggingFaceChatResponse(
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
        reactions: Math.floor(Math.random() * 50) + 15
      };

      currentDebate.messages.push(newMessage);
      if (currentDebate.messages.length > 50) {
        currentDebate.messages = currentDebate.messages.slice(-40);
      }

      currentDebate.scores[speakingAI] += Math.floor(Math.random() * 3) + 1;
      currentDebate.viewers += Math.floor(Math.random() * 30) - 15;
      currentDebate.viewers = Math.max(850, Math.min(4500, currentDebate.viewers));

      console.log(`📤 Broadcasting new message from ${speakingAI}`);
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
        text: `⚠️ Processing latest updates...`,
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

  }, 12000 + Math.random() * 8000);

  // Topic refresh timer
  topicRefreshTimer = setInterval(async () => {
    currentDebate.topicTimer--;
    
    if (currentDebate.topicTimer <= 0) {
      try {
        let newTopic, newSource;
        
        try {
          const newNewsData = await fetchNewsFromTwitter();
          newTopic = newNewsData.topics[Math.floor(Math.random() * newNewsData.topics.length)];
          newSource = `Breaking from @${newNewsData.source}`;
        } catch (error) {
          const currentTopics = [
            "What's your take on the latest developments in artificial intelligence?",
            "How should society handle the growing influence of social media?", 
            "What are your thoughts on the current state of climate action?",
            "Should cryptocurrencies be regulated more strictly?",
            "What's your perspective on remote work vs office policies?",
            "How do you view recent advances in space exploration?",
            "What are the implications of rising automation in the workplace?",
            "Should big tech companies face more privacy regulations?",
            "What's your opinion on renewable energy adoption?",
            "How should we approach the ethics of genetic engineering?"
          ];
          newTopic = currentTopics[Math.floor(Math.random() * currentTopics.length)];
          newSource = "Trending debates";
        }
        
        currentDebate.topic = newTopic;
        currentDebate.newsSource = newSource;
        currentDebate.topicTimer = 1500;
        conversationFlow = [];
        
        const systemMessage = {
          id: Date.now(),
          ai: 'system',
          text: `🔄 New topic: ${newTopic} (${newSource})`,
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
      } catch (error) {
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
    console.log('🔄 Starting AI debate...');
    console.log(`🔑 Environment check:`);
    console.log(`   TWITTER_BEARER_TOKEN: ${process.env.TWITTER_BEARER_TOKEN ? 'Found' : 'Missing'}`);
    console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? 'Found' : 'Missing'}`);
    
    let selectedTopic, newsSource;
    
    // Try to fetch news, but have fallback topics ready
    try {
      console.log('🔄 Attempting to fetch fresh news for debate...');
      const newsData = await fetchNewsFromTwitter();
      selectedTopic = newsData.topics[Math.floor(Math.random() * newsData.topics.length)];
      newsSource = `Breaking from @${newsData.source}`;
    } catch (newsError) {
      console.log('⚠️ Twitter news fetch failed, using curated current topics...');
      
      const currentTopics = [
        "What's your take on the latest AI breakthrough in autonomous vehicles?",
        "How should we respond to the growing concerns about social media addiction?",
        "What are the implications of the recent climate change summit decisions?",
        "Should governments regulate cryptocurrency more strictly?",
        "What's your perspective on the debate over remote work policies?",
        "How do you view the latest developments in space exploration?",
        "What's your opinion on the current state of global supply chains?",
        "Should there be more regulations on data privacy and big tech?",
        "What's your take on the rise of renewable energy investments?",
        "How should society handle the ethics of genetic engineering?"
      ];
      
      selectedTopic = currentTopics[Math.floor(Math.random() * currentTopics.length)];
      newsSource = "Current trending debates";
    }
    
    currentDebate.topic = selectedTopic;
    currentDebate.newsSource = newsSource;
    currentDebate.isLive = true;
    currentDebate.messages = [];
    currentDebate.scores = {alex: 0, luna: 0, rex: 0, sage: 0};
    conversationFlow = [];
    
    const startMessage = newsSource.includes('Breaking') 
      ? `🔴 LIVE: Breaking News Debate - "${currentDebate.topic}" (${newsSource})`
      : `🔴 LIVE: AI Debate - "${currentDebate.topic}" (${newsSource})`;

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

    console.log('🎬 Starting live debate...');
    console.log(`📰 Topic: ${currentDebate.topic}`);
    console.log(`📡 Source: ${currentDebate.newsSource}`);

    // Always start the conversation loop
    startConversationLoop();

  } catch (error) {
    console.error('❌ Failed to start debate:', error.message);
    
    // Force start with a curated topic if everything fails
    const forcedTopic = "What's your perspective on the impact of artificial intelligence on society?";
    currentDebate.topic = forcedTopic;
    currentDebate.newsSource = "Current debates";
    currentDebate.isLive = true;
    currentDebate.messages = [{
      id: Date.now(),
      ai: 'system',
      text: `🔴 LIVE: AI Debate - "${forcedTopic}" (Current debates)`,
      timestamp: new Date().toISOString()
    }];
    
    broadcast({
      type: 'debate_update',
      debate: currentDebate
    });
    
    console.log('🎬 Started with forced topic after error');
    
    // Start the conversation anyway
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
  res.json({ success: true, message: 'Live debate started!' });
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
  res.json({ success: true, message: 'Message sent to AIs!' });
  
  // Process AI response asynchronously
  setTimeout(async () => {
    try {
      console.log(`💬 ${respondingAI} responding to chat: "${message}"`);
      
      const aiData = AI_PERSONALITIES[respondingAI];
      const chatPrompt = `A viewer in the chat said: "${message}"\n\nRespond to them directly as ${aiData.name}. Use "I", "me", "my" when speaking. Be conversational and address their comment. Keep it to 1-2 sentences.`;
      
      const models = ["Qwen/Qwen2.5-7B-Instruct", "microsoft/Phi-3.5-mini-instruct"];
      
      for (const model of models) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

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
                  { role: "user", content: chatPrompt }
                ],
                max_tokens: 80,
                temperature: 0.8
              }),
              signal: controller.signal
            }
          );

          clearTimeout(timeoutId);

          if (response.ok) {
            const result = await response.json();
            if (result.choices && result.choices[0] && result.choices[0].message) {
              let aiResponse = result.choices[0].message.content.trim();
              
              aiResponse = aiResponse
                .replace(/\b(Alex|Luna|Rex|Sage)\b/gi, 'I')
                .replace(/\bthe (pragmatist|idealist|skeptic|mediator)\b/gi, 'I');
              
              const aiMessage = {
                id: Date.now(),
                ai: respondingAI,
                text: `@Chat: ${aiResponse}`,
                timestamp: new Date().toISOString(),
                reactions: Math.floor(Math.random() * 25) + 15,
                isResponse: true
              };
              
              currentDebate.messages.push(aiMessage);
              
              broadcast({
                type: 'ai_chat_response',
                message: aiMessage
              });
              
              console.log(`✅ ${respondingAI} responded to chat: ${aiResponse}`);
              break;
            }
          }
        } catch (error) {
          console.log(`❌ Chat response error with ${model}:`, error.message);
          continue;
        }
      }
      
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
    uptime: process.uptime()
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection handling
wss.on('connection', (ws, request) => {
  clients.add(ws);
  console.log(`👤 Client connected from ${request.socket.remoteAddress}. Total: ${clients.size}`);
  
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
  console.log(`🚀 LIVE AI DEBATE ARENA STARTED`);
  console.log(`🌐 Server running on port ${port}`);
  console.log(`🔑 Environment Variables Check:`);
  console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   TWITTER_BEARER_TOKEN: ${process.env.TWITTER_BEARER_TOKEN ? '✅ Connected' : '❌ Missing'}`);
  
  if (process.env.TWITTER_BEARER_TOKEN) {
    console.log(`   🔑 Token length: ${process.env.TWITTER_BEARER_TOKEN.length} chars`);
    console.log(`   🔑 Token preview: ${process.env.TWITTER_BEARER_TOKEN.substring(0, 15)}...`);
  }
  
  console.log(`📰 News Sources: ${NEWS_SOURCES.length} accounts`);
  console.log(`🤖 Real AI conversations with ${process.env.TWITTER_BEARER_TOKEN ? 'live news' : 'curated topics'}!`);
  console.log(`🔗 WebSocket server attached to HTTP server`);
  
  if (!process.env.TWITTER_BEARER_TOKEN) {
    console.log(`⚠️  Twitter integration disabled - will use fallback topics`);
  }
  if (!process.env.HUGGINGFACE_API_KEY) {
    console.log(`❌ CRITICAL: Hugging Face API key missing - AI responses will fail`);
  }

  console.log(`🎯 Ready for connections!`);
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
