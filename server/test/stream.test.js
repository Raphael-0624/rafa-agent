import { parseMessage } from '../src/utils/stream.js';

// Test parseMessage
console.log('Test 1:', parseMessage('hello'));
// Expected: { type: 'normal', content: 'hello' }

console.log('Test 2:', parseMessage('/search 北京天气'));
// Expected: { type: 'explicit_search', query: '北京天气', original: '/search 北京天气' }

console.log('Test 3:', parseMessage('/SEARCH python tutorial'));
// Expected: { type: 'explicit_search', query: 'python tutorial', ... }
