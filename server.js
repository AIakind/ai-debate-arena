// server.js - Working Hugging Face Chat Completion API
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

// NEW Working Hugging Face Chat Completion API
async function getHuggingFaceChatResponse(personality, topic, recentMessages) {
  const aiData = AI_PERSONALITIES[personality];
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    throw new Error('No Hugging Face API key found');
  }

  // Build conversation context
  const context = recentMessages
    .slice(-2)
    .map(msg => `${msg.ai}: ${msg.text}`)
    .join('\n');

  console.log(`🤖 ${personality} using NEW Hugging Face Chat API...`);

  // Use the new Hugging Face chat completion API (works like OpenAI)
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
                content: aiData.systemPrompt
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

      console.log(`📡 ${model} response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ ${model} error: ${errorText}`);
        continue;
      }

      const result = await response.json();
      console.log(`📋 ${model} result:`, JSON.stringify(result).substring(0, 200));

      if (result.choices && result.choices[0] && result.choices[0].message) {
        const aiResponse = result.choices[0].message.content.trim();
        
        if (aiResponse && aiResponse.length > 10) {
          console.log(`✅ ${personality} (${model}): ${aiResponse}`);
          return aiResponse;
        }
      }

    } catch (error) {
      console.log(`❌ ${model} failed for ${personality}: ${error.message}`);
      continue;
    }
  }

  // Try the simpler text generation endpoint if chat fails
  try {
    console.log(`🔄 Trying simple text generation for ${personality}...`);
    
    const prompt = `${aiData.systemPrompt}\n\nTopic: ${topic}\nContext: ${context}\n\n${aiData.name}: `;
    
    const response = await fetch(
      "https://api-inference.huggingface.co/models/gpt2",
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 60,
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
    console.log(`❌ GPT-2 fallback failed: ${error.message}`);
  }

  throw new Error(`All Hugging Face APIs failed for ${personality}`);
}

let debateInterval;

function startDebate() {
  if (debateInterval) return;
  
  currentDebate.isLive = true;
  currentDebate.messages.push({
    id: Date.now(),
    ai: 'system',
    text: `🔴 LIVE: NEW Hugging Face Chat API Debate on "${currentDebate.topic}"`,
    timestamp: new Date().toISOString()
  });

  broadcast({
    type: 'debate_update',
    debate: currentDebate
  });

  console.log('🎬 Starting NEW Hugging Face Chat API debate...');
  console.log(`🔑 API Key: ${process.env.HUGGINGFACE_API_KEY ? 'Available ✅' : 'Missing ❌'}`);

  debateInterval = setInterval(async () => {
    const ais = Object.keys(AI_PERSONALITIES);
    const speakingAI = ais[Math.floor(Math.random() * ais.length)];

    try {
      console.log(`🎤 ${speakingAI} generating NEW API response...`);
      
      const response = await getHuggingFaceChatResponse(
        speakingAI,
        currentDebate.topic,
        currentDebate.messages.filter(m => m.ai !== 'system').slice(-3)
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
      console.error(`❌ NEW API failed for ${speakingAI}:`, error.message);
      
      const errorMessage = {
        id: Date.now(),
        ai: 'system',
        text: `⚠️ ${speakingAI} API issue - trying backup models...`,
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

  }, 15000 + Math.random() * 10000); // 15-25 seconds for processing

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
  res.json({ success: true, message: 'NEW Hugging Face Chat API debate started!' });
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
      console.log(`💬 ${respondingAI} responding to chat with NEW API...`);
      
      const chatContext = [{ ai: 'viewer', text: message }];
      const response = await getHuggingFaceChatResponse(respondingAI, `Viewer comment: ${message}`, chatContext);
      
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
      console.error('NEW API chat response failed:', error);
    }
  }, 3000);

  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`🚀 NEW HUGGING FACE CHAT API Debate Arena`);
  console.log(`🔑 HF Token: ${process.env.HUGGINGFACE_API_KEY ? 'Connected ✅' : 'Missing ❌'}`);
  console.log(`🤖 Using NEW Chat Completion API (OpenAI-compatible)`);
  console.log(`📡 Models: Qwen, Phi-3.5, Llama-3.2, Zephyr`);
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
