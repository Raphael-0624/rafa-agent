import { WebSearchTool } from '../src/tools/WebSearchTool.js';
import dotenv from 'dotenv';

dotenv.config();

async function testSearch() {
  console.log('Testing WebSearchTool...\n');

  const tool = new WebSearchTool({
    tavilyKey: process.env.TAVILY_API_KEY,
    serperKey: process.env.SERPER_API_KEY
  });

  const testQuery = '北京今天天气';
  console.log(`Query: "${testQuery}"\n`);

  try {
    const result = await tool.execute({ query: testQuery, count: 3 });
    console.log('✓ Search successful!');
    console.log(`Provider: ${result.provider}`);
    console.log(`Results: ${result.results.length}`);
    console.log('\nFirst result:');
    console.log(JSON.stringify(result.results[0], null, 2));
  } catch (error) {
    console.error('✗ Search failed:', error.message);
  }
}

testSearch();
