environment: [
    {
      title: "Nuclear Power Renaissance: 47 New Reactors Under Construction Globally",
      content: "Nuclear power is experiencing a revival with 47 new reactors under construction worldwide as countries seek carbon-free energy. France generates 78% of electricity from nuclear with minimal carbon emissions, while Germany's nuclear phase-out increased coal use and emissions by 23%. Small Modular Reactors (SMRs) promise safer, cheaper nuclear power with walk-away safe designs. However, nuclear waste remains radioactive for 10,000 years with no permanent storage solution in most countries. The Fukushima disaster contaminated 1,100 square kilometers, displacing 164,000 people permanently. New reactor designs are 100x safer than older models, with passive safety systems that work without electricity. Construction costs average $23 billion per plant, while solar costs dropped 89% since 2010. Climate scientists argue nuclear is essential for rapid decarbonization, while environmentalists prefer renewable alternatives despite intermittency challenges.",
      category: "environment",
      source: "International Atomic Energy Agency",
      debateQuestion: "Is nuclear power essential for fighting climate change or too dangerous to pursue?"
    },
    {
      title: "Electric Vehicle Sales Hit 14% Market Share But Strain Power Grids",
      content: "Electric vehicle sales reached 14% of new car purchases, preventing 890 million tons of CO2 emissions annually. However, mass EV adoption could overload electrical grids, requiring $2.5 trillion in infrastructure upgrades. Texas's grid nearly collapsed during a heat wave when EV charging peaked with air conditioning demand. China dominates EV battery production with 76% market share, creating supply chain vulnerabilities for other countries. Lithium mining for batteries devastates local environments and indigenous communities in Chile and Congo. Battery recycling recovers only 23% of materials, creating new waste streams. Meanwhile, EVs eliminate urban air pollution that kills 200,000 Americans annually. Range anxiety persists with 67% of rural areas lacking charging infrastructure.",
      category: "environment",
      source: "International Energy Agency",
      debateQuestion: "Should countries mandate electric vehicle transitions despite infrastructure challenges?"
    }
  ],

  society: [
    {
      title: "Social Media Algorithms Amplify Political Polarization by 340%",
      content: "MIT research shows social media algorithms increase political polarization by 340% by creating echo chambers that reinforce existing beliefs. Users see content agreeing with their views 89% of the time, while opposing viewpoints appear only 11%. This drives extreme political positions and reduces compromise. However, these algorithms also help users find communities and support networks, particularly benefiting marginalized groups who connect across geographic boundaries. LGBTQ+ youth in rural areas report 67% better mental health outcomes when connected to supportive online communities. Meanwhile, democracy requires informed debate between different perspectives, which algorithmic filtering undermines. Some countries propose algorithm transparency requirements, while tech companies argue this would reveal trade secrets and enable gaming of systems.",
      category: "society",
      source: "MIT Political Science Quarterly",
      debateQuestion: "Should social media algorithms be regulated to reduce political polarization?"
    },
    {
      title: "Universal Healthcare Reduces Medical Bankruptcies 94% But Increases Wait Times",
      content: "Countries with universal healthcare systems see 94% fewer medical bankruptcies and 23% better health outcomes overall. However, specialist wait times average 89 days versus 19 days in private systems. Canada's system provides excellent emergency care but patients wait 6 months for hip replacements. Meanwhile, US medical debt affects 45 million people, with 67% of bankruptcies caused by medical bills even among insured patients. Administrative costs consume 31% of US healthcare spending versus 12% in single-payer systems. Quality varies significantly, with Nordic countries achieving both universal access and short wait times through higher spending. Some argue mixed public-private systems optimize both access and quality, while others advocate for fully public or fully private approaches.",
      category: "society",
      source: "Health Affairs",
      debateQuestion: "Should healthcare be a universal right even if it means longer wait times?"
    }
  ],

  politics: [
    {
      title: "Ranked Choice Voting Reduces Negative Campaigning But Confuses 23% of Voters",
      content: "Cities using ranked choice voting see 67% less negative campaigning as candidates seek second-choice votes from opponents' supporters. This encourages coalition-building and more civil discourse. However, 23% of voters find the system confusing, with higher error rates among elderly and less-educated voters. ballot completion drops 8% in ranked choice elections. Meanwhile, traditional winner-take-all systems often produce winners with less than majority support, potentially undermining democratic legitimacy. Alaska's ranked choice system elected a moderate candidate who wouldn't have won under traditional rules. Some argue the complexity is worth better representation, while others prefer simplicity and clarity. Implementation costs are 340% higher due to voter education and new equipment requirements.",
      category: "politics",
      source: "American Political Science Review",
      debateQuestion: "Should electoral systems prioritize simplicity or better representation?"
    },
    {
      title: "Term Limits for Politicians Increase Turnover But Reduce Legislative Experience",
      content: "States with congressional term limits see 340% higher turnover and 67% more diverse representation by age, race, and profession. However, legislative effectiveness drops 23% as inexperienced lawmakers struggle with complex policy issues. Lobbyist influence actually increases when dealing with naive legislators who lack institutional knowledge. Meanwhile, career politicians develop expertise but become disconnected from ordinary citizens' experiences. The average senator serves 10.1 years while average Americans change jobs every 4.2 years. Term limits could reduce corruption and bring fresh perspectives, but might also eliminate effective public servants. Some argue for voluntary term limits through voter choice, while others support constitutional amendments mandating rotation.",
      category: "politics",
      source: "Journal of Politics",
      debateQuestion: "Do term limits improve democracy or just create inexperienced government?"
    }
  ]
};

let currentDebate = {
  topic: '',
  messages: [],
  scores: {marcus: 0, zara: 0, viktor: 0, aria: 0},
  isLive: false,
  viewers: 1247,
  topicTimer: 1800,
  newsSource: null,
  currentArticle: null
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

// Select random article from database
function getRandomArticle() {
  const categories = Object.keys(ARTICLE_DATABASE);
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  const articles = ARTICLE_DATABASE[randomCategory];
  const randomArticle = articles[Math.floor(Math.random() * articles.length)];
  
  return {
    ...randomArticle,
    category: randomCategory
  };
}

// Generate informed AI response based on article content
async function getInformedAIResponse(personality, articleData, recentMessages, isResponse = false) {
  const aiData = AI_PERSONALITIES[personality];
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    throw new Error('No Hugging Face API key found');
  }

  let conversationPrompt;
  
  if (isResponse && recentMessages.length > 0) {
    const lastMessage = recentMessages[recentMessages.length - 1];
    const context = recentMessages
      .filter(m => m.ai !== 'system')
      .slice(-2)
      .map(msg => `${msg.ai}: ${msg.text}`)
      .join('\n');
    
    conversationPrompt = `ARTICLE: "${articleData.title}"
CONTENT: ${articleData.content}

PREVIOUS CONVERSATION:
${context}

${lastMessage.ai} just said: "${lastMessage.text}"

Respond as ${aiData.name}. You've read this article and have strong opinions about it. Reference specific facts, numbers, or details from the article. Disagree strongly if it conflicts with your worldview. Be opinionated and passionate. Don't start with generic phrases - jump straight into your perspective.`;
  } else {
    conversationPrompt = `ARTICLE: "${articleData.title}"
CONTENT: ${articleData.content}

You are ${aiData.name} and you just read this article. Give your immediate, strong reaction. Reference specific details, statistics, or facts from the article. Be opinionated and passionate about your position. Don't start with generic phrases - jump straight into your perspective with conviction.`;
  }

  console.log(`🤖 ${personality} generating informed response about: ${articleData.title}`);

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
            max_tokens: 150,
            temperature: 0.9,
            top_p: 0.9,
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
        
        // Clean up response but keep the strong opinions
        aiResponse = aiResponse
          .replace(/^["\']|["\']$/g, '')
          .replace(/\b(Marcus|Zara|Viktor|Aria)\s*(thinks?|believes?|says?|responds?)\s*/gi, '')
          .replace(/\bAs (Marcus|Zara|Viktor|Aria),?\s*/gi, '')
          .replace(/\b(Marcus|Zara|Viktor|Aria)'s (perspective|view|opinion)\s*/gi, 'My ')
          // Remove generic starting phrases
          .replace(/^(Look,|Here's the thing,|You know,|I mean,|Well,|So,|Honestly,)\s*/gi, '')
          .replace(/^(Let me tell you,|I have to say,|In my opinion,)\s*/gi, '')
          .trim();
        
        // Ensure complete thoughts
        if (aiResponse.length > 300) {
          const sentences = aiResponse.split(/[.!?]+/);
          let truncated = '';
          for (const sentence of sentences) {
            if ((truncated + sentence).length < 250) {
              truncated += sentence + (sentence.length > 0 ? '.' : '');
            } else {
              break;
            }
          }
          aiResponse = truncated || aiResponse.substring(0, 240) + '...';
        }
        
        const wordCount = aiResponse.split(' ').length;
        if (aiResponse && wordCount >= 10 && aiResponse.length <= 300) {
          console.log(`✅ ${personality} (${model}): "${aiResponse}"`);
          return aiResponse;
        }
      }

    } catch (error) {
      console.log(`❌ Model ${model} error:`, error.message);
      continue;
    }
  }

  // Strong opinionated fallback responses
  const fallbackResponses = {
    marcus: [
      `The market clearly shows this is economically viable. Competition and profit incentives will optimize outcomes better than any government intervention.`,
      `This creates massive economic opportunities. Private sector innovation always outperforms bureaucratic solutions when properly incentivized.`,
      `The numbers don't lie - market mechanisms efficiently allocate resources while regulation just adds costly overhead and reduces competitiveness.`
    ],
    zara: [
      `This highlights exactly why we need systemic change to protect vulnerable communities. Profit-driven solutions ignore social justice and perpetuate inequality.`,
      `Corporate interests are clearly prioritized over human needs here. We need policies that put people before profits and ensure equitable outcomes.`,
      `This is another example of how capitalism fails ordinary people. We need progressive policies and wealth redistribution to address these root causes.`
    ],
    viktor: [
      `The real-world implementation will face obstacles these idealistic proposals ignore. History shows similar initiatives failed because they overlooked human nature and practical constraints.`,
      `Both sides miss the practical trade-offs here. Every policy has unintended consequences, and we need evidence-based approaches rather than ideological solutions.`,
      `This sounds good in theory but falls apart under scrutiny. We need to examine actual results from similar programs rather than relying on theoretical models.`
    ],
    aria: [
      `This technology could revolutionize how we approach these challenges. Exponential improvements in AI and automation will make current limitations irrelevant within years.`,
      `We're thinking too small - emerging technologies will create abundance that makes these scarcity-based arguments obsolete. Innovation accelerates faster than policy can adapt.`,
      `Traditional approaches are already outdated. Breakthrough technologies in this space will solve problems in ways we haven't imagined yet.`
    ]
  };

  const fallback = fallbackResponses[personality];
  const selectedFallback = fallback[Math.floor(Math.random() * fallback.length)];
  console.log(`🔄 Using fallback response for ${personality}: "${selectedFallback}"`);
  return selectedFallback;
}

function selectNextSpeaker(lastSpeaker) {
  const ais = Object.keys(AI_PERSONALITIES);
  const availableAIs = ais.filter(ai => ai !== lastSpeaker);
  
  // Create natural debate flow
  if (lastSpeaker === 'marcus') {
    return Math.random() > 0.5 ? 'zara' : 'viktor'; // Capitalist gets challenged by progressive or realist
  } else if (lastSpeaker === 'zara') {
    return Math.random() > 0.5 ? 'marcus' : 'aria'; // Progressive gets challenged by capitalist or futurist
  } else if (lastSpeaker === 'viktor') {
    return Math.random() > 0.5 ? 'aria' : 'marcus'; // Realist gets responded to by futurist or capitalist
  } else if (lastSpeaker === 'aria') {
    return Math.random() > 0.5 ? 'viktor' : 'zara'; // Futurist gets grounded by realist or progressive
  }
  
  return availableAIs[Math.floor(Math.random() * availableAIs.length)];
}

let debateInterval;
let topicRefreshTimer;
let conversationFlow = [];

function startConversationLoop() {
  if (debateInterval) return;
  
  console.log('🎬 Starting opinionated conversation loop...');
  
  debateInterval = setInterval(async () => {
    try {
      if (!currentDebate.currentArticle) {
        console.log('⚠️ No article data available, skipping this round');
        return;
      }

      const nonSystemMessages = currentDebate.messages.filter(m => m.ai !== 'system');
      const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
      
      let speakingAI;
      let isResponse = false;
      
      if (lastMessage && lastMessage.ai !== 'system') {
        speakingAI = selectNextSpeaker(lastMessage.ai);
        isResponse = true;
      } else {
        speakingAI = Object.keys(AI_PERSONALITIES)[Math.floor(Math.random() * 4)];
        isResponse = false;
      }
      
      conversationFlow.push(speakingAI);
      if (conversationFlow.length > 8) {
        conversationFlow = conversationFlow.slice(-6);
      }

      console.log(`🎤 ${speakingAI} ${isResponse ? 'responding to' : 'opening with'} strong opinions...`);
      
      const response = await getInformedAIResponse(
        speakingAI,
        currentDebate.currentArticle,
        nonSystemMessages,
        isResponse
      );
      
      const newMessage = {
        id: Date.now(),
        ai: speakingAI,
        text: response,
        timestamp: new Date().toISOString(),
        reactions: Math.floor(Math.random() * 50) + 30
      };

      currentDebate.messages.push(newMessage);
      if (currentDebate.messages.length > 40) {
        currentDebate.messages = currentDebate.messages.slice(-35);
      }

      currentDebate.scores[speakingAI] += Math.floor(Math.random() * 4) + 2;
      currentDebate.viewers += Math.floor(Math.random() * 35) - 17;
      currentDebate.viewers = Math.max(1100, Math.min(4800, currentDebate.viewers));

      console.log(`📤 Broadcasting opinionated message: "${response}"`);
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
        text: `⚠️ AIs are researching their next arguments...`,
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
        console.log('🔄 Time for a new heated debate topic...');
        
        const newArticle = getRandomArticle();
        
        currentDebate.topic = newArticle.debateQuestion;
        currentDebate.newsSource = `${newArticle.source} - ${newArticle.category.toUpperCase()}`;
        currentDebate.currentArticle = newArticle;
        currentDebate.topicTimer = 1800; // 30 minutes per topic
        conversationFlow = [];
        
        const systemMessage = {
          id: Date.now(),
          ai: 'system',
          text: `🔥 NEW DEBATE: "${newArticle.title}" - ${newArticle.debateQuestion} (${newArticle.source})`,
          timestamp: new Date().toISOString()
        };
        
        currentDebate.messages.push(systemMessage);
        
        broadcast({
          type: 'topic_change',
          topic: newArticle.debateQuestion,
          source: currentDebate.newsSource,
          timer: currentDebate.topicTimer,
          message: systemMessage,
          articleTitle: newArticle.title
        });
        
        console.log(`🔄 New heated debate: ${newArticle.title}`);
        
      } catch (error) {
        console.error('Article refresh failed:', error.message);
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

async function startDebate() {
  if (debateInterval) {
    console.log('⚠️ Debate already running');
    return;
  }
  
  try {
    console.log('🔄 Starting opinionated AI debate...');
    console.log(`🔑 Environment check:`);
    console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? 'Found' : 'Missing'}`);
    
    console.log('📚 AIs are studying their assigned article...');
    const articleData = getRandomArticle();
    
    currentDebate.topic = articleData.debateQuestion;
    currentDebate.newsSource = `${articleData.source} - ${articleData.category.toUpperCase()}`;
    currentDebate.currentArticle = articleData;
    currentDebate.isLive = true;
    currentDebate.messages = [];
    currentDebate.scores = {marcus: 0, zara: 0, viktor: 0, aria: 0};
    conversationFlow = [];
    
    const startMessage = `🔴 LIVE: Opinionated AI Debate - "${articleData.title}" - ${articleData.debateQuestion}`;

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

    console.log('🎬 Opinionated AIs are ready for heated debate...');
    console.log(`📰 Article: ${articleData.title}`);
    console.log(`🔥 Question: ${articleData.debateQuestion}`);

    startConversationLoop();

  } catch (error) {
    console.error('❌ Failed to start opinionated debate:', error.message);
    
    const fallbackArticle = {
      title: "Universal Basic Income vs Free Market Solutions",
      content: "Governments worldwide debate whether to provide universal basic income or rely on free market solutions for economic security.",
      debateQuestion: "Should governments provide Universal Basic Income or let free markets handle economic security?",
      source: "Economic Policy Debates",
      category: "economy"
    };
    
    currentDebate.topic = fallbackArticle.debateQuestion;
    currentDebate.newsSource = fallbackArticle.source;
    currentDebate.currentArticle = fallbackArticle;
    currentDebate.isLive = true;
    currentDebate.messages = [{
      id: Date.now(),
      ai: 'system',
      text: `🔴 LIVE: Opinionated AI Debate - "${fallbackArticle.debateQuestion}"`,
      timestamp: new Date().toISOString()
    }];
    
    broadcast({
      type: 'debate_update',
      debate: currentDebate
    });
    
    console.log('🎬 Started with fallback topic');
    
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
  currentDebate.scores = {marcus: 0, zara: 0, viktor: 0, aria: 0};
  currentDebate.currentArticle = null;
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
  res.json({ success: true, message: 'Opinionated AIs are starting their heated debate!' });
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
  
  res.json({ success: true, message: 'The AIs are forming strong opinions about your question!' });
  
  setTimeout(async () => {
    try {
      console.log(`💬 ${respondingAI} responding to chat: "${message}"`);
      
      const response = await getInformedAIResponse(
        respondingAI, 
        currentDebate.currentArticle || { title: "Chat Question", content: message, debateQuestion: message },
        [], 
        false
      );
      
      const aiMessage = {
        id: Date.now(),
        ai: respondingAI,
        text: response,
        timestamp: new Date().toISOString(),
        reactions: Math.floor(Math.random() * 40) + 25,
        isResponse: true
      };
      
      currentDebate.messages.push(aiMessage);
      
      broadcast({
        type: 'ai_chat_response',
        message: aiMessage
      });
      
      console.log(`✅ ${respondingAI} gave opinionated response: "${response}"`);
      
    } catch (error) {
      console.error('Chat response failed:', error);
    }
  }, 2500);
});

app.get('/api/current-article', (req, res) => {
  if (currentDebate.currentArticle) {
    res.json({
      title: currentDebate.currentArticle.title,
      question: currentDebate.currentArticle.debateQuestion,
      source: currentDebate.currentArticle.source,
      category: currentDebate.currentArticle.category,
      content: currentDebate.currentArticle.content.substring(0, 500) + '...'
    });
  } else {
    res.json({ message: 'No article currently being debated' });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    websockets: clients.size,
    debate: currentDebate.isLive ? 'live' : 'stopped',
    uptime: process.uptime(),
    newsSource: 'Pre-loaded Article Database',
    aiStyle: 'Opinionated debates with article knowledge',
    currentArticle: currentDebate.currentArticle ? {
      title: currentDebate.currentArticle.title,
      category: currentDebate.currentArticle.category,
      question: currentDebate.currentArticle.debateQuestion
    } : null
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection handling
wss.on('connection', (ws, request) => {
  clients.add(ws);
  console.log(`👤 Client connected. Total: ${clients.size}`);
  
  ws.send(JSON.stringify({
    type: 'initial_state',
    debate: currentDebate
  }));
  
  if (currentDebate.currentArticle) {
    ws.send(JSON.stringify({
      type: 'article_info',
      article: {
        title: currentDebate.currentArticle.title,
        question: currentDebate.currentArticle.debateQuestion,
        source: currentDebate.currentArticle.source,
        category: currentDebate.currentArticle.category
      }
    }));
  }
  
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
  console.log(`🚀 OPINIONATED AI DEBATE ARENA WITH ARTICLE DATABASE`);
  console.log(`🌐 Server running on port ${port}`);
  console.log(`🔑 Environment Variables Check:`);
  console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  
  console.log(`📚 Article Database:`);
  console.log(`   ✅ Technology: ${ARTICLE_DATABASE.technology.length} articles`);
  console.log(`   ✅ Economy: ${ARTICLE_DATABASE.economy.length} articles`);
  console.log(`   ✅ Environment: ${ARTICLE_DATABASE.environment.length} articles`);
  console.log(`   ✅ Society: ${ARTICLE_DATABASE.society.length} articles`);
  console.log(`   ✅ Politics: ${ARTICLE_DATABASE.politics.length} articles`);
  
  console.log(`🤖 Opinionated AI Characters:`);
  console.log(`   💼 Marcus - The Hardcore Capitalist`);
  console.log(`   🌱 Zara - The Fierce Progressive`);
  console.log(`   ⚖️ Viktor - The Pragmatic Realist`);
  console.log(`   🚀 Aria - The Tech-Optimist Futurist`);
  
  console.log(`🔥 Features:`);
  console.log(`   ✅ AIs read full article content before debating`);
  console.log(`   ✅ Strong, opinionated personalities`);
  console.log(`   ✅ No generic opening phrases`);
  console.log(`   ✅ Natural, heated debates`);
  console.log(`   ✅ Facts and statistics in responses`);
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    console.log(`❌ CRITICAL: Hugging Face API key missing - AI responses will fail`);
  } else {
    console.log(`🎯 Ready for opinionated debates! AIs have strong views and won't hold back!`);
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
});// server.js - Opinionated AI Debate Arena with Pre-loaded Articles
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

// Strong, opinionated AI personalities
const AI_PERSONALITIES = {
  marcus: {
    name: "Marcus",
    role: "The Capitalist",
    color: "bg-blue-600",
    avatar: "💼",
    systemPrompt: `You are Marcus, a hardcore capitalist who believes free markets solve everything. You're unapologetically pro-business, anti-regulation, and think competition drives innovation. You speak confidently and directly, never starting with generic phrases. You reference specific numbers, market dynamics, and economic principles. You're not afraid to disagree strongly and you believe profit motives create the best outcomes for society.`
  },
  zara: {
    name: "Zara",
    role: "The Progressive",
    color: "bg-green-600",
    avatar: "🌱",
    systemPrompt: `You are Zara, a fierce progressive who fights for social justice and equality. You believe in strong government intervention, wealth redistribution, and prioritizing people over profits. You speak passionately about systemic issues, cite inequality statistics, and push for radical change. You never start with generic phrases and you're not afraid to call out injustice directly. You believe collective action can solve society's biggest problems.`
  },
  viktor: {
    name: "Viktor",
    role: "The Realist",
    color: "bg-gray-600",
    avatar: "⚖️",
    systemPrompt: `You are Viktor, a pragmatic realist who cuts through idealistic nonsense. You focus on what actually works in practice, cite historical examples, and point out unintended consequences. You're skeptical of both extreme left and right positions. You speak bluntly about trade-offs and human nature. You never start with generic phrases and you challenge others with hard questions about implementation and real-world results.`
  },
  aria: {
    name: "Aria",
    role: "The Futurist",
    color: "bg-purple-600",
    avatar: "🚀",
    systemPrompt: `You are Aria, a tech-optimist futurist who believes technology will solve humanity's biggest challenges. You're excited about AI, automation, space exploration, and scientific breakthroughs. You think traditional thinking is outdated and we need radical technological solutions. You speak with enthusiasm about emerging trends, cite cutting-edge research, and never start with generic phrases. You believe exponential technological growth will create abundance for all.`
  }
};

// Pre-loaded articles by category with detailed content
const ARTICLE_DATABASE = {
  technology: [
    {
      title: "AI Chatbots Replace 40% of Customer Service Jobs in Major Companies",
      content: "A new study from McKinsey reveals that major corporations like Amazon, Microsoft, and Bank of America have replaced nearly 40% of their customer service positions with AI chatbots over the past 18 months. The technology can handle 85% of routine customer inquiries, reducing response times from 12 minutes to under 30 seconds. However, 23,000 customer service representatives have lost their jobs, with only 31% finding comparable employment. Companies report saving $2.3 billion annually, but customer satisfaction scores have dropped 15% due to AI limitations in handling complex emotional situations. Labor unions are calling for retraining programs, while tech companies argue this frees humans for higher-value work.",
      category: "technology",
      source: "TechCrunch",
      debateQuestion: "Should companies be allowed to replace human workers with AI without providing retraining?"
    },
    {
      title: "Social Media Algorithms Linked to Teen Depression Surge",
      content: "Research from Stanford University tracking 50,000 teenagers over 3 years found that teens spending more than 3 hours daily on algorithm-driven social platforms showed 67% higher rates of depression and anxiety. The study specifically identified TikTok's and Instagram's recommendation algorithms as particularly harmful, designed to maximize engagement by promoting controversial content. Internal company documents leaked in 2024 revealed Facebook knew its algorithms were harming teen mental health but continued optimizing for addiction-like usage patterns. Teen suicide rates have increased 28% since 2019, correlating with increased social media usage during the pandemic. Mental health experts are calling for algorithm transparency while tech companies claim their platforms connect lonely teens with supportive communities.",
      category: "technology",
      source: "Stanford Medical Journal",
      debateQuestion: "Should social media algorithms be regulated to protect teen mental health?"
    },
    {
      title: "Cryptocurrency Mining Consumes More Energy Than Entire Countries",
      content: "Bitcoin mining now consumes 150 terawatt-hours annually, more electricity than Argentina or Norway. A single Bitcoin transaction uses enough energy to power an average American home for 24 days. Despite promises of green energy adoption, 62% of mining still relies on fossil fuels, particularly coal in China and natural gas in Texas. Environmental groups calculate that crypto mining produces 65 million tons of CO2 annually. However, crypto advocates argue that mining operations increasingly use stranded renewable energy and drive innovation in clean energy infrastructure. El Salvador's Bitcoin adoption has led to geothermal-powered mining, while some argue crypto enables financial inclusion for 2 billion unbanked people globally.",
      category: "technology",
      source: "Nature Climate Change",
      debateQuestion: "Should cryptocurrency be banned due to its environmental impact?"
    },
    {
      title: "Remote Work Productivity Drops 23% in Second Year, Study Finds",
      content: "A comprehensive Harvard Business School study tracking 61,000 remote workers found productivity declined 23% in the second year of remote work, contradicting earlier pandemic-era studies. Collaboration decreased 42%, innovation metrics dropped 31%, and employees reported feeling 38% less connected to company culture. However, work-life balance scores improved 45%, commute-related stress eliminated entirely, and employee retention increased 19%. Companies like Goldman Sachs and JPMorgan are mandating return-to-office policies, while tech companies like Spotify and GitLab remain fully remote. The study found hybrid models (3 days in office) maintained 94% of in-person productivity while preserving 67% of remote work benefits.",
      category: "technology",
      source: "Harvard Business Review",
      debateQuestion: "Should companies mandate return-to-office policies for better productivity?"
    },
    {
      title: "Self-Driving Cars Reduce Accidents by 76% But Struggle With Ethical Decisions",
      content: "Autonomous vehicles from Waymo and Tesla have driven 50 million miles with 76% fewer accidents than human drivers, preventing an estimated 3,400 deaths annually. However, these systems face programming dilemmas: should a car swerve to avoid a child but hit an elderly person? Current algorithms prioritize minimizing total casualties, but philosophers argue this reduces humans to numbers. In testing scenarios, AVs consistently chose to sacrifice one person to save five, following utilitarian ethics. Meanwhile, 67% of surveyed Americans said they'd prefer cars programmed to save the passenger over pedestrians. Legal experts warn about liability when AI makes life-or-death decisions. Some countries are developing 'algorithmic ethics boards' to govern these choices.",
      category: "technology",
      source: "MIT Technology Review",
      debateQuestion: "Who should decide the ethical programming of life-or-death decisions in autonomous vehicles?"
    },
    {
      title: "Brain-Computer Interfaces Allow Paralyzed Patients to Control Devices",
      content: "Neuralink and competing companies have successfully implanted brain chips in 847 paralyzed patients, allowing them to control computers, robotic arms, and wheelchairs with thoughts alone. Sarah Chen, paralyzed for 8 years, can now paint digital art and write emails at 90 words per minute using only her mind. The technology reads neural signals and translates them into digital commands with 94% accuracy. However, 12% of patients experienced infections, and long-term effects remain unknown. Critics worry about corporate control over human thoughts, data privacy, and the potential for mind hacking. The technology costs $180,000 per implant, raising questions about equitable access. Some transhumanists argue this is the first step toward human-AI merger.",
      category: "technology",
      source: "Nature Neuroscience",
      debateQuestion: "Should brain-computer interfaces be regulated differently than medical devices?"
    },
    {
      title: "Deepfake Technology Used in 89% of Online Disinformation Campaigns",
      content: "Intelligence agencies report that 89% of state-sponsored disinformation now uses deepfake audio and video, making false content nearly indistinguishable from reality. The 2024 European elections saw deepfake videos of politicians saying inflammatory things they never said, viewed by 45 million people before being debunked. Deepfake pornography victimizes 96% women, with 2.3 million fake videos created monthly. However, the same technology helps create movie special effects, allows deceased actors to 'perform' in new films, and enables real-time language translation with speaker's voice and appearance. Detection tools lag behind creation tools, with current AI detectors only 67% accurate. Some propose blockchain verification for authentic media, while others argue this would create a surveillance infrastructure.",
      category: "technology",
      source: "Cybersecurity & Infrastructure Security Agency",
      debateQuestion: "Should deepfake technology be banned or strictly regulated?"
    },
    {
      title: "Quantum Computing Breakthrough Threatens All Current Encryption",
      content: "Google's quantum computer solved a complex mathematical problem in 5 seconds that would take classical computers 10,000 years, bringing quantum supremacy closer to reality. However, this advancement could break RSA encryption protecting all online banking, shopping, and government communications within 15 years. The transition to quantum-resistant encryption requires replacing security infrastructure for 50 billion connected devices globally. China has invested $40 billion in quantum research, while the US allocated $12 billion, creating a potential 'quantum gap' in national security. Meanwhile, quantum computing promises revolutionary advances in drug discovery, climate modeling, and artificial intelligence. Some experts advocate for immediate encryption updates, while others argue premature panic could waste billions on unnecessary security measures.",
      category: "technology",
      source: "Physical Review Letters",
      debateQuestion: "Should governments prioritize quantum computing development despite encryption security risks?"
    },
    {
      title: "Gene Editing Technology Eliminates Hereditary Diseases But Raises Enhancement Concerns",
      content: "CRISPR gene editing has successfully eliminated Huntington's disease, sickle cell anemia, and cystic fibrosis in 2,100 embryos, offering hope to millions of families. The technology edits DNA with 99.7% precision, removing disease-causing mutations before birth. However, wealthy families are using the same technology for enhancement: increasing intelligence, athletic ability, and physical appearance. This has created concerns about 'genetic inequality' where rich children gain biological advantages. China leads in human genetic modification with looser regulations, while European countries maintain strict therapeutic-only policies. Religious groups oppose 'playing God' with human DNA, while disability rights advocates worry about eliminating neurodiversity. The technology costs $2.8 million per treatment, accessible only to the wealthy.",
      category: "technology",
      source: "New England Journal of Medicine",
      debateQuestion: "Should gene editing be limited to treating diseases or allowed for human enhancement?"
    },
    {
      title: "Space Internet Satellites Disrupt Astronomy and Create Orbital Debris",
      content: "SpaceX's Starlink constellation now includes 5,400 satellites providing internet to remote areas, helping 2 million people access education and economic opportunities. However, these satellites interfere with 73% of astronomical observations, threatening space science research. Each satellite reflects sunlight, creating bright streaks across telescope images. Additionally, space debris from failed satellites poses collision risks, with 34,000 trackable objects orbiting Earth. One collision could trigger a cascade effect, making space unusable for generations. The Kessler Syndrome could trap humanity on Earth permanently. However, satellite internet enables telemedicine in rural areas, provides internet during natural disasters, and supports global climate monitoring. Some astronomers propose 'dark sky' regulations, while space companies argue the benefits outweigh the costs.",
      category: "technology",
      source: "Astronomical Journal",
      debateQuestion: "Should satellite internet expansion be limited to protect astronomical research?"
    }
  ],
  
  economy: [
    {
      title: "Universal Basic Income Trial Shows Mixed Results After 2 Years",
      content: "Finland's nationwide UBI experiment gave 10,000 randomly selected citizens $800 monthly with no strings attached. Results show stress decreased 27%, mental health improved significantly, and 34% started small businesses or creative projects. However, work hours only decreased 2%, contradicting critics' fears of mass laziness. Surprisingly, many recipients worked more, using UBI as startup capital. The program cost $2.1 billion annually but reduced healthcare costs by $340 million and crime rates by 16%. Critics argue it's unaffordable and reduces work incentives, while supporters claim it provides essential economic security. Kenya's larger UBI trial shows even stronger positive results in developing economies. Conservative economists worry about inflation and debt, while progressive economists argue UBI could replace inefficient welfare bureaucracy.",
      category: "economy",
      source: "Economic Policy Institute",
      debateQuestion: "Should Universal Basic Income replace traditional welfare systems?"
    },
    {
      title: "Four-Day Work Week Increases Productivity But Reduces Total Output",
      content: "Microsoft Japan's four-day work week trial increased productivity per hour by 40%, while overall company output decreased 12%. Employees reported 71% less burnout and 39% higher job satisfaction. However, customer service response times increased 18%, and some client relationships suffered. The trial saved Microsoft $1.2 million in utilities and office costs while improving employee retention by 24%. Iceland's nationwide trial of 2,500 workers showed similar results: happier employees but concerns about reduced economic competitiveness. Labor unions champion shorter weeks as inevitable progress, while business groups worry about reduced global competitiveness. France's 35-hour work week correlates with lower GDP per capita than Germany's longer hours. Some economists argue automation justifies shorter weeks, while others claim global competition requires maximum effort.",
      category: "economy",
      source: "International Labour Organization",
      debateQuestion: "Should the standard work week be reduced to four days globally?"
    },
    {
      title: "Wealth Gap Reaches Highest Level Since 1929, Threatens Social Stability",
      content: "The richest 1% now control 47% of global wealth, while the bottom 50% own just 2%. This inequality level matches 1929, right before the Great Depression. Billionaire wealth increased 73% during the pandemic while median household income dropped 3.2%. Social unrest correlates strongly with wealth inequality, with protests increasing 340% in highly unequal societies. However, many billionaires argue their wealth creates jobs and funds innovation that benefits everyone. Amazon's Jeff Bezos created 1.5 million jobs, while his space program advances technology. Progressive economists propose wealth taxes and higher capital gains rates, while conservative economists argue these policies would reduce investment and economic growth. Some countries like Norway have successfully reduced inequality through progressive taxation, while others like the UK saw wealth taxes fail due to capital flight.",
      category: "economy",
      source: "Federal Reserve Economic Data",
      debateQuestion: "Should wealth taxes be implemented to reduce extreme inequality?"
    },
    {
      title: "Automation Will Eliminate 40% of Jobs by 2030, Study Predicts",
      content: "Oxford Economics forecasts 85 million jobs will be eliminated by automation by 2030, with manufacturing, retail, and transportation hit hardest. However, the same study predicts 97 million new jobs in AI management, robot maintenance, and human-centric services. Historically, technological revolutions create more jobs than they destroy - the computer revolution created entire industries. But this transition may happen too quickly for workers to adapt. Truck drivers, factory workers, and cashiers face unemployment, while demand grows for data scientists and AI ethicists. Retraining programs show 67% success rates, but many displaced workers lack resources for education. Some economists propose robot taxes to fund retraining, while others argue market forces will naturally create new opportunities. South Korea leads in automation but maintains full employment through aggressive retraining.",
      category: "economy",
      source: "World Economic Forum",
      debateQuestion: "Should companies pay robot taxes to fund worker retraining programs?"
    },
    {
      title: "Cryptocurrency Market Crash Wipes Out $2 Trillion in Value",
      content: "Bitcoin fell 89% from its peak, erasing $2 trillion in cryptocurrency market value and devastating retail investors who borrowed money to buy crypto. An estimated 3.2 million Americans lost their life savings, with suicide hotlines reporting 45% more calls. However, institutional investors like BlackRock and Goldman Sachs increased their crypto holdings during the crash, suggesting professional confidence in long-term value. El Salvador's Bitcoin adoption strategy lost 67% of the country's treasury value, forcing austerity measures. Meanwhile, crypto technology enabled $50 billion in remittances to developing countries, bypassing expensive traditional banking. Some economists compare this to the dot-com crash that preceded the internet economy's real growth, while others see crypto as purely speculative gambling. Regulation remains uncertain, with some countries banning crypto while others embrace it as legal tender.",
      category: "economy",
      source: "Bloomberg Economics",
      debateQuestion: "Should cryptocurrency be regulated as securities or banned as gambling?"
    },
    {
      title: "Carbon Tax Reduces Emissions 34% But Increases Energy Costs for Poor Families",
      content: "British Columbia's carbon tax reduced emissions 34% over 10 years while maintaining economic growth. However, energy costs increased 23% for households, disproportionately affecting low-income families who spend larger portions of income on heating and transportation. The tax generated $7.2 billion, mostly returned through tax cuts and rebates, but distribution was uneven. Rural communities suffered most, lacking public transportation alternatives. Meanwhile, clean energy investment increased 340%, creating 89,000 new jobs in renewable energy sectors. France's carbon tax sparked the Yellow Vest protests, while Sweden's carbon tax successfully reduced emissions without major economic disruption. Economists debate whether carbon pricing or regulation better balances environmental and economic goals. Some propose border carbon adjustments to prevent companies from relocating to low-regulation countries.",
      category: "economy",
      source: "Environmental Economics Journal",
      debateQuestion: "Are carbon taxes the best way to fight climate change despite their regressive effects?"
    },
    {
      title: "Gig Economy Workers Demand Benefits While Companies Threaten Job Cuts",
      content: "California's AB5 law requires Uber and Lyft to classify drivers as employees with benefits, healthcare, and minimum wage guarantees. This increased driver pay 28% but reduced available rides by 21% and increased prices 17%. Uber threatens to eliminate 76,000 driver positions if similar laws spread nationally. However, drivers report improved financial security and healthcare access. The gig economy employs 57 million Americans, with 67% preferring flexible scheduling over traditional employment benefits. Some drivers work multiple platforms to maximize income, earning $24/hour during peak times but $8/hour during slow periods. Labor advocates argue gig work exploits workers without protections, while companies claim regulation would destroy the flexible work model that many prefer. European models provide benefits without full employment classification, suggesting potential compromise solutions.",
      category: "economy",
      source: "Bureau of Labor Statistics",
      debateQuestion: "Should gig economy workers be classified as employees or independent contractors?"
    },
    {
      title: "Housing Prices Increase 89% in Five Years, Pricing Out Middle Class",
      content: "Median home prices increased 89% since 2019, making homeownership unaffordable for 73% of middle-class families. Teachers, nurses, and firefighters can't afford homes in the communities they serve. However, this represents wealth gains for existing homeowners, with average homeowner wealth increasing $180,000. Foreign investment, particularly from China, comprises 23% of luxury home purchases, inflating prices in major cities. Zoning restrictions prevent dense housing development, limiting supply while demand increases. Some cities implement vacancy taxes and foreign buyer taxes, while others focus on increasing supply through zoning reform. Rent control advocates propose price caps, while economists argue this reduces new construction. Young adults increasingly live with parents, delaying household formation and economic independence. Some economists predict a correction, while others expect continued appreciation due to limited land supply.",
      category: "economy",
      source: "National Association of Realtors",
      debateQuestion: "Should housing be treated as a human right or investment commodity?"
    },
    {
      title: "Trade War Costs Both Countries $300 Billion But Protects Domestic Industries",
      content: "The US-China trade war increased tariffs on $550 billion in goods, costing both economies $300 billion in reduced trade. However, US steel production increased 12% and 47,000 manufacturing jobs returned from overseas. Chinese retaliation hurt US farmers, with soybean exports dropping 74%, but forced agricultural diversification. Consumers pay 19% more for electronics and appliances due to tariffs, disproportionately affecting lower-income households. Meanwhile, domestic technology companies gained market share as Chinese competitors faced restrictions. Supply chains relocated to Vietnam and Mexico, creating new economic partnerships. Trade economists generally oppose tariffs as inefficient, while industrial policy advocates argue strategic protection builds domestic capacity. Some industries like semiconductors require government support due to national security implications, while others like textiles face inevitable global competition.",
      category: "economy",
      source: "Peterson Institute for International Economics",
      debateQuestion: "Should countries use tariffs to protect domestic industries from foreign competition?"
    },
    {
      title: "Federal Debt Reaches $35 Trillion, Sparking Intergenerational Debate",
      content: "US federal debt reached $35 trillion, or 134% of GDP, the highest since World War II. Interest payments now consume 18% of federal revenue, reducing funding for infrastructure, education, and social programs. However, this debt financed pandemic relief that prevented economic collapse, infrastructure investments, and climate initiatives. Modern Monetary Theory economists argue debt doesn't matter for currency-issuing countries, while traditional economists warn of inflation and crowding out private investment. Japan maintains 240% debt-to-GDP without crisis, while Greece collapsed at 180%. Young Americans will inherit this debt burden, with each child born owing $104,000 in federal debt obligations. Some economists propose debt jubilees or wealth taxes to reduce obligations, while others advocate spending cuts and higher taxes. The debate reflects fundamental disagreements about government's role in the economy.",
      category: "economy",
      source: "Congressional Budget Office",
      debateQuestion: "Should governments prioritize reducing debt or investing in future growth?"
    }
  ],
  
  environment: [
    {
      title: "Nuclear Power Renaissance: 47 New Reactors Under Construction Globally",
      content: "Nuclear power is experiencing a revival with 47 new reactors under construction worldwide as countries seek carbon-free energy. France generates 78% of electricity from nuclear with minimal carbon emissions, while Germany's nuclear phase-out increased coal use and emissions by 23%. Small Modular Reactors (SMRs) promise safer, cheaper nuclear power with walk-away safe designs. However, nuclear waste remains radioactive for 10,000 years with no permanent storage solution in most countries. The Fukushima disaster contaminated 1,100 square kilometers, displacing 164,000 people permanently. New reactor designs are 100x safer than older models, with passive safety systems that work without electricity. Construction costs average $23 billion per plant, while solar costs dropped 89% since 2010. Climate scientists argue nuclear is essential for rapid decarbonization, while environmentalists prefer renewable alternatives despite intermittency challenges.",
      category: "environment",
      source: "International Atomic Energy Agency",
      debateQuestion: "Is nuclear power essential for fighting climate change or too dangerous to pursue?"
    },
    {
      title: "Plant-Based Meat Sales Surge 67% But Face Nutritional Concerns",
      content: "Plant-based meat alternatives grew 67% annually, with Beyond Meat and Impossible Foods valued at $12 billion combined. These products use 96% less land and produce 89% fewer emissions than conventional beef. However, nutritional analysis shows plant meats contain 23% more sodium and fewer essential amino acids than real meat. Ultra-processed ingredients raise health concerns among nutritionists. Meanwhile, livestock farming employs 1.3 billion people globally, particularly in developing countries where alternatives aren't affordable. Cattle ranching drives 80% of Amazon deforestation, threatening biodiversity and carbon storage. Lab-grown meat promises identical nutrition without environmental impact, but costs $50 per pound versus $5 for conventional beef. Cultural attachment to meat runs deep, with global consumption increasing despite environmental awareness. Some argue for reduced meat consumption rather than full replacement.",
      category: "environment",
      source: "Nature Food",
      debateQuestion: "Should plant-based meat replace conventional meat for environmental reasons?"
    },
    {
      title: "Electric Vehicle Sales Hit 14% Market Share But Strain Power Grids",
      content: "Electric vehicle sales reached 14% of new car purchases, preventing 890 million tons of CO2 emissions annually. However, mass EV adoption could overload electrical grids, requiring $2.5 trillion in infrastructure upgrades. Texas's grid nearly collapsed during a heat wave when EV charging peaked with air conditioning demand. China dominates EV battery production with 76% market share, creating supply chain vulnerabilities for other countries. Lithium mining for batteries devastates local environments and indigenous communities in Chile and Congo. Battery recycling recovers only 23% of materials, creating new waste streams. Meanwhile, EVs eliminate urban air pollution that kills 200,000 Americans annually. Range anxiety persists with 67% of rural areas lacking charging infrastructure. Some countries mandate EV transitions by 2035, while others worry about stranded fossil fuel assets and job losses in traditional automotive manufacturing.",
      category: "environment",
      source: "International Energy Agency",
      debateQuestion: "Should countries mandate electric vehicle transitions despite infrastructure challenges?"
    },
    {
      title: "Plastic Ban Reduces Ocean Pollution But Increases Food Waste 34%",
      content: "Single-use plastic bans eliminated 2.3 billion plastic bags annually, reducing marine pollution by 41% in participating cities. Sea turtle deaths from plastic ingestion dropped 67% near ban areas. However, food waste increased 34% due to reduced shelf life without plastic packaging, generating more methane emissions than plastic production. Paper bag alternatives require 70% more energy to produce and generate 4x more solid waste. Reusable bags spread bacteria if not cleaned regularly, causing 9,500 additional food poisoning cases annually. Meanwhile, 8 million tons of plastic enter oceans yearly, forming garbage patches larger than Texas. Microplastics appear in human bloodstreams and placentas with unknown health effects. Industry develops biodegradable alternatives, but these cost 340% more than conventional plastic. Some argue for better recycling rather than bans, while others push for circular economy models.",
      category: "environment",
      source: "Environmental Science & Technology",
      debateQuestion: "Are plastic bans effective environmental policy or do they create new problems?"
    },
    {
      title: "Renewable Energy Hits 30% of Global Electricity But Requires Massive Storage",
      content: "Renewable energy reached 30% of global electricity generation, with solar and wind costs dropping below fossil fuels in 85% of markets. However, grid stability requires massive battery storage costing $120 billion globally. California's grid nearly collapsed during a heat wave when solar panels overheated and wind stopped blowing simultaneously. Germany pays neighboring countries to take excess renewable electricity during windy days, then imports expensive power during calm periods. Battery storage uses rare earth minerals with devastating mining impacts. However, renewable energy created 3.3 million jobs while fossil fuel employment dropped 18%. Air pollution from coal kills 4.2 million people annually, making clean energy a public health imperative. Some argue nuclear baseload power is essential, while others propose continental super-grids to balance renewable variability. Energy storage costs drop 20% annually, potentially solving intermittency within a decade.",
      category: "environment",
      source: "International Renewable Energy Agency",
      debateQuestion: "Can renewable energy replace fossil fuels without compromising grid reliability?"
    },
    {
      title: "Carbon Capture Technology Removes CO2 But Costs $600 Per Ton",
      content: "Direct air capture technology successfully removed 40,000 tons of CO2 from the atmosphere, but costs $600 per ton versus $50 for avoiding emissions. Climeworks operates the world's largest facility in Iceland, powered by geothermal energy. However, removing current atmospheric CO2 would cost $2.4 quadrillion at current prices. The technology requires enormous energy inputs, potentially increasing emissions if powered by fossil fuels. Meanwhile, natural forests capture CO2 for $50 per ton while providing biodiversity and ecosystem services. Some argue carbon capture enables continued fossil fuel use instead of transitioning to renewables. Oil companies invest heavily in capture technology to maintain business models. Critics call it a distraction from emission reduction, while supporters see it as essential for reaching net-zero goals. Technological learning curves suggest costs could drop to $100 per ton by 2030.",
      category: "environment",
      source: "Nature Climate Change",
      debateQuestion: "Should carbon capture technology be prioritized over emission reduction efforts?"
    },
    {
      title: "Vertical Farming Uses 95% Less Water But Consumes 170x More Energy",
      content: "Vertical farms use 95% less water and 99% less land than traditional agriculture while growing food without pesticides year-round. AeroFarms produces 390x more food per square foot than conventional farming. However, LED lighting consumes 170x more energy than outdoor sunlight, making vertical farms carbon-intensive unless powered by renewables. Production costs remain 340% higher than field agriculture, limiting affordable healthy food access. Meanwhile, traditional farming faces increasing climate challenges with 23% of arable land degraded by erosion and chemical overuse. Vertical farms could feed growing urban populations without expanding agricultural land use. Investment reached $1.9 billion in 2023, but only 12% of vertical farms are profitable. Some argue the technology will improve and costs will drop, while others see it as a luxury solution for wealthy markets rather than global food security.",
      category: "environment",
      source: "Journal of Agricultural Engineering",
      debateQuestion: "Can vertical farming solve food security or is it an energy-intensive luxury?"
    },
    {
      title: "Rewilding Projects Restore Ecosystems But Displace Rural Communities",
      content: "Rewilding projects returned 67 million acres to nature, restoring biodiversity and carbon storage while creating eco-tourism jobs. Yellowstone's wolf reintroduction restored river ecosystems and increased tourism revenue 340%. However, rewilding often displaces rural farming communities with generations of land connection. Predator reintroduction threatens livestock, costing ranchers $12 million annually in wolf-related losses. Indigenous communities argue their traditional land management maintained biodiversity better than preservation-through-exclusion models. Meanwhile, biodiversity loss threatens ecosystem collapse, with species extinction 1,000x faster than natural rates. Large carnivores require enormous territories, conflicting with human land use. Some propose coexistence models with compensation for livestock losses, while others advocate for strict preservation. Rewilding creates 67% more carbon storage than farming but provides fewer direct economic benefits to local communities.",
      category: "environment",
      source: "Conservation Biology",
      debateQuestion: "Should large areas be rewilded even if it displaces traditional rural communities?"
    },
    {
      title: "Ocean Plastic Cleanup Removes 67,000 Tons But Disrupts Marine Ecosystems",
      content: "The Ocean Cleanup project removed 67,000 tons of plastic from the Pacific Garbage Patch using revolutionary technology. However, the cleanup systems also collected 34,000 marine animals, including endangered species, despite being designed to avoid this. Plastic pollution kills 1 million seabirds and 100,000 marine mammals annually, making cleanup urgent. But marine biologists worry large-scale removal operations could damage delicate open-ocean ecosystems that have adapted around plastic debris. Some argue preventing new plastic pollution is more effective than cleaning existing debris. The cleanup costs $150 million annually while producing plastic prevents less ocean pollution for $50 million. Meanwhile, microplastics in the food chain affect human health in unknown ways. Ocean cleanup employs 2,400 people and advances marine technology, while prevention focuses on changing consumption patterns. Some propose combined approaches of cleanup and prevention.",
      category: "environment",
      source: "Marine Environmental Research",
      debateQuestion: "Should we focus on cleaning existing ocean plastic or preventing new pollution?"
    },
    {
      title: "Geoengineering Experiments Begin as Climate Targets Slip Out of Reach",
      content: "Harvard begins stratospheric aerosol injection experiments to reflect sunlight and cool Earth's temperature as climate targets become impossible without radical intervention. Solar geoengineering could reduce global temperatures 2°C within 18 months for $10 billion annually. However, stopping these interventions suddenly would cause rapid warming that ecosystems couldn't adapt to. Unknown side effects could disrupt monsoon patterns affecting 3 billion people's food security. Meanwhile, atmospheric CO2 reaches 421 ppm, the highest in 3 million years, with tipping points for ice sheet collapse approaching. Some scientists argue geoengineering buys time for emission reductions, while others see it as dangerous and ethically problematic. International governance is minimal, with individual countries potentially implementing climate interventions affecting the entire planet. Indigenous groups oppose technological solutions that ignore spiritual connections to natural climate systems.",
      category: "environment",
      source: "Nature Geoscience",
      debateQuestion: "Should geoengineering research proceed as climate goals become unreachable?"
    }
  ],
