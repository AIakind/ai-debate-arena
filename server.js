// server.js - Fixed AI Debate Arena with Real Conversations
// Version 2.0
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

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

const wss = new WebSocket.Server({ noServer: true });
const clients = new Set();

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ONLY fetch news from Twitter - no fallback topics
async function fetchNewsFromTwitter() {
  if (!process.env.TWITTER_BEARER_TOKEN) {
    console.log('❌ TWITTER_BEARER_TOKEN not found in environment variables');
    throw new Error('Twitter Bearer Token required for news fetching');
  }

  try {
    console.log('📡 Fetching latest breaking news from Twitter...');
    console.log(`🔑 Token length: ${process.env.TWITTER_BEARER_TOKEN.length} characters`);
    console.log(`🔑 Token starts with: ${process.env.TWITTER_BEARER_TOKEN.substring(0, 10)}...`);
    
    // Pick a random news source
    const newsSource = NEWS_SOURCES[Math.floor(Math.random() * NEWS_SOURCES.length)];
    console.log(`📰 Fetching from @${newsSource}...`);

    // Search for recent tweets from this news source
    const query = `from:${newsSource} -is:retweet -is:reply`;
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=15&tweet.fields=created_at,public_metrics&user.fields=name,username`;
    
    console.log(`🔗 API URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`📡 Response status: ${response.status}`);
    console.log(`📡 Response headers:`, response.headers);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Twitter API error: ${response.status} - ${errorText}`);
      
      if (response.status === 401) {
        throw new Error(`Twitter API Authentication Failed - Check your Bearer Token`);
      } else if (response.status === 403) {
        throw new Error(`Twitter API Access Denied - Check your app permissions`);
      } else if (response.status === 429) {
        throw new Error(`Twitter API Rate Limited - Try again later`);
      } else {
        throw new Error(`Twitter API failed: ${response.status} - ${errorText}`);
      }
    }

    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      console.log(`📰 No recent tweets found from @${newsSource}, trying another source...`);
      throw new Error('No tweets found');
    }

    // Extract debate topics from tweets
    const tweets = data.data.slice(0, 8); // Take top 8 tweets
    const topics = tweets.map(tweet => {
      // Clean up tweet text to create debate topic
      let topic = tweet.text
        .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
        .replace(/@\w+/g, '') // Remove mentions
        .replace(/\n+/g, ' ') // Replace newlines
        .replace(/[📰🚨⚡️🔥💥]/g, '') // Remove news emojis
        .trim()
        .substring(0, 120); // Limit length
      
      // Convert to debate format - make it more conversational
      if (topic.length > 25) {
        if (topic.includes('?')) {
          return topic.split('?')[0] + '?';
        } else if (topic.toLowerCase().includes('biden') || topic.toLowerCase().includes('trump') || topic.toLowerCase().includes('election')) {
          return `What do you think about this political development: ${topic}?`;
        } else if (topic.toLowerCase().includes('climate') || topic.toLowerCase().includes('environment')) {
          return `How should we respond to this environmental issue: ${topic}?`;
        } else if (topic.toLowerCase().includes('tech') || topic.toLowerCase().includes('ai') || topic.toLowerCase().includes('crypto')) {
          return `What are the implications of this tech news: ${topic}?`;
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

// Enhanced AI response that creates real conversations
async function getHuggingFaceChatResponse(personality, topic, recentMessages, isResponse = false) {
  const aiData = AI_PERSONALITIES[personality];
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    throw new Error('No Hugging Face API key found');
  }

  // Build conversation context - focus on the last 3 messages for better flow
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
              {
                role: "system",
                content: aiData.systemPrompt
              },
              {
                role: "user", 
                content: conversationPrompt
              }
            ],
            max_tokens: 100,
            temperature: 0.9,
            stream: false
          }),
        }
      );

      if (!response.ok) continue;

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
      continue;
    }
  }

  throw new Error(`All AI models failed for ${personality}`);
}

// Smart speaker selection for real conversations
function selectNextSpeaker(lastSpeaker, recentSpeakers) {
  const ais = Object.keys(AI_PERSONALITIES);
  
  // Remove last speaker from options
  const availableAIs = ais.filter(ai => ai !== lastSpeaker);
  
  // Smart selection based on personality dynamics
  if (lastSpeaker === 'luna') {
    // After Luna (idealist), Rex (skeptic) or Alex (pragmatist) should respond
    return Math.random() > 0.5 ? 'rex' : 'alex';
  } else if (lastSpeaker === 'rex') {
    // After Rex (skeptic), Luna (idealist) or Sage (mediator) should respond
    return Math.random() > 0.5 ? 'luna' : 'sage';
  } else if (lastSpeaker === 'alex') {
    // After Alex (pragmatist), Luna (idealist) or Rex (skeptic) should respond
    return Math.random() > 0.5 ? 'luna' : 'rex';
  } else if (lastSpeaker === 'sage') {
    // After Sage (mediator), anyone can respond
    return availableAIs[Math.floor(Math.random() * availableAIs.length)];
  }
  
  // Default random selection
  return availableAIs[Math.floor(Math.random() * availableAIs.length)];
}

let debateInterval;
let conversationFlow = [];

async function startDebate() {
  if (debateInterval) return;
  
  try {
    console.log('🔄 Fetching fresh news for debate...');
    
    // ONLY use Twitter news - no fallbacks
    const newsData = await fetchNewsFromTwitter();
    const selectedTopic = newsData.topics[Math.floor(Math.random() * newsData.topics.length)];
    
    currentDebate.topic = selectedTopic;
    currentDebate.newsSource = `Breaking from @${newsData.source}`;
    currentDebate.isLive = true;
    currentDebate.messages = []; // Clear previous messages
    conversationFlow = []; // Reset conversation flow
    
    const startMessage = `🔴 LIVE: Breaking News Debate - "${currentDebate.topic}" (${currentDebate.newsSource})`;

    currentDebate.messages.push({
      id: Date.now(),
      ai: 'system',
      text: startMessage,
      timestamp: new Date().toISOString()
    });

    broadcast({
      type: 'debate_update',
      debate: currentDebate
    });

    console.log('🎬 Starting live news debate...');
    console.log(`📰 Topic: ${currentDebate.topic}`);

    // Start the conversation loop
    debateInterval = setInterval(async () => {
      try {
        const nonSystemMessages = currentDebate.messages.filter(m => m.ai !== 'system');
        const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
        
        let speakingAI;
        let isResponse = false;
        
        if (lastMessage && lastMessage.ai !== 'system') {
          // Someone just spoke, select who responds
          speakingAI = selectNextSpeaker(lastMessage.ai, conversationFlow.slice(-3));
          isResponse = true;
        } else {
          // Opening statement - random AI starts
          speakingAI = Object.keys(AI_PERSONALITIES)[Math.floor(Math.random() * 4)];
          isResponse = false;
        }
        
        conversationFlow.push(speakingAI);
        if (conversationFlow.length > 10) {
          conversationFlow = conversationFlow.slice(-8); // Keep recent history
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

        broadcast({
          type: 'new_message',
          message: newMessage,
          scores: currentDebate.scores,
          viewers: currentDebate.viewers
        });

      } catch (error) {
        console.error(`❌ Conversation error:`, error.message);
        
        // If AI fails, try to continue with another AI
        const errorMessage = {
          id: Date.now(),
          ai: 'system',
          text: `⚠️ Processing latest news updates...`,
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

    }, 12000 + Math.random() * 8000); // 12-20 seconds between responses

    // Topic refresh timer - get new news every 25 minutes
    const topicTimer = setInterval(async () => {
      currentDebate.topicTimer--;
      
      if (currentDebate.topicTimer <= 0) {
        try {
          const newNewsData = await fetchNewsFromTwitter();
          const newTopic = newNewsData.topics[Math.floor(Math.random() * newNewsData.topics.length)];
          
          currentDebate.topic = newTopic;
          currentDebate.newsSource = `Breaking from @${newNewsData.source}`;
          currentDebate.topicTimer = 1500; // 25 minutes
          conversationFlow = []; // Reset conversation flow for new topic
          
          const systemMessage = {
            id: Date.now(),
            ai: 'system',
            text: `📰 BREAKING: ${newTopic} (${newNewsData.source})`,
            timestamp: new Date().toISOString()
          };
          
          currentDebate.messages.push(systemMessage);
          
          broadcast({
            type: 'topic_change',
            topic: newTopic,
            source: newNewsData.source,
            timer: currentDebate.topicTimer,
            message: systemMessage
          });
        } catch (error) {
          console.error('❌ Failed to refresh news:', error.message);
          currentDebate.topicTimer = 300; // Try again in 5 minutes
        }
      } else {
        broadcast({
          type: 'timer_update',
          timer: currentDebate.topicTimer
        });
      }
    }, 1000);

  } catch (error) {
    console.error('❌ Failed to start debate:', error.message);
    
    // Show error to users
    currentDebate.messages.push({
      id: Date.now(),
      ai: 'system',
      text: `❌ Unable to fetch news. Please check Twitter API configuration.`,
      timestamp: new Date().toISOString()
    });
    
    broadcast({
      type: 'debate_update',
      debate: currentDebate
    });
  }
}

function stopDebate() {
  if (debateInterval) {
    clearInterval(debateInterval);
    debateInterval = null;
  }
  currentDebate.isLive = false;
  currentDebate.scores = {alex: 0, luna: 0, rex: 0, sage: 0};
  conversationFlow = [];
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
  res.json({ success: true, message: 'Live news debate started!' });
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

  // FIXED: AI actually responds to chat messages
  const respondingAI = Object.keys(AI_PERSONALITIES)[Math.floor(Math.random() * 4)];
  
  setTimeout(async () => {
    try {
      console.log(`💬 ${respondingAI} responding to chat: "${message}"`);
      
      // Create a chat-specific prompt that encourages first-person response
      const aiData = AI_PERSONALITIES[respondingAI];
      const chatPrompt = `A viewer in the chat said: "${message}"\n\nRespond to them directly as ${aiData.name}. Use "I", "me", "my" when speaking. Be conversational and address their comment. Keep it to 1-2 sentences.`;
      
      const models = ["Qwen/Qwen2.5-7B-Instruct", "microsoft/Phi-3.5-mini-instruct"];
      
      for (const model of models) {
        try {
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
            }
          );

          if (response.ok) {
            const result = await response.json();
            if (result.choices && result.choices[0] && result.choices[0].message) {
              let aiResponse = result.choices[0].message.content.trim();
              
              // Ensure first person
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
          continue;
        }
      }
      
    } catch (error) {
      console.error('Chat response failed:', error);
    }
  }, 2000);

  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`🚀 LIVE NEWS AI DEBATE ARENA`);
  console.log(`🔑 Hugging Face: ${process.env.HUGGINGFACE_API_KEY ? 'Connected ✅' : 'Missing ❌'}`);
  console.log(`🐦 Twitter API: ${process.env.TWITTER_BEARER_TOKEN ? 'Connected ✅' : 'Missing ❌'}`);
  console.log(`📰 News Sources: ${NEWS_SOURCES.length} accounts`);
  console.log(`🤖 Real AI conversations with live breaking news!`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`👤 Client connected. Total: ${clients.size}`);
  
  ws.send(JSON.stringify({
    type: 'initial_state',
    debate: currentDebate
  }));
  
  ws.on('close', () => {
    clients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});
