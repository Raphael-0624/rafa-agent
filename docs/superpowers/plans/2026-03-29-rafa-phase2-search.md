# Rafa Agent Phase 2 - Web Search Implementation Plan

**Goal:** Implement WebSearchTool with multi-provider fallback (Tavily → Serper → DuckDuckGo)

**Architecture:**
- Base WebSearchTool class with pluggable providers
- Automatic fallback when primary fails
- Unified result format across all providers

---

## Task 1: Create WebSearchTool with Multi-Provider Support

**Files:**
- Create: `server/src/tools/WebSearchTool.js`

**Provider Config:**
- Primary: Tavily (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)
- Backup: Serper (d662ddd3bbd14c5728acc1d24fb9ba665cdcc68c)
- Fallback: DuckDuckGo (free, no key)

**Implementation:**

```javascript
import { BaseTool } from './BaseTool.js';

export class WebSearchTool extends BaseTool {
  constructor(config = {}) {
    super(config);
    this.providers = [
      { name: 'tavily', handler: this.searchTavily.bind(this), key: config.tavilyKey },
      { name: 'serper', handler: this.searchSerper.bind(this), key: config.serperKey },
      { name: 'duckduckgo', handler: this.searchDuckDuckGo.bind(this), key: null }
    ];
  }

  get name() { return 'web_search'; }
  get description() { return 'Search the web for real-time information'; }
  get parameters() {
    return {
      query: { type: 'string', required: true, description: 'Search query' },
      count: { type: 'number', default: 5, description: 'Number of results' }
    };
  }

  async execute(params) {
    const { query, count = 5 } = params;

    for (const provider of this.providers) {
      try {
        console.log(`[WebSearch] Trying ${provider.name}...`);
        const results = await provider.handler(query, count);
        if (results && results.length > 0) {
          console.log(`[WebSearch] ${provider.name} returned ${results.length} results`);
          return { results, provider: provider.name };
        }
      } catch (error) {
        console.error(`[WebSearch] ${provider.name} failed:`, error.message);
        continue;
      }
    }

    throw new Error('All search providers failed');
  }

  async searchTavily(query, count) {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.config.tavilyKey,
        query,
        search_depth: 'basic',
        max_results: count
      })
    });

    if (!response.ok) throw new Error(`Tavily error: ${response.status}`);
    const data = await response.json();
    return data.results?.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content
    })) || [];
  }

  async searchSerper(query, count) {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': this.config.serperKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, num: count })
    });

    if (!response.ok) throw new Error(`Serper error: ${response.status}`);
    const data = await response.json();
    return data.organic?.map(r => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet
    })) || [];
  }

  async searchDuckDuckGo(query, count) {
    // Using DuckDuckGo HTML scraping or alternative API
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`DuckDuckGo error: ${response.status}`);

    const html = await response.text();
    // Parse HTML to extract results
    const results = [];
    const regex = /<a rel="nofollow" class="result__a" href="([^"]+)">([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) && results.length < count) {
      results.push({
        title: match[2].replace(/<[^>]+>/g, ''),
        url: match[1],
        snippet: match[3].replace(/<[^>]+>/g, '')
      });
    }
    return results;
  }
}
```

---

## Task 2: Update .env with API Keys

**Files:**
- Modify: `server/.env`

Add:
```
# Search API Keys
TAVILY_API_KEY=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
SERPER_API_KEY=d662ddd3bbd14c5728acc1d24fb9ba665cdcc68c
```

---

## Task 3: Register WebSearchTool in Agent

**Files:**
- Modify: `server/src/index.js`

Add registration:
```javascript
import { WebSearchTool } from './tools/WebSearchTool.js';

// After creating agent
const searchTool = new WebSearchTool({
  tavilyKey: process.env.TAVILY_API_KEY,
  serperKey: process.env.SERPER_API_KEY
});
agent.registerTool(searchTool);
```

---

## Task 4: Test Search Functionality

**Files:**
- Create: `server/test/search.test.js`

Test all three providers.

---

## Task 5: Build and Deploy

- Build frontend: `cd client && npm run build`
- Restart server
- Test: http://rafa.love/agent/

**Plan saved to:** `docs/superpowers/plans/2026-03-29-rafa-phase2-search.md`
