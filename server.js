// server.js - Bulletproof AI Debate Arena
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const http = require('http');
require('dotenv').config();

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
    systemPrompt: "You are Marcus, a hardcore capitalist. You believe free markets solve everything. Speak confidently about business, profits, and competition. Reference economic data when possible. Keep responses under 40 words but complete your thoughts."
  },
  zara: {
    name: "Zara",
    role: "The Progressive",
    color: "bg-green-600",
    avatar: "🌱",
    systemPrompt: "You are Zara, a fierce progressive. You fight for social justice and equality. Speak passionately about helping people and fixing systemic issues. Reference inequality and injustice. Keep responses under 40 words but complete your thoughts."
  },
  viktor: {
    name: "Viktor",
    role: "The Realist",
    color: "bg-gray-600",
    avatar: "⚖️",
    systemPrompt: "You are Viktor, a pragmatic realist. You focus on what actually works and point out problems with idealistic plans. Speak bluntly about trade-offs and human nature. Keep responses under 40 words but complete your thoughts."
  },
  aria: {
    name: "Aria",
    role: "The Futurist",
    color: "bg-purple-600",
    avatar: "🚀",
    systemPrompt: "You are Aria, a tech-optimist futurist. You believe technology will solve humanity's problems. Speak enthusiastically about innovation and future possibilities. Keep responses under 40 words but complete your thoughts."
  }
};

// Curated debate topics with context
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

async function getAIResponse(personality, topic, context, recentMessages, isResponse = false) {
  const aiData = AI_PERSONALITIES[personality];
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    // Return fallback if no API key
    const fallbacks = {
      marcus: "Market forces will optimize this situation better than any government intervention.",
      zara: "We need policies that prioritize people over profits and protect vulnerable communities.",
      viktor: "The real-world implementation has trade-offs that both sides are ignoring here.",
      aria: "Emerging technology will solve these problems in ways we haven't imagined yet."
    };
    return fallbacks[personality];
  }

  let prompt;
  
  if (isResponse && recentMessages.length > 0) {
    const lastMessage = recentMessages[recentMessages.length - 1];
    prompt = `Context: ${context}

Previous: ${lastMessage.ai} said "${lastMessage.text}"

Respond as ${aiData.name}. You have strong opinions. Reference the context. Disagree if needed. Be direct and opinionated.`;
  } else {
    prompt = `Topic: ${topic}
Context: ${context}

Give your strong opinion as ${aiData.name}. Reference the context. Be opinionated and direct.`;
  }

  const models = ["Qwen/Qwen2.5-7B-Instruct", "microsoft/Phi-3.5-mini-instruct"];

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

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
            messages: [
              { role: "system", content: aiData.systemPrompt },
              { role: "user", content: prompt }
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
          
          // Clean up response
          aiResponse = aiResponse
            .replace(/^["\']|["\']$/g, '')
            .replace(/\b(Marcus|Zara|Viktor|Aria)\s*(thinks?|believes?|says?)\s*/gi, '')
            .replace(/^(Look,|Well,|So,|You know,)\s*/gi, '')
            .trim();
          
          if (aiResponse.length > 10) {
            console.log(`✅ ${personality}: "${aiResponse}"`);
            return aiResponse;
          }
        }
      }
    } catch (error) {
      console.log(`❌ ${model} failed:`, error.message);
      continue;
    }
  }

  // Fallback responses
  const fallbacks = {
    marcus: "Free market competition drives innovation and efficiency better than regulation.",
    zara: "This highlights systemic inequality that requires progressive policy solutions.",
    viktor: "Both approaches have practical limitations that need realistic assessment.",
    aria: "Technological advancement will create solutions beyond current policy debates."
  };
  
  return fallbacks[personality];
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
        nonSystemMessages,
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

  res.json({ success: true, message: 'AI is thinking...' });
  
  setTimeout(async () => {
    try {
      const respondingAI = Object.keys(AI_PERSONALITIES)[Math.floor(Math.random() * 4)];
      const response = await getAIResponse(respondingAI, message, "User question", [], false);
      
      const aiMessage = {
        id: Date.now(),
        ai: respondingAI,
        text: response,
        timestamp: new Date().toISOString(),
        reactions: Math.floor(Math.random() * 30) + 15,
        isResponse: true
      };
      
      currentDebate.messages.push(aiMessage);
      
      broadcast({
        type: 'ai_chat_response',
        message: aiMessage
      });
      
    } catch (error) {
      console.error('Chat error:', error);
    }
  }, 2000);
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

// WebSocket handling
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`👤 Client connected. Total: ${clients.size}`);
  
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
  console.log(`🚀 BULLETPROOF AI DEBATE ARENA`);
  console.log(`🌐 Server running on port ${port}`);
  console.log(`🔑 HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? '✅' : '❌'}`);
  console.log(`📚 Loaded ${DEBATE_TOPICS.length} debate topics`);
  console.log(`🤖 4 opinionated AI personalities ready`);
  console.log(`🎯 Ready for debates!`);
});

// Graceful shutdown
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
