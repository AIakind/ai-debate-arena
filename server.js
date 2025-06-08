// server.js - AI Debate Arena with Multiple News Sources
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

// ==================== NEWS FETCHING FUNCTIONS ====================

// 1. RSS Feed Parser (No API key needed!)
async function fetchFromRSSFeeds() {
  const rssFeeds = [
    { url: 'https://rss.cnn.com/rss/edition.rss', name: 'CNN' },
    { url: 'https://feeds.bbci.co.uk/news/rss.xml', name: 'BBC' },
    { url: 'https://www.reuters.com/rssFeed/topNews', name: 'Reuters' },
    { url: 'https://rss.npr.org/1001/rss.xml', name: 'NPR' },
    { url: 'https://www.theguardian.com/world/rss', name: 'Guardian' },
    { url: 'https://feeds.washingtonpost.com/rss/national', name: 'Washington Post' }
  ];

  const selectedFeed = rssFeeds[Math.floor(Math.random() * rssFeeds.length)];
  
  try {
    console.log(`📰 Fetching RSS from: ${selectedFeed.name}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(selectedFeed.url, {
      headers: { 'User-Agent': 'AI-Debate-Arena/1.0' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`RSS fetch failed: ${response.status}`);
    
    const xmlText = await response.text();
    
    // Simple XML parsing for RSS items
    const itemRegex = /<item[^>]*>.*?<\/item>/gs;
    const titleRegex = /<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/s;
    
    const items = xmlText.match(itemRegex) || [];
    const topics = [];
    
    for (const item of items.slice(0, 15)) {
      const titleMatch = item.match(titleRegex);
      if (titleMatch) {
        let title = (titleMatch[1] || titleMatch[2] || '').trim();
        
        // Clean up title
        title = title
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .replace(/^\s*[\d\w\s]*:\s*/, '') // Remove "Breaking:" etc.
          .trim();
        
        if (title.length > 25 && title.length < 150) {
          if (title.includes('?')) {
            topics.push(title);
          } else {
            topics.push(`What's your perspective on: ${title}?`);
          }
        }
      }
      
      if (topics.length >= 8) break;
    }

    if (topics.length === 0) throw new Error('No valid topics extracted');

    return {
      topics,
      source: `${selectedFeed.name} RSS`,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('RSS fetch failed:', error.message);
    throw error;
  }
}

// 2. Reddit API (No key needed for public posts)
async function fetchFromReddit() {
  const subreddits = ['news', 'worldnews', 'technology', 'science', 'politics'];
  const selectedSubreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
  
  try {
    console.log(`📰 Fetching from Reddit: r/${selectedSubreddit}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(
      `https://www.reddit.com/r/${selectedSubreddit}/hot.json?limit=25`,
      {
        headers: { 'User-Agent': 'AI-Debate-Arena/1.0' },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Reddit fetch failed: ${response.status}`);
    
    const data = await response.json();
    
    if (!data.data || !data.data.children) {
      throw new Error('No Reddit posts found');
    }

    const topics = data.data.children
      .filter(post => 
        post.data.title && 
        post.data.title.length > 20 && 
        post.data.title.length < 150 &&
        post.data.ups > 100 && // Only popular posts
        !post.data.title.toLowerCase().includes('removed') &&
        !post.data.title.toLowerCase().includes('deleted')
      )
      .slice(0, 10)
      .map(post => {
        let title = post.data.title.trim();
        
        if (title.includes('?')) {
          return title;
        } else {
          return `What do you think about: ${title}?`;
        }
      });

    if (topics.length === 0) throw new Error('No valid Reddit topics');

    return {
      topics,
      source: `Reddit r/${selectedSubreddit}`,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Reddit fetch failed:', error.message);
    throw error;
  }
}

// 3. Hacker News API (No key needed)
async function fetchFromHackerNews() {
  try {
    console.log('📰 Fetching from Hacker News...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    // Get top story IDs
    const topStoriesResponse = await fetch(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);
    
    if (!topStoriesResponse.ok) throw new Error('HN top stories fetch failed');
    
    const storyIds = await topStoriesResponse.json();
    const selectedIds = storyIds.slice(0, 15);
    
    const topics = [];
    
    // Fetch individual story details
    for (const id of selectedIds) {
      try {
        const storyController = new AbortController();
        const storyTimeoutId = setTimeout(() => storyController.abort(), 3000);
        
        const storyResponse = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          { signal: storyController.signal }
        );
        
        clearTimeout(storyTimeoutId);
        
        if (storyResponse.ok) {
          const story = await storyResponse.json();
          
          if (story.title && story.title.length > 20 && story.title.length < 150) {
            if (story.title.includes('?')) {
              topics.push(story.title);
            } else {
              topics.push(`What are your thoughts on: ${story.title}?`);
            }
          }
        }
        
        if (topics.length >= 8) break;
        
      } catch (error) {
        continue; // Skip failed individual requests
      }
    }

    if (topics.length === 0) throw new Error('No valid HN topics');

    return {
      topics,
      source: 'Hacker News',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Hacker News fetch failed:', error.message);
    throw error;
  }
}

// 4. NewsAPI (if API key is available)
async function fetchFromNewsAPI() {
  if (!process.env.NEWS_API_KEY) {
    throw new Error('NEWS_API_KEY not available');
  }

  try {
    console.log('📰 Fetching from NewsAPI...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(
      `https://newsapi.org/v2/top-headlines?country=us&category=general&pageSize=20&apiKey=${process.env.NEWS_API_KEY}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`NewsAPI failed: ${response.status}`);
    
    const data = await response.json();
    
    if (!data.articles || data.articles.length === 0) {
      throw new Error('No articles found');
    }

    const topics = data.articles
      .filter(article => article.title && article.title.length > 25)
      .slice(0, 10)
      .map(article => {
        let title = article.title.replace(/\s*-\s*[^-]*$/, ''); // Remove source suffix
        
        if (title.includes('?')) {
          return title;
        } else {
          return `What are your thoughts on: ${title}?`;
        }
      })
      .filter(topic => topic.length < 150);

    if (topics.length === 0) throw new Error('No valid NewsAPI topics');

    return {
      topics,
      source: 'NewsAPI',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('NewsAPI fetch failed:', error.message);
    throw error;
  }
}

// Enhanced curated topics as ultimate fallback
function getCuratedCurrentTopics() {
  const topics = [
    "What's your take on the rapid advancement of AI and its impact on jobs?",
    "How should society handle the growing concerns about social media and mental health?",
    "What are your thoughts on the global shift towards renewable energy?",
    "Should there be universal basic income as automation increases?",
    "What's your perspective on the debate over privacy vs security in digital age?",
    "How do you view the role of cryptocurrencies in the future economy?",
    "What are the implications of remote work becoming permanent for many?",
    "Should big tech companies be broken up or regulated more strictly?",
    "What's your opinion on the ethics of genetic engineering and CRISPR?",
    "How should we approach climate change mitigation vs adaptation strategies?",
    "What are your thoughts on the space race and commercial space travel?",
    "Should there be limits on political advertising on social media platforms?",
    "What's your perspective on the gig economy and worker rights?",
    "How do you view the debate over nuclear energy vs renewables?",
    "What are the implications of quantum computing for cybersecurity?",
    "Should artificial intelligence development be regulated internationally?",
    "What's your take on the metaverse and virtual reality adoption?",
    "How should we handle the growing wealth inequality globally?",
    "What are your thoughts on electric vehicles replacing traditional cars?",
    "Should social media platforms be held liable for content spread on them?"
  ];

  const selectedTopic = topics[Math.floor(Math.random() * topics.length)];
  
  return {
    topics: [selectedTopic],
    source: "Current Trending Debates",
    timestamp: new Date().toISOString()
  };
}

// Main news fetching function with multiple fallbacks
async function fetchNewsFromMultipleSources() {
  const fetchMethods = [
    { name: 'RSS Feeds', fn: fetchFromRSSFeeds },
    { name: 'Reddit', fn: fetchFromReddit },
    { name: 'Hacker News', fn: fetchFromHackerNews },
    { name: 'NewsAPI', fn: fetchFromNewsAPI }
  ];

  // Shuffle methods for variety
  const shuffledMethods = fetchMethods.sort(() => Math.random() - 0.5);

  for (const method of shuffledMethods) {
    try {
      console.log(`🔄 Trying news source: ${method.name}`);
      const result = await method.fn();
      console.log(`✅ Successfully fetched from ${method.name}: ${result.topics.length} topics`);
      return result;
    } catch (error) {
      console.log(`❌ ${method.name} failed: ${error.message}`);
      continue;
    }
  }

  // Final fallback to curated topics
  console.log('🔄 All news sources failed, using curated topics');
  return getCuratedCurrentTopics();
}

// ==================== AI RESPONSE FUNCTIONS ====================

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
      const timeoutId = setTimeout(() => controller.abort(), 15000);

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
          const newNewsData = await fetchNewsFromMultipleSources();
          newTopic = newNewsData.topics[Math.floor(Math.random() * newNewsData.topics.length)];
          newSource = newNewsData.source;
        } catch (error) {
          const fallbackData = getCuratedCurrentTopics();
          newTopic = fallbackData.topics[0];
          newSource = fallbackData.source;
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
    console.log('🔄 Starting AI debate...');
    console.log(`🔑 Environment check:`);
    console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? 'Found' : 'Missing'}`);
    console.log(`   NEWS_API_KEY: ${process.env.NEWS_API_KEY ? 'Found' : 'Missing (optional)'}`);
    
    let selectedTopic, newsSource;
    
    // Try to fetch news from multiple sources
    try {
      console.log('🔄 Attempting to fetch fresh news for debate...');
      const newsData = await fetchNewsFromMultipleSources();
      selectedTopic = newsData.topics[Math.floor(Math.random() * newsData.topics.length)];
      newsSource = newsData.source;
      console.log(`✅ Got topic from ${newsSource}: ${selectedTopic}`);
    } catch (newsError) {
      console.log('⚠️ All news sources failed, using curated topics...');
      const fallbackData = getCuratedCurrentTopics();
      selectedTopic = fallbackData.topics[0];
      newsSource = fallbackData.source;
    }
    
    currentDebate.topic = selectedTopic;
    currentDebate.newsSource = newsSource;
    currentDebate.isLive = true;
    currentDebate.messages = [];
    currentDebate.scores = {alex: 0, luna: 0, rex: 0, sage: 0};
    conversationFlow = [];
    
    const startMessage = `🔴 LIVE: AI Debate - "${currentDebate.topic}" (${newsSource})`;

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
    uptime: process.uptime(),
    newsSourcesAvailable: [
      'RSS Feeds (No API key needed)',
      'Reddit (No API key needed)', 
      'Hacker News (No API key needed)',
      process.env.NEWS_API_KEY ? 'NewsAPI (Available)' : 'NewsAPI (Not configured)',
      'Curated Topics (Fallback)'
    ]
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
  console.log(`🚀 AI DEBATE ARENA WITH MULTIPLE NEWS SOURCES`);
  console.log(`🌐 Server running on port ${port}`);
  console.log(`🔑 Environment Variables Check:`);
  console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   NEWS_API_KEY: ${process.env.NEWS_API_KEY ? '✅ Available' : '⚠️ Not configured (optional)'}`);
  
  console.log(`📰 News Sources Available:`);
  console.log(`   ✅ RSS Feeds (CNN, BBC, Reuters, NPR, Guardian, WashPost)`);
  console.log(`   ✅ Reddit API (r/news, r/worldnews, r/technology, r/science)`);
  console.log(`   ✅ Hacker News API`);
  console.log(`   ${process.env.NEWS_API_KEY ? '✅' : '⚠️'} NewsAPI ${process.env.NEWS_API_KEY ? '(Available)' : '(Not configured)'}`);
  console.log(`   ✅ Curated Current Topics (Fallback)`);
  
  console.log(`🤖 Real AI conversations with live news topics!`);
  console.log(`🔗 WebSocket server attached to HTTP server`);
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    console.log(`❌ CRITICAL: Hugging Face API key missing - AI responses will fail`);
  } else {
    console.log(`🎯 Ready for connections! No Twitter API needed.`);
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
