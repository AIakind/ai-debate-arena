// server.js - HUGGING FACE ONLY AI Debate Arena
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
    systemPrompt: "I am Alex, a pragmatic debater who focuses on economics, data, and practical solutions."
  },
  luna: {
    name: "Luna",
    role: "The Idealist",
    color: "bg-purple-500",
    avatar: "✨",
    systemPrompt: "I am Luna, an idealistic debater who champions human rights, ethics, and moral principles."
  },
  rex: {
    name: "Rex",
    role: "The Skeptic",
    color: "bg-red-500",
    avatar: "🔍",
    systemPrompt: "I am Rex, a skeptical debater who questions assumptions and points out potential problems."
  },
  sage: {
    name: "Sage",
    role: "The Mediator",
    color: "bg-green-500",
    avatar: "🧠",
    systemPrompt: "I am Sage, a wise mediator who finds common ground and synthesizes different viewpoints."
  }
};

const DEBATE_TOPICS = [
  "Should AI have rights and legal protections?",
  "Is universal basic income necessary as automation increases?",
  "Should social media platforms be regulated like public utilities?",
  "Is privacy dead in the digital age?",
  "Should we colonize Mars or fix Earth first?",
  "Should genetic engineering be allowed in humans?",
  "Is nuclear energy the solution to climate change?",
  "Should we ban autonomous weapons systems?"
];

let currentDebate = {
  topic: DEBATE_TOPICS[0],
  messages: [],
  scores: {alex: 0, luna: 0, rex: 0, sage: 0},
  isLive: false,
  viewers: 1247,
  topicTimer: 1800
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

// HUGGING FACE ONLY AI FUNCTION
async function getHuggingFaceResponse(personality, topic, recentMessages) {
  const aiData = AI_PERSONALITIES[personality];
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    throw new Error('No Hugging Face API key found');
  }

  // Build simple context
  const lastMessage = recentMessages[recentMessages.length - 1];
  const contextText = lastMessage ? `Previous: ${lastMessage.text}` : '';
  
  console.log(`🤖 ${personality} thinking with Hugging Face...`);

  // Try different Hugging Face models that work well
  const models = [
    "microsoft/DialoGPT-medium",
    "facebook/blenderbot-400M-distill", 
    "microsoft/DialoGPT-small",
    "facebook/blenderbot_small-90M"
  ];

  for (const model of models) {
    try {
      console.log(`🔄 Trying ${model} for ${personality}...`);
      
      let prompt;
      let requestBody;
      
      if (model.includes('DialoGPT')) {
        // For DialoGPT models
        prompt = `${aiData.systemPrompt} Topic: ${topic}. ${contextText}`;
        requestBody = {
          inputs: prompt,
          parameters: {
            max_new_tokens: 60,
            temperature: 0.8,
            do_sample: true,
            pad_token_id: 50256,
            return_full_text: false
          }
        };
      } else {
        // For BlenderBot models
        prompt = `${aiData.systemPrompt} What do you think about: ${topic}?`;
        requestBody = {
          inputs: prompt,
          parameters: {
            max_length: 100,
            temperature: 0.7,
            do_sample: true
          }
        };
      }

      const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify(requestBody),
        }
      );

      console.log(`📡 ${model} response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ ${model} error: ${errorText}`);
        continue;
      }

      const result = await response.json();
      console.log(`📋 ${model} raw result:`, JSON.stringify(result).substring(0, 200));

      let aiResponse = '';
      
      // Handle different response formats
      if (Array.isArray(result)) {
        if (result[0]?.generated_text) {
          aiResponse = result[0].generated_text;
        } else if (result[0]?.translation_text) {
          aiResponse = result[0].translation_text;
        }
      } else if (result.generated_text) {
        aiResponse = result.generated_text;
      } else if (result[0]) {
        aiResponse = result[0];
      }

      // Clean up the response
      if (aiResponse) {
        aiResponse = aiResponse
          .replace(prompt, '') // Remove original prompt
          .replace(/^.*?:/g, '') // Remove any "Name:" prefixes
          .trim()
          .split('\n')[0] // Take first line only
          .substring(0, 200); // Limit length

        if (aiResponse.length > 10 && !aiResponse.includes('undefined')) {
          console.log(`✅ ${personality} (${model}): ${aiResponse}`);
          return aiResponse;
        }
      }

    } catch (error) {
      console.log(`❌ ${model} failed for ${personality}: ${error.message}`);
      continue;
    }
  }

  // If all models fail, try one more simple approach
  try {
    console.log(`🔄 Final attempt for ${personality} with simple text generation...`);
    
    const simplePrompt = `Question: ${topic}\nAnswer as ${aiData.name}:`;
    
    const response = await fetch(
      "https://api-inference.huggingface.co/models/gpt2",
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          inputs: simplePrompt,
          parameters: {
            max_new_tokens: 50,
            temperature: 0.8,
            do_sample: true,
            return_full_text: false
          }
        }),
      }
    );

    if (response.ok) {
      const result = await response.json();
      let aiResponse = result[0]?.generated_text || result.generated_text || '';
      
      if (aiResponse && aiResponse.length > 10) {
        aiResponse = aiResponse.trim().split('\n')[0].substring(0, 150);
        console.log(`✅ ${personality} (GPT-2): ${aiResponse}`);
        return aiResponse;
      }
    }
  } catch (error) {
    console.log(`❌ Final attempt failed: ${error.message}`);
  }

  throw new Error(`All Hugging Face models failed for ${personality}`);
}

let debateInterval;

function startDebate() {
  if (debateInterval) return;
  
  currentDebate.isLive = true;
  currentDebate.messages.push({
    id: Date.now(),
    ai: 'system',
    text: `🔴 LIVE: Hugging Face AI Debate on "${currentDebate.topic}"`,
    timestamp: new Date().toISOString()
  });

  broadcast({
    type: 'debate_update',
    debate: currentDebate
  });

  console.log('🎬 Starting Hugging Face AI debate...');
  console.log(`🔑 Using API key: ${process.env.HUGGINGFACE_API_KEY ? 'Available' : 'Missing'}`);

  debateInterval = setInterval(async () => {
    const ais = Object.keys(AI_PERSONALITIES);
    const speakingAI = ais[Math.floor(Math.random() * ais.length)];

    try {
      console.log(`🎤 ${speakingAI} generating Hugging Face response...`);
      
      const response = await getHuggingFaceResponse(
        speakingAI,
        currentDebate.topic,
        currentDebate.messages.filter(m => m.ai !== 'system').slice(-2)
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
      console.error(`❌ Hugging Face failed for ${speakingAI}:`, error.message);
      
      const errorMessage = {
        id: Date.now(),
        ai: 'system',
        text: `⚠️ ${speakingAI} couldn't generate response - Hugging Face API issue`,
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

  }, 12000 + Math.random() * 6000); // 12-18 seconds for Hugging Face processing

  // Topic timer
  const topicTimer = setInterval(() => {
    currentDebate.topicTimer--;
    
    if (currentDebate.topicTimer <= 0) {
      const newTopic = DEBATE_TOPICS[Math.floor(Math.random() * DEBATE_TOPICS.length)];
      currentDebate.topic = newTopic;
      currentDebate.topicTimer = 1800;
      
      const systemMessage = {
        id: Date.now(),
        ai: 'system',
        text: `🔄 New Hugging Face AI debate: ${newTopic}`,
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
  res.json({ success: true, message: 'Hugging Face AI debate started!' });
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
      console.log(`💬 ${respondingAI} responding to chat with Hugging Face...`);
      
      const chatContext = [{ ai: 'viewer', text: message }];
      const response = await getHuggingFaceResponse(respondingAI, `Viewer says: ${message}`, chatContext);
      
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
      console.error('Hugging Face chat response failed:', error);
    }
  }, 3000);

  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`🚀 HUGGING FACE ONLY AI Debate Arena`);
  console.log(`🔑 Hugging Face API Key: ${process.env.HUGGINGFACE_API_KEY ? 'Connected ✅' : 'Missing ❌'}`);
  console.log(`🤖 Models: DialoGPT, BlenderBot, GPT-2`);
  console.log(`📡 Only using Hugging Face APIs`);
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
