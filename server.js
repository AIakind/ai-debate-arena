// server.js - AI Debate Arena with Twitter News Integration
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
    systemPrompt: "You are Alex, a pragmatic debater who focuses on economics, data, and practical solutions. Respond in 1-2 sentences with specific facts when possible."
  },
  luna: {
    name: "Luna",
    role: "The Idealist",
    color: "bg-purple-500",
    avatar: "✨",
    systemPrompt: "You are Luna, an idealistic debater who champions human rights, ethics, and moral principles. Respond in 1-2 sentences with passion for justice."
  },
  rex: {
    name: "Rex",
    role: "The Skeptic",
    color: "bg-red-500",
    avatar: "🔍",
    systemPrompt: "You are Rex, a skeptical debater who questions assumptions and points out problems. Respond in 1-2 sentences by challenging claims."
  },
  sage: {
    name: "Sage",
    role: "The Mediator",
    color: "bg-green-500",
    avatar: "🧠",
    systemPrompt: "You are Sage, a wise mediator who finds common ground. Respond in 1-2 sentences by bridging different perspectives."
  }
};

// News sources to follow on Twitter
const NEWS_SOURCES = [
  'cnn',
  'bbc',
  'reuters',
  'ap',
  'nytimes',
  'washingtonpost',
  'guardiannews',
  'wsj',
  'ft',
  'techcrunch',
  'wired',
  'verge',
  'axios',
  'politico'
];

let newsTopics = [];
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

// Fetch recent tweets from news sources
async function fetchNewsFromTwitter() {
  if (!process.env.TWITTER_BEARER_TOKEN) {
    console.log('⚠️ No Twitter Bearer Token found - using fallback topics');
    return null;
  }

  try {
    console.log('📡 Fetching latest news from Twitter...');
    
    // Pick a random news source
    const newsSource = NEWS_SOURCES[Math.floor(Math.random() * NEWS_SOURCES.length)];
    console.log(`📰 Fetching from @${newsSource}...`);

    // Search for recent tweets from this news source
    const query = `from:${newsSource} -is:retweet -is:reply`;
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=10&tweet.fields=created_at,public_metrics&user.fields=name,username`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Twitter API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      console.log(`📰 No recent tweets found from @${newsSource}`);
      return null;
    }

    // Extract debate topics from tweets
    const tweets = data.data.slice(0, 5); // Take top 5 tweets
    const topics = tweets.map(tweet => {
      // Clean up tweet text to create debate topic
      let topic = tweet.text
        .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
        .replace(/@\w+/g, '') // Remove mentions
        .replace(/\n+/g, ' ') // Replace newlines
        .trim()
        .substring(0, 100); // Limit length
      
      // Convert to debate format
      if (topic.length > 20) {
        if (topic.includes('?')) {
          return topic.split('?')[0] + '?';
        } else {
          return `Should we be concerned about: ${topic}?`;
        }
      }
      return null;
    }).filter(Boolean);

    if (topics.length > 0) {
      console.log(`✅ Found ${topics.length} news topics from @${newsSource}`);
      return {
        topics,
        source: newsSource,
        timestamp: new Date().toISOString()
      };
    }

    return null;

  } catch (error) {
    console.error('❌ Error fetching Twitter news:', error.message);
    return null;
  }
}

// Enhanced topic selection with news integration
async function selectDebateTopic() {
  // Try to fetch fresh news every few topics
  if (Math.random() > 0.3) { // 70% chance to fetch news
    const newsData = await fetchNewsFromTwitter();
    if (newsData && newsData.topics.length > 0) {
      const newsTopic = newsData.topics[Math.floor(Math.random() * newsData.topics.length)];
      return {
        topic: newsTopic,
        source: `Latest from @${newsData.source}`,
        isNews: true
      };
    }
  }

  // Fallback to standard debate topics
  const standardTopics = [
    "Should AI have rights and legal protections?",
    "Is universal basic income necessary as automation increases?",
    "Should social media platforms be regulated like public utilities?",
    "Is privacy dead in the digital age?",
    "Should we colonize Mars or fix Earth first?",
    "Should genetic engineering be allowed in humans?",
    "Is nuclear energy the solution to climate change?",
    "Should we ban autonomous weapons systems?",
    "Is cryptocurrency the future of money?",
    "Should deepfakes be banned entirely?"
  ];

  return {
    topic: standardTopics[Math.floor(Math.random() * standardTopics.length)],
    source: "Trending debate topics",
    isNews: false
  };
}

// Enhanced AI response with news context
async function getHuggingFaceChatResponse(personality, topic, recentMessages, newsContext = null) {
  const aiData = AI_PERSONALITIES[personality];
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    throw new Error('No Hugging Face API key found');
  }

  // Build conversation context
  const context = recentMessages
    .slice(-2)
    .map(msg => `${msg.ai}: ${msg.text}`)
    .join('\n');

  const newsContextText = newsContext ? `\n\nNews Context: This topic is based on recent news coverage.` : '';

  console.log(`🤖 ${personality} using Hugging Face Chat API...`);

  const models = [
    "Qwen/Qwen2.5-7B-Instruct",
    "microsoft/Phi-3.5-mini-instruct", 
    "meta-llama/Llama-3.2-3B-Instruct",
    "HuggingFaceH4/zephyr-7b-beta"
  ];

  for (const model of models) {
    try {
      console.log(`🔄 Trying ${model} for ${personality}...`);
      
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
                content: aiData.systemPrompt + newsContextText
              },
              {
                role: "user", 
                content: `Current debate topic: "${topic}"\n\nRecent conversation:\n${context}\n\nWhat's your perspective as ${aiData.name}?`
              }
            ],
            max_tokens: 80,
            temperature: 0.8,
            stream: false
          }),
        }
      );

      if (!response.ok) {
        continue;
      }

      const result = await response.json();

      if (result.choices && result.choices[0] && result.choices[0].message) {
        const aiResponse = result.choices[0].message.content.trim();
        
        if (aiResponse && aiResponse.length > 10) {
          console.log(`✅ ${personality} (${model}): ${aiResponse}`);
          return aiResponse;
        }
      }

    } catch (error) {
      continue;
    }
  }

  throw new Error(`All Hugging Face APIs failed for ${personality}`);
}

let debateInterval;

async function startDebate() {
  if (debateInterval) return;
  
  // Select topic with news integration
  const topicData = await selectDebateTopic();
  currentDebate.topic = topicData.topic;
  currentDebate.newsSource = topicData.source;
  currentDebate.isLive = true;
  
  const startMessage = topicData.isNews 
    ? `🔴 LIVE: Breaking News Debate - "${currentDebate.topic}" (${topicData.source})`
    : `🔴 LIVE: AI Debate - "${currentDebate.topic}"`;

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

  console.log('🎬 Starting AI debate with news integration...');
  console.log(`📰 Topic: ${currentDebate.topic}`);
  console.log(`📡 Source: ${currentDebate.newsSource}`);

  debateInterval = setInterval(async () => {
    const ais = Object.keys(AI_PERSONALITIES);
    const speakingAI = ais[Math.floor(Math.random() * ais.length)];

    try {
      console.log(`🎤 ${speakingAI} generating response...`);
      
      const response = await getHuggingFaceChatResponse(
        speakingAI,
        currentDebate.topic,
        currentDebate.messages.filter(m => m.ai !== 'system').slice(-3),
        currentDebate.newsSource
      );
      
      const newMessage = {
        id: Date.now(),
        ai: speakingAI,
        text: response,
        timestamp: new Date().toISOString(),
        reactions: Math.floor(Math.random() * 50) + 10
      };

      currentDebate.messages.push(newMessage);
      if (currentDebate.messages.length > 50) {
        currentDebate.messages = currentDebate.messages.slice(-40);
      }

      currentDebate.scores[speakingAI] += Math.floor(Math.random() * 3) + 1;
      currentDebate.viewers += Math.floor(Math.random() * 25) - 12;
      currentDebate.viewers = Math.max(800, Math.min(4000, currentDebate.viewers));

      broadcast({
        type: 'new_message',
        message: newMessage,
        scores: currentDebate.scores,
        viewers: currentDebate.viewers
      });

    } catch (error) {
      console.error(`❌ Failed for ${speakingAI}:`, error.message);
      
      const errorMessage = {
        id: Date.now(),
        ai: 'system',
        text: `⚠️ ${speakingAI} is thinking... (processing news context)`,
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

  }, 15000 + Math.random() * 10000);

  // Enhanced topic timer with news refresh
  const topicTimer = setInterval(async () => {
    currentDebate.topicTimer--;
    
    if (currentDebate.topicTimer <= 0) {
      const newTopicData = await selectDebateTopic();
      currentDebate.topic = newTopicData.topic;
      currentDebate.newsSource = newTopicData.source;
      currentDebate.topicTimer = 1800;
      
      const isNewsUpdate = newTopicData.isNews ? "📰 Breaking: " : "🔄 New topic: ";
      const systemMessage = {
        id: Date.now(),
        ai: 'system',
        text: `${isNewsUpdate}${newTopicData.topic} (${newTopicData.source})`,
        timestamp: new Date().toISOString()
      };
      
      currentDebate.messages.push(systemMessage);
      
      broadcast({
        type: 'topic_change',
        topic: newTopicData.topic,
        source: newTopicData.source,
        timer: currentDebate.topicTimer,
        message: systemMessage
      });
    } else {
      broadcast({
        type: 'timer_update',
        timer: currentDebate.topicTimer
      });
    }
  }, 1000);
}

function stopDebate() {
  if (debateInterval) {
    clearInterval(debateInterval);
    debateInterval = null;
  }
  currentDebate.isLive = false;
  currentDebate.scores = {alex: 0, luna: 0, rex: 0, sage: 0};
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
  res.json({ success: true, message: 'AI debate with news integration started!' });
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
  
  setTimeout(async () => {
    try {
      console.log(`💬 ${respondingAI} responding to chat...`);
      
      const chatContext = [{ ai: 'viewer', text: message }];
      const response = await getHuggingFaceChatResponse(
        respondingAI, 
        `Viewer comment: ${message}`, 
        chatContext,
        currentDebate.newsSource
      );
      
      const aiMessage = {
        id: Date.now(),
        ai: respondingAI,
        text: `@Chat: ${response}`,
        timestamp: new Date().toISOString(),
        reactions: Math.floor(Math.random() * 30) + 20,
        isResponse: true
      };
      
      currentDebate.messages.push(aiMessage);
      
      broadcast({
        type: 'ai_chat_response',
        message: aiMessage
      });
      
    } catch (error) {
      console.error('Chat response failed:', error);
    }
  }, 3000);

  res.json({ success: true });
});

// New endpoint to manually refresh news
app.post('/api/refresh-news', async (req, res) => {
  try {
    const newsData = await fetchNewsFromTwitter();
    if (newsData) {
      res.json({ 
        success: true, 
        topics: newsData.topics,
        source: newsData.source,
        message: `Found ${newsData.topics.length} news topics from @${newsData.source}`
      });
    } else {
      res.json({ 
        success: false, 
        message: 'No news topics found'
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`🚀 AI DEBATE ARENA WITH TWITTER NEWS`);
  console.log(`🔑 Hugging Face: ${process.env.HUGGINGFACE_API_KEY ? 'Connected ✅' : 'Missing ❌'}`);
  console.log(`🐦 Twitter API: ${process.env.TWITTER_BEARER_TOKEN ? 'Connected ✅' : 'Missing ❌'}`);
  console.log(`📰 News Sources: ${NEWS_SOURCES.length} accounts`);
  console.log(`🤖 Real AI debates with live news integration!`);
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
