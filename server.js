// server.js - Real AI Debate Arena with Actual AI APIs
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

// AI Personalities with unique system prompts for real AI
const AI_PERSONALITIES = {
  alex: {
    name: "Alex",
    role: "The Pragmatist",
    color: "bg-blue-500",
    avatar: "🤖",
    systemPrompt: `You are Alex, a data-driven pragmatist in a live debate. You focus on:
- Economic costs and benefits
- Real-world implementation challenges  
- Historical precedents and case studies
- Measurable outcomes and ROI
- Practical step-by-step solutions

Always respond in 2-3 sentences with specific examples or numbers when possible. Be direct, skeptical of idealistic claims, and focus on what actually works in practice. You're debating live, so be conversational but authoritative.`
  },
  luna: {
    name: "Luna", 
    role: "The Idealist",
    color: "bg-purple-500",
    avatar: "✨",
    systemPrompt: `You are Luna, a passionate idealist in a live debate. You focus on:
- Human rights and dignity
- Long-term consequences for society
- Ethical frameworks and moral imperatives
- Protecting vulnerable populations
- Creating a better future for all

Always respond in 2-3 sentences with emotional resonance and moral clarity. Challenge others to think beyond short-term costs. You believe in human potential and that doing the right thing is worth the investment. You're debating live, so be inspiring but grounded.`
  },
  rex: {
    name: "Rex",
    role: "The Skeptic", 
    color: "bg-red-500",
    avatar: "🔍",
    systemPrompt: `You are Rex, a sharp skeptic in a live debate. You focus on:
- Unintended consequences and downsides
- Challenging assumptions and claims
- Historical failures and cautionary tales
- Hidden costs and implementation problems
- Playing devil's advocate effectively

Always respond in 2-3 sentences by questioning the premises or pointing out flaws in reasoning. Be contrarian but not negative - your goal is to stress-test ideas. Ask tough questions that others avoid. You're debating live, so be incisive and thought-provoking.`
  },
  sage: {
    name: "Sage",
    role: "The Mediator",
    color: "bg-green-500", 
    avatar: "🧠",
    systemPrompt: `You are Sage, a wise mediator in a live debate. You focus on:
- Finding common ground between opposing views
- Synthesizing different perspectives
- Asking clarifying questions that deepen discussion
- Identifying underlying shared values
- Proposing balanced compromise solutions

Always respond in 2-3 sentences by building bridges between other viewpoints. Look for what everyone agrees on, then build from there. You're debating live, so be thoughtful and help move the conversation forward constructively.`
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
  "Should genetic engineering be allowed in humans?",
  "Is nuclear energy the solution to climate change?",
  "Should we tax robots to fund displaced workers?",
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

// REAL AI API Integration
async function callRealAI(personality, topic, conversationHistory) {
  const aiPersonality = AI_PERSONALITIES[personality];
  
  // Build context from recent conversation
  const recentContext = conversationHistory
    .slice(-4)
    .map(msg => `${AI_PERSONALITIES[msg.ai]?.name || msg.ai}: ${msg.text}`)
    .join('\n');
  
  const prompt = `${aiPersonality.systemPrompt}

CURRENT DEBATE TOPIC: "${topic}"

RECENT CONVERSATION:
${recentContext}

Now respond as ${aiPersonality.name} (${aiPersonality.role}) with your unique perspective on this topic. Remember to stay in character and keep it to 2-3 sentences.

${aiPersonality.name}:`;

  try {
    // Try Hugging Face API first
    if (process.env.HUGGINGFACE_API_KEY) {
      console.log(`🤖 ${personality} thinking...`);
      
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
              max_new_tokens: 100,
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
        
        // Clean up the response
        aiResponse = aiResponse
          .replace(prompt, '')
          .replace(`${aiPersonality.name}:`, '')
          .trim()
          .split('\n')[0]; // Take first line only
        
        if (aiResponse && aiResponse.length > 10) {
          console.log(`✅ ${personality}: ${aiResponse.substring(0, 50)}...`);
          return aiResponse;
        }
      }
    }

    // Try alternative API - OpenAI-compatible endpoints
    if (process.env.OPENAI_API_KEY) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system", 
              content: aiPersonality.systemPrompt
            },
            {
              role: "user", 
              content: `Topic: ${topic}\n\nRecent conversation:\n${recentContext}\n\nRespond as ${aiPersonality.name}:`
            }
          ],
          max_tokens: 100,
          temperature: 0.8
        })
      });

      if (response.ok) {
        const result = await response.json();
        const aiResponse = result.choices[0]?.message?.content;
        if (aiResponse) {
          console.log(`✅ ${personality} (OpenAI): ${aiResponse.substring(0, 50)}...`);
          return aiResponse;
        }
      }
    }

    // Fallback to character-specific responses if APIs fail
    return generateCharacterResponse(personality, topic);

  } catch (error) {
    console.error(`❌ AI API Error for ${personality}:`, error.message);
    return generateCharacterResponse(personality, topic);
  }
}

// Fallback responses that maintain character personality
function generateCharacterResponse(personality, topic) {
  const responses = {
    alex: [
      "The economic impact analysis is crucial here. We need concrete data on implementation costs and measurable ROI before making policy decisions.",
      "Looking at similar initiatives globally, the success rate is mixed. We should pilot this in controlled environments first.",
      "The infrastructure requirements alone would cost billions. Are we prepared for that investment without guaranteed outcomes?",
      "Historical precedent shows that rushed implementation often fails. We need phased rollouts with clear performance metrics."
    ],
    luna: [
      "This is fundamentally about human dignity and our responsibility to future generations. Some things transcend cost-benefit calculations.",
      "We have a moral obligation to protect the vulnerable in society. The ethical framework here is more important than short-term economics.",
      "History will judge us by how we respond to this challenge. We must choose compassion over convenience.",
      "The human cost of inaction far outweighs the financial investment required. We cannot put a price on human suffering."
    ],
    rex: [
      "What are the unintended consequences we're not discussing? These solutions often create bigger problems than they solve.",
      "I'm skeptical of these rosy projections. Where's the independent analysis? Who benefits from pushing this agenda?",
      "We've seen this playbook before - grand promises, massive spending, minimal results. Why would this time be different?",
      "The devil is in the implementation details that nobody wants to talk about. What happens when this inevitably goes wrong?"
    ],
    sage: [
      "Perhaps we can find common ground by focusing on our shared values rather than our different approaches.",
      "Both perspectives have merit. What if we combined the pragmatic concerns with the ethical imperatives?",
      "The real question seems to be how we balance immediate needs with long-term sustainability. Can we find a middle path?",
      "I hear everyone wanting the best outcome. Let's explore how we might address the practical concerns while honoring the moral principles."
    ]
  };

  const personalityResponses = responses[personality] || responses.alex;
  return personalityResponses[Math.floor(Math.random() * personalityResponses.length)];
}

// Debate management with real AI
let debateInterval;

function startDebate() {
  if (debateInterval) return;
  
  currentDebate.isLive = true;
  currentDebate.messages.push({
    id: Date.now(),
    ai: 'system',
    text: `🔴 LIVE: AI Debate starting on "${currentDebate.topic}"`,
    timestamp: new Date().toISOString()
  });

  broadcast({
    type: 'debate_update',
    debate: currentDebate
  });

  // Start the debate loop with real AI
  debateInterval = setInterval(async () => {
    const ais = Object.keys(AI_PERSONALITIES);
    let speakingAI;
    
    // Smart speaker selection based on conversation flow
    const lastMessage = currentDebate.messages[currentDebate.messages.length - 1];
    const lastSpeakers = currentDebate.messages
      .slice(-3)
      .map(m => m.ai)
      .filter(ai => ai !== 'system');
    
    // Sage responds to conflicts, others rotate
    if (lastSpeakers.includes('alex') && lastSpeakers.includes('rex') && !lastSpeakers.includes('sage')) {
      speakingAI = 'sage';
    } else if (lastMessage?.ai === 'luna') {
      speakingAI = Math.random() > 0.5 ? 'rex' : 'alex'; // Challenge idealism
    } else if (lastMessage?.ai === 'alex') {
      speakingAI = Math.random() > 0.5 ? 'luna' : 'rex'; // Question or idealize
    } else {
      speakingAI = ais[Math.floor(Math.random() * ais.length)];
    }

    try {
      console.log(`🎤 ${speakingAI} is speaking...`);
      
      // Get REAL AI response
      const response = await callRealAI(speakingAI, currentDebate.topic, currentDebate.messages);
      
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

      // Update scores based on response quality
      const responseLength = response.length;
      const scoreIncrease = responseLength > 100 ? 3 : responseLength > 50 ? 2 : 1;
      currentDebate.scores[speakingAI] += scoreIncrease;

      // Dynamic viewer updates
      currentDebate.viewers += Math.floor(Math.random() * 30) - 15;
      currentDebate.viewers = Math.max(800, Math.min(5000, currentDebate.viewers));

      broadcast({
        type: 'new_message',
        message: newMessage,
        scores: currentDebate.scores,
        viewers: currentDebate.viewers
      });

    } catch (error) {
      console.error('Debate error:', error);
    }

  }, 6000 + Math.random() * 4000); // 6-10 second intervals for AI processing

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
  res.json({ success: true, message: 'Debate started with real AI' });
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

  // AI responds to chat with real AI
  if (Math.random() > 0.6) {
    const respondingAI = Object.keys(AI_PERSONALITIES)[Math.floor(Math.random() * 4)];
    
    setTimeout(async () => {
      try {
        console.log(`💬 ${respondingAI} responding to chat: "${message}"`);
        
        // Create a chat-specific prompt
        const chatPrompt = `${AI_PERSONALITIES[respondingAI].systemPrompt}

A viewer in the chat just said: "${message}"

Respond to this chat message as ${AI_PERSONALITIES[respondingAI].name} while staying relevant to the current debate topic: "${currentDebate.topic}"

Keep it conversational and under 2 sentences.`;

        const response = await callRealAI(respondingAI, `Chat response to: ${message}`, [{ai: 'viewer', text: message}]);
        
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
    }, 3000);
  }

  res.json({ success: true });
});

// Serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket handling
const server = app.listen(port, () => {
  console.log(`🚀 AI Debate Arena with REAL AI running on port ${port}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🤖 Real AI personalities loaded: ${Object.keys(AI_PERSONALITIES).length}`);
  console.log(`🔑 API Keys: HF=${!!process.env.HUGGINGFACE_API_KEY}, OpenAI=${!!process.env.OPENAI_API_KEY}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`👤 New client connected. Total: ${clients.size}`);
  
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
