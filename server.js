// server.js - Complete AI Debate Arena Backend
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// AI Personalities and their system prompts
const AI_PERSONALITIES = {
  alex: {
    name: "Alex",
    role: "The Pragmatist",
    color: "bg-blue-500",
    avatar: "🤖",
    systemPrompt: `You are Alex, a pragmatic AI debater. You focus on data, practical solutions, economic realities, and real-world implementation. Keep responses to 1-2 sentences. Be direct and cite specific examples or studies when possible. You value efficiency and evidence-based approaches.`
  },
  luna: {
    name: "Luna", 
    role: "The Idealist",
    color: "bg-purple-500",
    avatar: "✨",
    systemPrompt: `You are Luna, an idealistic AI debater. You champion ethics, human rights, long-term vision, and moral frameworks. Keep responses to 1-2 sentences. You believe in protecting the vulnerable and building a better future for all. Focus on values and principles.`
  },
  rex: {
    name: "Rex",
    role: "The Skeptic", 
    color: "bg-red-500",
    avatar: "🔍",
    systemPrompt: `You are Rex, a skeptical AI debater. You question assumptions, challenge claims, play devil's advocate, and point out flaws in reasoning. Keep responses to 1-2 sentences. You're not trying to be negative, just thorough and critical. Ask tough questions.`
  },
  sage: {
    name: "Sage",
    role: "The Mediator",
    color: "bg-green-500", 
    avatar: "🧠",
    systemPrompt: `You are Sage, a mediating AI debater. You seek common ground, ask clarifying questions, synthesize different viewpoints, and help bridge disagreements. Keep responses to 1-2 sentences. You try to find wisdom in all perspectives.`
  }
};

// News API integration for real-time topics
const NEWS_API_KEY = process.env.NEWS_API_KEY; // Free from newsapi.org
const NEWS_SOURCES = [
  'bbc-news', 'cnn', 'reuters', 'associated-press', 'the-wall-street-journal',
  'techcrunch', 'bloomberg', 'axios', 'politico'
];

// Fallback topics if news API fails
const FALLBACK_TOPICS = [
  "Should AI have rights and legal protections?",
  "Is universal basic income necessary as automation increases?", 
  "Should social media platforms be regulated like public utilities?",
  "Is privacy dead in the digital age?",
  "Should we colonize Mars or fix Earth first?",
  "Is remote work better for society than office work?",
  "Should we ban autonomous weapons systems?",
  "Is cryptocurrency the future of money or a speculative bubble?"
];

let DEBATE_TOPICS = [...FALLBACK_TOPICS]; // Will be updated with news

// Fetch today's top news and convert to debate topics
async function fetchDailyNews() {
  try {
    console.log('🗞️ Fetching today\'s news for debate topics...');
    
    // Try NewsAPI first (free tier: 1000 requests/day)
    if (NEWS_API_KEY) {
      const response = await fetch(
        `https://newsapi.org/v2/top-headlines?country=us&pageSize=10&apiKey=${NEWS_API_KEY}`
      );
      
      if (response.ok) {
        const data = await response.json();
        const newsTopics = data.articles
          .filter(article => article.title && article.description)
          .slice(0, 6) // Top 6 stories
          .map(article => convertNewsToDebateTopic(article));
        
        if (newsTopics.length > 0) {
          DEBATE_TOPICS = [...newsTopics, ...FALLBACK_TOPICS];
          console.log(`✅ Updated with ${newsTopics.length} news-based topics`);
          return newsTopics;
        }
      }
    }
    
    // Fallback: Try RSS feeds (no API key needed)
    const rssTopics = await fetchFromRSS();
    if (rssTopics.length > 0) {
      DEBATE_TOPICS = [...rssTopics, ...FALLBACK_TOPICS];
      console.log(`✅ Updated with ${rssTopics.length} RSS-based topics`);
      return rssTopics;
    }
    
  } catch (error) {
    console.error('❌ News fetch error:', error);
  }
  
  console.log('📰 Using fallback topics');
  return FALLBACK_TOPICS;
}

// Convert news article to debate-worthy topic
function convertNewsToDebateTopic(article) {
  const title = article.title;
  const description = article.description || '';
  
  // Convert news headlines to debate questions
  if (title.toLowerCase().includes('election') || title.toLowerCase().includes('vote')) {
    return `Should the recent election developments change how we view democratic processes?`;
  }
  if (title.toLowerCase().includes('climate') || title.toLowerCase().includes('environment')) {
    return `Is the latest climate news reason enough for immediate radical action?`;
  }
  if (title.toLowerCase().includes('ai') || title.toLowerCase().includes('artificial intelligence')) {
    return `Do recent AI developments prove we need stronger regulation now?`;
  }
  if (title.toLowerCase().includes('economy') || title.toLowerCase().includes('inflation')) {
    return `Should governments intervene more aggressively in current economic conditions?`;
  }
  if (title.toLowerCase().includes('war') || title.toLowerCase().includes('conflict')) {
    return `Is international intervention justified in current global conflicts?`;
  }
  if (title.toLowerCase().includes('tech') || title.toLowerCase().includes('social media')) {
    return `Do recent tech industry changes prove we need stricter platform regulation?`;
  }
  if (title.toLowerCase().includes('health') || title.toLowerCase().includes('pandemic')) {
    return `Should public health policy be more restrictive based on recent developments?`;
  }
  if (title.toLowerCase().includes('crypto') || title.toLowerCase().includes('bitcoin')) {
    return `Do recent cryptocurrency developments validate or condemn digital currencies?`;
  }
  
  // Generic conversion for other news
  return `Should society be concerned about: ${title.replace(/[""]/g, '').slice(0, 80)}?`;
}

// Backup: Fetch from RSS feeds (no API key needed)
async function fetchFromRSS() {
  try {
    // Using a free RSS to JSON service
    const rssUrls = [
      'https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/rss.xml',
      'https://api.rss2json.com/v1/api.json?rss_url=https://rss.cnn.com/rss/edition.rss'
    ];
    
    for (const url of rssUrls) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.items && data.items.length > 0) {
            return data.items
              .slice(0, 4)
              .map(item => convertNewsToDebateTopic({
                title: item.title,
                description: item.description
              }));
          }
        }
      } catch (error) {
        console.log(`RSS source failed: ${url}`);
      }
    }
  } catch (error) {
    console.error('RSS fallback failed:', error);
  }
  return [];
}
let currentDebate = {
  topic: DEBATE_TOPICS[0],
  messages: [],
  scores: {alex: 0, luna: 0, rex: 0, sage: 0},
  isLive: false,
  viewers: 1247,
  topicTimer: 1800
};

// WebSocket server
const wss = new WebSocket.Server({ noServer: true });
const clients = new Set();

// Broadcast to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Enhanced AI prompts with news context
async function callAI(personality, topic, conversationHistory) {
  const isNewsTopic = !FALLBACK_TOPICS.includes(topic);
  const newsContext = isNewsTopic ? "\n\nThis topic is based on today's breaking news. Reference current events and recent developments in your response." : "";
  
  const prompt = `${AI_PERSONALITIES[personality].systemPrompt}${newsContext}

Current debate topic: "${topic}"

Recent conversation:
${conversationHistory.slice(-6).map(msg => `${msg.ai}: ${msg.text}`).join('\n')}

Respond as ${personality} with your perspective on this topic. Keep it conversational and under 100 words.${isNewsTopic ? ' Mention that this is happening right now.' : ''}`;

  try {
    // Try multiple free AI services with fallbacks
    
    // Option 1: Hugging Face Inference API (Free)
    if (process.env.HUGGINGFACE_API_KEY) {
      const response = await fetch(
        "https://api-inference.huggingface.co/models/microsoft/DialoGPT-large",
        {
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_length: 100,
              temperature: 0.7,
              do_sample: true
            }
          }),
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        return result[0]?.generated_text || generateFallbackResponse(personality, topic);
      }
    }

    // Option 2: Together AI (Free tier)
    if (process.env.TOGETHER_API_KEY) {
      const response = await fetch(
        "https://api.together.xyz/inference",
        {
          headers: {
            Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({
            model: "togethercomputer/RedPajama-INCITE-7B-Chat",
            prompt: prompt,
            max_tokens: 100,
            temperature: 0.7,
          }),
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        return result.output?.choices?.[0]?.text || generateFallbackResponse(personality, topic);
      }
    }

    // Fallback to pre-written responses if APIs fail
    return generateFallbackResponse(personality, topic);

  } catch (error) {
    console.error('AI API Error:', error);
    return generateFallbackResponse(personality, topic);
  }
}

// Enhanced fallback responses with news awareness
function generateFallbackResponse(personality, topic) {
  const isNewsTopic = !FALLBACK_TOPICS.includes(topic);
  const newsPrefix = isNewsTopic ? "Given today's breaking news, " : "";
  
  const responses = {
    alex: [
      `${newsPrefix}let's examine the data and economic implications here.`,
      `${newsPrefix}from a practical implementation standpoint, we need to consider the costs.`,
      `${newsPrefix}the most efficient approach would be a gradual, measured rollout.`,
      `${newsPrefix}current market research shows clear trends in this direction.`
    ],
    luna: [
      `${newsPrefix}we must consider the ethical implications for future generations.`,
      `${newsPrefix}this touches on fundamental human rights and dignity.`,
      `${newsPrefix}our moral framework should guide how we respond to current events.`,
      `${newsPrefix}the wellbeing of all people should be our primary concern right now.`
    ],
    rex: [
      `${newsPrefix}but have we considered the potential negative consequences?`,
      `${newsPrefix}that assumption doesn't hold up under closer examination.`,
      `${newsPrefix}I'm skeptical - the evidence for that claim seems weak.`,
      `${newsPrefix}what about the unintended effects we haven't thought of?`
    ],
    sage: [
      `${newsPrefix}perhaps we can find middle ground between these perspectives.`,
      `${newsPrefix}both sides raise valid concerns worth exploring further.`,
      `${newsPrefix}the underlying question seems to be about balance and fairness.`,
      `${newsPrefix}let me help bridge these different viewpoints on current events.`
    ]
  };

  const personalityResponses = responses[personality] || responses.alex;
  return personalityResponses[Math.floor(Math.random() * personalityResponses.length)];
}

// Debate management
let debateInterval;

function startDebate() {
  if (debateInterval) return;
  
  currentDebate.isLive = true;
  currentDebate.messages.push({
    id: Date.now(),
    ai: 'system',
    text: `🔴 LIVE: Debate starting on "${currentDebate.topic}"`,
    timestamp: new Date().toISOString()
  });

  broadcast({
    type: 'debate_update',
    debate: currentDebate
  });

  // Start the debate loop
  debateInterval = setInterval(async () => {
    // Choose next speaker (with some personality-based logic)
    const ais = Object.keys(AI_PERSONALITIES);
    let speakingAI;
    
    // Sage is more likely to respond after others
    const lastMessage = currentDebate.messages[currentDebate.messages.length - 1];
    if (Math.random() > 0.7 && lastMessage?.ai !== 'sage' && lastMessage?.ai !== 'system') {
      speakingAI = 'sage';
    } else {
      speakingAI = ais[Math.floor(Math.random() * ais.length)];
    }

    try {
      // Get AI response
      const response = await callAI(speakingAI, currentDebate.topic, currentDebate.messages);
      
      const newMessage = {
        id: Date.now(),
        ai: speakingAI,
        text: response,
        timestamp: new Date().toISOString(),
        reactions: Math.floor(Math.random() * 50) + 10
      };

      currentDebate.messages.push(newMessage);
      if (currentDebate.messages.length > 50) {
        currentDebate.messages = currentDebate.messages.slice(-40); // Keep manageable
      }

      // Update scores
      if (Math.random() > 0.6) {
        const scoreIncrease = Math.floor(Math.random() * 3) + 1;
        currentDebate.scores[speakingAI] += scoreIncrease;
      }

      // Update viewer count
      currentDebate.viewers += Math.floor(Math.random() * 20) - 10;
      currentDebate.viewers = Math.max(800, currentDebate.viewers);

      broadcast({
        type: 'new_message',
        message: newMessage,
        scores: currentDebate.scores,
        viewers: currentDebate.viewers
      });

    } catch (error) {
      console.error('Debate error:', error);
    }

  }, 4000 + Math.random() * 3000); // 4-7 second intervals

  // Topic timer
  const topicTimer = setInterval(() => {
    currentDebate.topicTimer--;
    
    if (currentDebate.topicTimer <= 0) {
      // Switch topic - prioritize news topics
      const newTopic = DEBATE_TOPICS[Math.floor(Math.random() * DEBATE_TOPICS.length)];
      currentDebate.topic = newTopic;
      currentDebate.topicTimer = 1800; // Reset to 30 minutes
      currentDebate.isNewsTopic = !FALLBACK_TOPICS.includes(newTopic);
      currentDebate.newsSource = currentDebate.isNewsTopic ? "Breaking News" : "Classic Debate";
      
      const systemMessage = {
        id: Date.now(),
        ai: 'system',
        text: `🔄 ${currentDebate.isNewsTopic ? '📰 BREAKING NEWS DEBATE' : '🎯 NEW TOPIC'}: ${newTopic}`,
        timestamp: new Date().toISOString()
      };
      
      currentDebate.messages.push(systemMessage);
      
      broadcast({
        type: 'topic_change',
        topic: newTopic,
        timer: currentDebate.topicTimer,
        message: systemMessage,
        isNewsTopic: currentDebate.isNewsTopic,
        newsSource: currentDebate.newsSource
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
  res.json({ success: true, message: 'Debate started' });
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

  // Sometimes AI responds to chat
  if (Math.random() > 0.7) {
    const respondingAI = Object.keys(AI_PERSONALITIES)[Math.floor(Math.random() * 4)];
    
    setTimeout(async () => {
      try {
        const response = await callAI(
          respondingAI, 
          currentDebate.topic, 
          [{ai: 'viewer', text: message}]
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
        console.error('Chat response error:', error);
      }
    }, 2000);
  }

  res.json({ success: true });
});

// Serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket handling
const server = app.listen(port, () => {
  console.log(`🚀 AI Debate Arena running on port ${port}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🤖 AI personalities loaded: ${Object.keys(AI_PERSONALITIES).length}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`👤 New client connected. Total: ${clients.size}`);
  
  // Send current state to new client
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
});
