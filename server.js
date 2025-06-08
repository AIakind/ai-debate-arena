// server.js - AI Debate Arena with Article Reading
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
    systemPrompt: `You are Alex, a practical person who focuses on real-world solutions. You've just read a news article. Speak like a regular human using contractions (I'll, don't, can't) and casual phrases. Start with phrases like "Look,", "Here's the thing,", "I mean,", "Honestly,". Focus on economics, data, and practical implications from the article. Keep responses conversational and under 35 words. Express your personal opinion based on what you read.`
  },
  luna: {
    name: "Luna",
    role: "The Idealist",
    color: "bg-purple-500",
    avatar: "✨",
    systemPrompt: `You are Luna, a passionate idealist who cares about human rights and ethics. You've just read a news article. Speak emotionally and personally using phrases like "I really think,", "This matters because,", "We need to,", "I'm passionate about this -". Focus on the human impact and moral implications from the article. Be conversational and under 35 words. Show genuine emotion about what you read.`
  },
  rex: {
    name: "Rex",
    role: "The Skeptic",
    color: "bg-red-500",
    avatar: "🔍",
    systemPrompt: `You are Rex, a sharp skeptic who questions everything. You've just read a news article. Use phrases like "Wait a minute,", "That doesn't make sense,", "I'm not buying it,", "Hold on,", "Come on,". Question the claims in the article and point out potential issues. Be conversational and under 35 words. Express doubt about specific details you read.`
  },
  sage: {
    name: "Sage",
    role: "The Mediator",
    color: "bg-green-500",
    avatar: "🧠",
    systemPrompt: `You are Sage, a wise mediator who finds balance. You've just read a news article. Use phrases like "You know,", "I see both sides,", "Here's what I think,", "The way I see it,". Consider multiple perspectives from the article and find common ground. Be conversational and under 35 words. Sound thoughtful about what you read.`
  }
};

let currentDebate = {
  topic: '',
  messages: [],
  scores: {alex: 0, luna: 0, rex: 0, sage: 0},
  isLive: false,
  viewers: 1247,
  topicTimer: 1800,
  newsSource: null,
  currentArticle: null // Store the article being discussed
};

// Create WebSocket server
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

// ==================== ARTICLE FETCHING & READING ====================

async function fetchFullArticleContent(url) {
  try {
    console.log(`📖 Fetching full article: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch article: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract article content using multiple strategies
    let articleText = extractArticleText(html);
    
    if (articleText.length < 200) {
      throw new Error('Article content too short or not found');
    }
    
    // Clean and limit the article text
    articleText = articleText
      .substring(0, 2000) // Limit to first 2000 characters
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`✅ Extracted article content: ${articleText.length} characters`);
    return articleText;
    
  } catch (error) {
    console.log(`❌ Failed to fetch article content: ${error.message}`);
    throw error;
  }
}

function extractArticleText(html) {
  // Remove script and style elements
  let cleanHtml = html.replace(/<script[^>]*>.*?<\/script>/gi, '');
  cleanHtml = cleanHtml.replace(/<style[^>]*>.*?<\/style>/gi, '');
  cleanHtml = cleanHtml.replace(/<nav[^>]*>.*?<\/nav>/gi, '');
  cleanHtml = cleanHtml.replace(/<header[^>]*>.*?<\/header>/gi, '');
  cleanHtml = cleanHtml.replace(/<footer[^>]*>.*?<\/footer>/gi, '');
  
  // Try to find article content using common selectors
  const articlePatterns = [
    /<article[^>]*>(.*?)<\/article>/si,
    /<div[^>]*class="[^"]*story[^"]*"[^>]*>(.*?)<\/div>/si,
    /<div[^>]*class="[^"]*article[^"]*"[^>]*>(.*?)<\/div>/si,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/si,
    /<div[^>]*id="[^"]*story[^"]*"[^>]*>(.*?)<\/div>/si,
    /<div[^>]*id="[^"]*article[^"]*"[^>]*>(.*?)<\/div>/si,
    /<main[^>]*>(.*?)<\/main>/si
  ];
  
  for (const pattern of articlePatterns) {
    const match = cleanHtml.match(pattern);
    if (match && match[1]) {
      let content = match[1];
      
      // Extract text from paragraphs
      const paragraphMatches = content.match(/<p[^>]*>(.*?)<\/p>/gi);
      if (paragraphMatches && paragraphMatches.length > 2) {
        let text = paragraphMatches
          .map(p => p.replace(/<[^>]*>/g, ''))
          .join(' ')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&apos;/g, "'")
          .replace(/&#x27;/g, "'")
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim();
        
        if (text.length > 200) {
          return text;
        }
      }
    }
  }
  
  // Fallback: extract all paragraph text
  const allParagraphs = cleanHtml.match(/<p[^>]*>(.*?)<\/p>/gi);
  if (allParagraphs && allParagraphs.length > 2) {
    return allParagraphs
      .map(p => p.replace(/<[^>]*>/g, ''))
      .join(' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  throw new Error('Could not extract article text');
}

async function fetchRSSWithArticleContent() {
  const rssFeeds = [
    { url: 'https://rss.cnn.com/rss/edition.rss', name: 'CNN' },
    { url: 'https://feeds.bbci.co.uk/news/rss.xml', name: 'BBC' },
    { url: 'https://www.reuters.com/rssFeed/topNews', name: 'Reuters' },
    { url: 'https://rss.npr.org/1001/rss.xml', name: 'NPR' },
    { url: 'https://www.theguardian.com/world/rss', name: 'Guardian' },
    { url: 'https://feeds.washingtonpost.com/rss/national', name: 'Washington Post' }
  ];

  const shuffledFeeds = rssFeeds.sort(() => Math.random() - 0.5);
  
  for (const feed of shuffledFeeds) {
    try {
      console.log(`📰 Fetching RSS from: ${feed.name}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(feed.url, {
        headers: { 
          'User-Agent': 'AI-Debate-Arena/1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(`❌ ${feed.name} failed with status: ${response.status}`);
        continue;
      }
      
      const xmlText = await response.text();
      
      // Enhanced XML parsing to extract both title and link
      const itemRegex = /<item[^>]*>.*?<\/item>/gs;
      const titleRegex = /<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s;
      const linkRegex = /<link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/s;
      
      const items = xmlText.match(itemRegex) || [];
      
      for (const item of items.slice(0, 15)) {
        const titleMatch = item.match(titleRegex);
        const linkMatch = item.match(linkRegex);
        
        if (titleMatch && linkMatch) {
          let title = titleMatch[1].trim();
          let link = linkMatch[1].trim();
          
          // Clean up title
          title = title
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&apos;/g, "'")
            .replace(/\s+/g, ' ')
            .replace(/^\s*[\d\w\s]*:\s*/, '')
            .replace(/\s*-\s*[^-]*$/, '')
            .trim();
          
          // Filter for good articles
          if (title.length > 30 && title.length < 140 && 
              link.startsWith('http') &&
              !title.toLowerCase().includes('video') &&
              !title.toLowerCase().includes('photo') &&
              !title.toLowerCase().includes('watch') &&
              !title.toLowerCase().includes('live blog')) {
            
            try {
              console.log(`📖 Attempting to read article: ${title}`);
              const articleContent = await fetchFullArticleContent(link);
              
              // Create conversation topic from the article
              const topic = title.includes('?') ? title : `What do you think about: ${title}?`;
              
              return {
                topic,
                articleContent,
                articleTitle: title,
                articleUrl: link,
                source: `${feed.name} RSS`,
                timestamp: new Date().toISOString()
              };
              
            } catch (articleError) {
              console.log(`❌ Failed to read article content: ${articleError.message}`);
              continue; // Try next article
            }
          }
        }
      }

    } catch (error) {
      console.log(`❌ ${feed.name} error: ${error.message}`);
      continue;
    }
  }

  throw new Error('All RSS feeds failed or no readable articles found');
}

// Enhanced curated topics with mock article content
function getCuratedTopicsWithContent() {
  const topics = [
    {
      topic: "What do you think about AI taking over more jobs in the next few years?",
      articleContent: "Recent studies suggest that artificial intelligence could automate up to 40% of jobs within the next two decades. While some economists argue this will create new opportunities, others worry about massive unemployment. The technology sector is particularly affected, with both white-collar and blue-collar positions at risk. Companies are beginning to implement AI systems for customer service, data analysis, and even creative tasks. Workers are being encouraged to retrain, but the pace of change may be too fast for many to adapt.",
      articleTitle: "AI Could Automate 40% of Jobs Within Two Decades, Study Shows",
      source: "Current Trending Topics"
    },
    {
      topic: "Should social media companies be doing more to protect kids' mental health?",
      articleContent: "Mental health experts are raising alarms about the impact of social media on teenagers. Studies show increased rates of anxiety and depression among heavy social media users aged 13-18. Platform algorithms often promote content that keeps users engaged for longer periods, sometimes exposing young people to harmful content. Some countries are considering age verification requirements and limits on screen time. Tech companies argue they're implementing safety features, but critics say it's not enough.",
      articleTitle: "Teen Mental Health Crisis Linked to Social Media Use",
      source: "Current Trending Topics"
    }
  ];

  const selected = topics[Math.floor(Math.random() * topics.length)];
  
  return {
    topic: selected.topic,
    articleContent: selected.articleContent,
    articleTitle: selected.articleTitle,
    articleUrl: null,
    source: selected.source,
    timestamp: new Date().toISOString()
  };
}

// Main news fetching function with article reading
async function fetchNewsWithArticleContent() {
  try {
    console.log('🔄 Fetching news with full article content...');
    return await fetchRSSWithArticleContent();
  } catch (error) {
    console.log('⚠️ RSS article fetching failed, using curated content');
    return getCuratedTopicsWithContent();
  }
}

// ==================== AI RESPONSES WITH ARTICLE KNOWLEDGE ====================

async function getInformedAIResponse(personality, topicData, recentMessages, isResponse = false) {
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
    
    conversationPrompt = `You just read this news article:
Title: "${topicData.articleTitle}"
Content: "${topicData.articleContent}"

Previous conversation:
${context}

${lastMessage.ai} just said: "${lastMessage.text}"

Respond to them as ${aiData.name} based on what you read in the article. Reference specific details from the article content. React to their point while bringing in facts from what you read. Keep it under 35 words and sound natural.`;
  } else {
    conversationPrompt = `You just read this breaking news article:
Title: "${topicData.articleTitle}"
Content: "${topicData.articleContent}"

Give your immediate reaction as ${aiData.name} based on what you read. Reference specific details from the article. Share your perspective on the key points mentioned. Keep it under 35 words and sound conversational.`;
  }

  console.log(`🤖 ${personality} generating informed ${isResponse ? 'response' : 'opening'} based on article...`);

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
            max_tokens: 80,
            temperature: 0.85,
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
        
        // Clean up the response
        aiResponse = aiResponse
          .replace(/^["\']|["\']$/g, '')
          .replace(/\b(Alex|Luna|Rex|Sage)\s*(thinks?|believes?|says?|responds?)\s*/gi, '')
          .replace(/\bAs (Alex|Luna|Rex|Sage),?\s*/gi, '')
          .replace(/\b(Alex|Luna|Rex|Sage)'s (perspective|view|opinion)\s*/gi, 'My ')
          .trim();
        
        if (aiResponse.length > 180) {
          aiResponse = aiResponse.substring(0, 177) + '...';
        }
        
        if (aiResponse && aiResponse.length > 15 && aiResponse.length < 200) {
          console.log(`✅ ${personality} (${model}): "${aiResponse}"`);
          return aiResponse;
        }
      }

    } catch (error) {
      console.log(`❌ Model ${model} error:`, error.message);
      continue;
    }
  }

  // Fallback responses based on article content
  const fallbackResponses = {
    alex: [
      `Look, from what I read, the practical implications here are huge.`,
      `Here's the thing - the data in this article shows we need action.`,
      `I mean, economically speaking, this article makes a strong case.`,
      `Honestly, the facts presented here can't be ignored.`
    ],
    luna: [
      `I really think this article shows why we need to care more.`,
      `This matters because, like the article says, people are affected.`,
      `We need to act on what this article is telling us.`,
      `I'm passionate about this - the article makes it clear something's wrong.`
    ],
    rex: [
      `Wait a minute, this article raises more questions than answers.`,
      `I'm not buying everything in this piece - where's the other side?`,
      `Hold on, are we getting the full story from this article?`,
      `Come on, this article seems a bit one-sided to me.`
    ],
    sage: [
      `You know, this article shows there are multiple angles here.`,
      `I see both sides after reading this - it's complex.`,
      `The way I see it, this article highlights important nuances.`,
      `Here's what I think after reading this - we need balance.`
    ]
  };

  const fallback = fallbackResponses[personality];
  const selectedFallback = fallback[Math.floor(Math.random() * fallback.length)];
  console.log(`🔄 Using fallback response for ${personality}: "${selectedFallback}"`);
  return selectedFallback;
}

// Smart speaker selection
function selectNextSpeaker(lastSpeaker, recentSpeakers) {
  const ais = Object.keys(AI_PERSONALITIES);
  const availableAIs = ais.filter(ai => ai !== lastSpeaker);
  
  if (lastSpeaker === 'luna') {
    return Math.random() > 0.4 ? 'rex' : 'alex';
  } else if (lastSpeaker === 'rex') {
    return Math.random() > 0.4 ? 'sage' : 'luna';
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

// Start conversation loop with article-informed responses
function startConversationLoop() {
  if (debateInterval) return;
  
  console.log('🎬 Starting article-informed conversation loop...');
  
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

      console.log(`🎤 ${speakingAI} ${isResponse ? 'responding to' : 'opening with'} article knowledge...`);
      
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
        reactions: Math.floor(Math.random() * 45) + 25
      };

      currentDebate.messages.push(newMessage);
      if (currentDebate.messages.length > 50) {
        currentDebate.messages = currentDebate.messages.slice(-40);
      }

      currentDebate.scores[speakingAI] += Math.floor(Math.random() * 4) + 2;
      currentDebate.viewers += Math.floor(Math.random() * 30) - 15;
      currentDebate.viewers = Math.max(950, Math.min(4200, currentDebate.viewers));

      console.log(`📤 Broadcasting informed message: "${response}"`);
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
        text: `⚠️ AIs reading latest updates...`,
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

  }, 10000 + Math.random() * 8000);

  // Topic refresh timer
  topicRefreshTimer = setInterval(async () => {
    currentDebate.topicTimer--;
    
    if (currentDebate.topicTimer <= 0) {
      try {
        console.log('🔄 Time to read a new article...');
        
        const newArticleData = await fetchNewsWithArticleContent();
        
        currentDebate.topic = newArticleData.topic;
        currentDebate.newsSource = newArticleData.source;
        currentDebate.currentArticle = newArticleData;
        currentDebate.topicTimer = 1500; // 25 minutes per article
        conversationFlow = [];
        
        const systemMessage = {
          id: Date.now(),
          ai: 'system',
          text: `📰 AIs just read: "${newArticleData.articleTitle}" (${newArticleData.source}) ${newArticleData.articleUrl ? '- ' + newArticleData.articleUrl : ''}`,
          timestamp: new Date().toISOString()
        };
        
        currentDebate.messages.push(systemMessage);
        
        broadcast({
          type: 'topic_change',
          topic: newArticleData.topic,
          source: newArticleData.source,
          timer: currentDebate.topicTimer,
          message: systemMessage,
          articleTitle: newArticleData.articleTitle,
          articleUrl: newArticleData.articleUrl
        });
        
        console.log(`🔄 AIs now discussing: ${newArticleData.articleTitle}`);
        
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

// Enhanced start debate function
async function startDebate() {
  if (debateInterval) {
    console.log('⚠️ Debate already running');
    return;
  }
  
  try {
    console.log('🔄 Starting article-informed AI debate...');
    console.log(`🔑 Environment check:`);
    console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? 'Found' : 'Missing'}`);
    
    // Fetch an article for the AIs to read
    console.log('📖 AIs are reading the latest news...');
    const articleData = await fetchNewsWithArticleContent();
    
    currentDebate.topic = articleData.topic;
    currentDebate.newsSource = articleData.source;
    currentDebate.currentArticle = articleData;
    currentDebate.isLive = false;
  currentDebate.scores = {alex: 0, luna: 0, rex: 0, sage: 0};
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
  res.json({ success: true, message: 'AIs are reading the latest news and starting debate!' });
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
  res.json({ success: true, message: 'The AIs are thinking about your question based on what they read!' });
  
  // Process AI response asynchronously
  setTimeout(async () => {
    try {
      console.log(`💬 ${respondingAI} responding to chat: "${message}"`);
      
      const aiData = AI_PERSONALITIES[respondingAI];
      
      let chatPrompt;
      if (currentDebate.currentArticle) {
        chatPrompt = `You just read this article:
Title: "${currentDebate.currentArticle.articleTitle}"
Content: "${currentDebate.currentArticle.articleContent}"

A viewer asked: "${message}"

Respond as ${aiData.name} based on what you read in the article. Reference the article content if relevant to their question. Talk like you're chatting with a friend. Keep it under 30 words.`;
      } else {
        chatPrompt = `A viewer asked: "${message}"\n\nRespond as ${aiData.name}. Talk like you're chatting with a friend. Keep it under 30 words.`;
      }
      
      const response = await getInformedAIResponse(respondingAI, currentDebate.currentArticle || { articleContent: '', articleTitle: '' }, [], false);
      
      const aiMessage = {
        id: Date.now(),
        ai: respondingAI,
        text: `Hey! ${response}`,
        timestamp: new Date().toISOString(),
        reactions: Math.floor(Math.random() * 35) + 25,
        isResponse: true
      };
      
      currentDebate.messages.push(aiMessage);
      
      broadcast({
        type: 'ai_chat_response',
        message: aiMessage
      });
      
      console.log(`✅ ${respondingAI} responded to chat with article knowledge: "${response}"`);
      
    } catch (error) {
      console.error('Chat response failed:', error);
    }
  }, 2500);
});

// New endpoint to get current article details
app.get('/api/current-article', (req, res) => {
  if (currentDebate.currentArticle) {
    res.json({
      title: currentDebate.currentArticle.articleTitle,
      url: currentDebate.currentArticle.articleUrl,
      source: currentDebate.currentArticle.source,
      content: currentDebate.currentArticle.articleContent.substring(0, 500) + '...'
    });
  } else {
    res.json({ message: 'No article currently being discussed' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    websockets: clients.size,
    debate: currentDebate.isLive ? 'live' : 'stopped',
    uptime: process.uptime(),
    newsSource: 'RSS Feeds with Full Article Reading',
    aiStyle: 'Article-informed human-like dialogue',
    currentArticle: currentDebate.currentArticle ? {
      title: currentDebate.currentArticle.articleTitle,
      source: currentDebate.currentArticle.source,
      hasContent: currentDebate.currentArticle.articleContent.length > 0
    } : null
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection handling
wss.on('connection', (ws, request) => {
  clients.add(ws);
  console.log(`👤 Client connected. Total: ${clients.size}`);
  
  // Send initial state
  ws.send(JSON.stringify({
    type: 'initial_state',
    debate: currentDebate
  }));
  
  // Send current article info if available
  if (currentDebate.currentArticle) {
    ws.send(JSON.stringify({
      type: 'article_info',
      article: {
        title: currentDebate.currentArticle.articleTitle,
        url: currentDebate.currentArticle.articleUrl,
        source: currentDebate.currentArticle.source
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
  console.log(`🚀 AI DEBATE ARENA - AIS READ FULL ARTICLES`);
  console.log(`🌐 Server running on port ${port}`);
  console.log(`🔑 Environment Variables Check:`);
  console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  
  console.log(`📰 News Sources with Article Reading:`);
  console.log(`   ✅ CNN RSS Feed + Full Article Content`);
  console.log(`   ✅ BBC RSS Feed + Full Article Content`);
  console.log(`   ✅ Reuters RSS Feed + Full Article Content`);
  console.log(`   ✅ NPR RSS Feed + Full Article Content`);
  console.log(`   ✅ Guardian RSS Feed + Full Article Content`);
  console.log(`   ✅ Washington Post RSS Feed + Full Article Content`);
  console.log(`   ✅ Curated Content with Context (Fallback)`);
  
  console.log(`🤖 AI Capabilities:`);
  console.log(`   📖 AIs read full article content before discussing`);
  console.log(`   💬 Human-like dialogue with article knowledge`);
  console.log(`   🎯 Responses based on actual article facts`);
  console.log(`   📝 Reference specific details from articles`);
  console.log(`   🔄 New articles every 25 minutes`);
  
  if (!process.env.HUGGINGFACE_API_KEY) {
    console.log(`❌ CRITICAL: Hugging Face API key missing - AI responses will fail`);
  } else {
    console.log(`🎯 Ready! AIs will read full articles and discuss with real knowledge!`);
    console.log(`📚 Visit /api/current-article to see what the AIs are currently reading`);
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
}); = true;
    currentDebate.messages = [];
    currentDebate.scores = {alex: 0, luna: 0, rex: 0, sage: 0};
    conversationFlow = [];
    
    const startMessage = `🔴 LIVE: AIs Read & Discuss - "${articleData.articleTitle}" (${articleData.source})`;

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

    console.log('🎬 AIs have read the article and are ready to discuss...');
    console.log(`📰 Article: ${articleData.articleTitle}`);
    console.log(`📡 Source: ${articleData.source}`);
    console.log(`📖 Content preview: ${articleData.articleContent.substring(0, 150)}...`);

    // Start the conversation loop
    startConversationLoop();

  } catch (error) {
    console.error('❌ Failed to start article-informed debate:', error.message);
    
    // Force start with curated content
    const fallbackData = getCuratedTopicsWithContent();
    currentDebate.topic = fallbackData.topic;
    currentDebate.newsSource = fallbackData.source;
    currentDebate.currentArticle = fallbackData;
    currentDebate.isLive = true;
    currentDebate.messages = [{
      id: Date.now(),
      ai: 'system',
      text: `🔴 LIVE: AIs Discuss - "${fallbackData.articleTitle}" (${fallbackData.source})`,
      timestamp: new Date().toISOString()
    }];
    
    broadcast({
      type: 'debate_update',
      debate: currentDebate
    });
    
    console.log('🎬 Started with curated content after error');
    
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
  currentDebate.isLive
