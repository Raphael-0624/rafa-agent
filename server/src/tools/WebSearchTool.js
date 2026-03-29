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

  get description() {
    return 'Search the web for real-time information';
  }

  get parameters() {
    return {
      query: { type: 'string', required: true },
      count: { type: 'number', default: 5 }
    };
  }

  validate(params) {
    return params.query && typeof params.query === 'string';
  }

  async execute(params) {
    const { query, count = 5 } = params;

    for (const provider of this.providers) {
      try {
        console.log('[WebSearch] Trying ' + provider.name + '...');
        const results = await provider.handler(query, Math.min(count, 10));

        if (results && results.length > 0) {
          console.log('[WebSearch] ' + provider.name + ' returned ' + results.length + ' results');
          return { results: results.slice(0, count), provider: provider.name, query };
        }
      } catch (error) {
        console.error('[WebSearch] ' + provider.name + ' failed:', error.message);
        continue;
      }
    }

    throw new Error('All search providers failed');
  }

  async searchTavily(query, count) {
    if (!this.config.tavilyKey) {
      throw new Error('Tavily API key not configured');
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.config.tavilyKey,
        query,
        search_depth: 'basic',
        max_results: count,
        include_answer: false,
        include_images: false
      })
    });

    if (!response.ok) {
      throw new Error('Tavily HTTP ' + response.status);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return [];
    }

    return data.results.map(r => ({
      title: r.title || 'No title',
      url: r.url,
      snippet: r.content || r.snippet || ''
    }));
  }

  async searchSerper(query, count) {
    if (!this.config.serperKey) {
      throw new Error('Serper API key not configured');
    }

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': this.config.serperKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, num: count })
    });

    if (!response.ok) {
      throw new Error('Serper HTTP ' + response.status);
    }

    const data = await response.json();
    const results = data.organic || data.results || [];

    if (results.length === 0) {
      return [];
    }

    return results.map(r => ({
      title: r.title || 'No title',
      url: r.link || r.url,
      snippet: r.snippet || r.description || ''
    }));
  }

  async searchDuckDuckGo(query, count) {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query) + '&kl=zh-cn';

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error('DuckDuckGo HTTP ' + response.status);
    }

    const html = await response.text();
    return this.parseDuckDuckGoResults(html, count);
  }

  parseDuckDuckGoResults(html, count) {
    const results = [];
    const pattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

    let match;
    while ((match = pattern.exec(html)) && results.length < count) {
      try {
        let url = match[1];
        if (url.startsWith('/')) continue;

        const title = match[2]
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .trim();

        if (url && title && !results.find(r => r.url === url)) {
          results.push({ title, url, snippet: '' });
        }
      } catch (e) {
        continue;
      }
    }

    return results;
  }
}
