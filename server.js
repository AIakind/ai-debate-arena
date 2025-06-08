// server.js - Stable AI Debate Arena Backend
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

const DEBATE_TOPICS = [
  "Should AI have rights and legal protections?",
  "Is universal basic income necessary as automation increases?", 
  "Should social media platforms be regulated like public utilities?",
  "Is privacy dead in the digital age?",
  "Should we colonize Mars or fix Earth first?",
  "Is remote work better for society than office work?",
  "Should we ban autonomous weapons systems?",
  "Is cryptocurrency the future of money or a speculative bubble?",
  "Should social media be age-restricted like alcohol and tobacco?",
  "Is nuclear energy the solution to climate change?",
  "Should genetic engineering be allowed in humans?",
  "Is democracy compatible with artificial intelligence governance?"
];

// Store active debates
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

// Fallback responses (stable, no API calls needed)
function generateResponse(personality, topic) {
  const responses = {
    alex: [
      "Let's examine the data and economic implications here.",
      "From a practical implementation standpoint, we need to consider the costs.",
      "The most efficient approach would be a gradual, measured rollout.",
      "Market research shows clear trends in this direction.",
      "We need evidence-based solutions, not wishful thinking.",
      "The numbers don't lie - this approach has proven results."
    ],
    luna: [
      "We must consider the ethical implications for future generations.",
      "This touches on fundamental human rights and dignity.",
      "Our moral framework should guide technological progress.",
      "The wellbeing of all people should be our primary concern.",
      "We have a responsibility to protect the vulnerable in society.",
      "History will judge us by how we handle this moral challenge."
    ],
    rex: [
      "But have we considered the potential negative consequences?",
      "That assumption doesn't hold up under closer examination.",
      "I'm skeptical - the evidence for that claim seems weak.",
      "What about the unintended effects we haven't thought of?",
      "This sounds too good to be true. What's the catch?",
      "We're missing crucial information before making this decision."
    ],
    sage: [
      "Perhaps we can find middle ground between these perspectives.",
      "Both sides raise valid concerns worth exploring further.",
      "The underlying question seems to be about balance and fairness.",
      "Let me help bridge these different viewpoints.",
      "What if we combined the best elements of each approach?",
      "I think we're all seeking the same ultimate goals here."
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
      // Get response (using fallback for stability)
      const response = generateResponse(speakingAI, currentDebate.topic);
      
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

  }, 4000 + Math.random() * 3000);

  // Topic timer
  const topicTimer = setInterval(() => {
    currentDebate.topicTimer--;
    
    if (currentDebate.topicTimer <= 0) {
      // Switch topic
      const newTopic = DEBATE_TOPICS[Math.floor(Math.random() * DEBATE_TOPICS.length)];
      currentDebate.topic = newTopic;
      currentDebate.topicTimer = 1800;
      
      const systemMessage = {
        id: Date.now(),
        ai: 'system',
        text: `🔄 New topic: ${newTopic}`,
        timestamp: new Date().toISOString()
      };
      
      currentDebate.messages.push(systemMessage);
      
      broadcast({
        type: 'topic_change',
        topic: newTopic,
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
        const response = generateResponse(respondingAI, currentDebate.topic);
        
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
