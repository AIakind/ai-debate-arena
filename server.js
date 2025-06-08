// server.js - PURE AI ONLY - No fallback responses
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
    systemPrompt: "You are Alex, a pragmatic debater. Focus on economics, data, practical solutions. Be direct and cite facts. Respond in 1-2 sentences only."
  },
  luna: {
    name: "Luna",
    role: "The Idealist",
    color: "bg-purple-500",
    avatar: "✨",
    systemPrompt: "You are Luna, an idealistic debater. Focus on ethics, human rights, moral principles. Be passionate about justice. Respond in 1-2 sentences only."
  },
  rex: {
    name: "Rex",
    role: "The Skeptic",
    color: "bg-red-500",
    avatar: "🔍",
    systemPrompt: "You are Rex, a skeptical debater. Question assumptions, point out flaws, challenge claims. Be critical but constructive. Respond in 1-2 sentences only."
  },
  sage: {
    name: "Sage",
    role: "The Mediator",
    color: "bg-green-500",
    avatar: "🧠",
    systemPrompt: "You are Sage, a wise mediator. Find common ground, synthesize viewpoints, ask clarifying questions. Be balanced. Respond in 1-2 sentences only."
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

// PURE AI FUNCTION - NO FALLBACKS!
async function getPureAIResponse(personality, topic, recentMessages) {
  const aiData = AI_PERSONALITIES[personality];
  
  // Build conversation context
  const context = recentMessages
    .slice(-3)
    .map(msg => `${msg.ai}: ${msg.text}`)
    .join('\n');
  
  const prompt = `${aiData.systemPrompt}

Current debate topic: "${topic}"

Recent conversation:
${context}

Now respond as ${aiData.name} with your unique perspective. Keep it to 1-2 sentences maximum.

${aiData.name}:`;

  console.log(`🤖 ${personality} is thinking about: ${topic}`);

  // Try multiple AI services until one works
  
  // Method 1: OpenAI API (best results)
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: aiData.systemPrompt },
            { role: "user", content: `Debate topic: ${topic}\n\nRecent conversation:\n${context}\n\nRespond as ${aiData.name} in 1-2 sentences:` }
          ],
          max_tokens: 100,
          temperature: 0.9
        })
      });

      if (response.ok) {
        const result = await response.json();
        const aiResponse = result.choices[0]?.message?.content?.trim();
        if (aiResponse && aiResponse.length > 5) {
          console.log(`✅ ${personality} (OpenAI): ${aiResponse}`);
          return aiResponse;
        }
      }
    } catch (error) {
      console.log(`❌ OpenAI failed for ${personality}: ${error.message}`);
    }
  }

  // Method 2: Anthropic Claude API
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 100,
          messages: [
            {
              role: "user",
              content: `${aiData.systemPrompt}\n\nTopic: ${topic}\nContext: ${context}\n\nRespond as ${aiData.name} in 1-2 sentences:`
            }
          ]
        })
      });

      if (response.ok) {
        const result = await response.json();
        const aiResponse = result.content[0]?.text?.trim();
        if (aiResponse && aiResponse.length > 5) {
          console.log(`✅ ${personality} (Claude): ${aiResponse}`);
          return aiResponse;
        }
      }
    } catch (error) {
      console.log(`❌ Claude failed for ${personality}: ${error.message}`);
    }
  }

  // Method 3: Hugging Face Conversational AI
  if (process.env.HUGGINGFACE_API_KEY) {
    try {
      const response = await fetch(
        "https://api-inference.huggingface.co/models/microsoft/DialoGPT-large",
        {
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({
            inputs: {
              past_user_inputs: [`What do you think about: ${topic}?`],
              generated_responses: [],
              text: `As ${aiData.name}, ${aiData.systemPrompt.toLowerCase()} What's your take on ${topic}?`
            },
            parameters: {
              max_length: 100,
              temperature: 0.9,
              do_sample: true
            }
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        let aiResponse = result.generated_text || result[0]?.generated_text || '';
        
        if (aiResponse && aiResponse.length > 10) {
          // Clean up response
          aiResponse = aiResponse
            .replace(/^.*?:/g, '') // Remove prefixes
            .trim()
            .split('.')[0] + '.'; // Take first sentence
          
          console.log(`✅ ${personality} (HuggingFace): ${aiResponse}`);
          return aiResponse;
        }
      }
    } catch (error) {
      console.log(`❌ HuggingFace failed for ${personality}: ${error.message}`);
    }
  }

  // Method 4: Free APIs from HuggingFace
  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill",
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY || 'hf_demo'}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          inputs: `${aiData.systemPrompt} Topic: ${topic}. What do you think?`,
          parameters: {
            max_length: 80,
            temperature: 0.8
          }
        }),
      }
    );

    if (response.ok) {
      const result = await response.json();
      let aiResponse = result[0]?.generated_text || result.generated_text || '';
      
      if (aiResponse && aiResponse.length > 10) {
        console.log(`✅ ${personality} (BlenderBot): ${aiResponse}`);
        return aiResponse;
      }
    }
  } catch (error) {
    console.log(`❌ BlenderBot failed for ${personality}: ${error.message}`);
  }

  // Method 5: Together AI (Free tier)
  if (process.env.TOGETHER_API_KEY) {
    try {
      const response = await fetch("https://api.together.xyz/inference", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.TOGETHER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "togethercomputer/RedPajama-INCITE-Chat-3B-v1",
          prompt: `${aiData.systemPrompt}\n\nTopic: ${topic}\nContext: ${context}\n\n${aiData.name}:`,
          max_tokens: 80,
          temperature: 0.9
        })
      });

      if (response.ok) {
        const result = await response.json();
        const aiResponse = result.output?.choices?.[0]?.text?.trim();
        if (aiResponse && aiResponse.length > 5) {
          console.log(`✅ ${personality} (Together): ${aiResponse}`);
          return aiResponse;
        }
      }
    } catch (error) {
      console.log(`❌ Together AI failed for ${personality}: ${error.message}`);
    }
  }

  // If ALL APIs fail, throw error - NO FALLBACKS!
  console.error(`❌ ALL AI APIs FAILED for ${personality}! No response generated.`);
  throw new Error(`No AI service available for ${personality}`);
}

let debateInterval;

function startDebate() {
  if (debateInterval) return;
  
  currentDebate.isLive = true;
  currentDebate.messages.push({
    id: Date.now(),
    ai: 'system',
    text: `🔴 LIVE: Pure AI Debate on "${currentDebate.topic}" - Only real AI responses!`,
    timestamp: new Date().toISOString()
  });

  broadcast({
    type: 'debate_update',
    debate: currentDebate
  });

  console.log('🎬 Starting PURE AI debate - no fallbacks!');

  debateInterval = setInterval(async () => {
    const ais = Object.keys(AI_PERSONALITIES);
    const speakingAI = ais[Math.floor(Math.random() * ais.length)];

    try {
      console.log(`🎤 ${speakingAI} is generating REAL AI response...`);
      
      // Get PURE AI response - will throw error if all APIs fail
      const response = await getPureAIResponse(
        speakingAI,
        currentDebate.topic,
        currentDebate.messages.filter(m => m.ai !== 'system')
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
      console.error(`❌ Could not generate AI response for ${speakingAI}:`, error.message);
      
      // Add system message about AI failure
      const errorMessage = {
        id: Date.now(),
        ai: 'system',
        text: `⚠️ ${speakingAI} couldn't connect to AI services - check API keys`,
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

  }, 10000 + Math.random() * 5000); // 10-15 seconds for AI processing

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
        text: `🔄 New pure AI debate: ${newTopic}`,
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
  res.json({ success: true, message: 'Pure AI debate started - only real AI responses!' });
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

  // Real AI responds to chat
  const respondingAI = Object.keys(AI_PERSONALITIES)[Math.floor(Math.random() * 4)];
  
  setTimeout(async () => {
    try {
      console.log(`💬 ${respondingAI} responding to chat with REAL AI...`);
      
      const chatContext = [{ ai: 'viewer', text: message }];
      const response = await getPureAIResponse(respondingAI, `Viewer says: ${message}`, chatContext);
      
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
      console.error('Pure AI chat response failed:', error);
    }
  }, 2000);

  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`🚀 PURE AI Debate Arena - NO FALLBACKS!`);
  console.log(`🔑 API Keys Available:`);
  console.log(`   OpenAI: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`   Anthropic: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`   HuggingFace: ${!!process.env.HUGGINGFACE_API_KEY}`);
  console.log(`   Together: ${!!process.env.TOGETHER_API_KEY}`);
  console.log(`🤖 Pure AI personalities ready - will only use real AI!`);
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
