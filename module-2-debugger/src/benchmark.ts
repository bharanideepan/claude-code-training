import { getDb } from "./db";

const db = getDb();
const RUNS = 10;

function n1Approach() {
  const posts = db.prepare("SELECT * FROM posts ORDER BY createdAt DESC").all() as any[];
  let queryCount = 1;
  const result = posts.map((post) => {
    const author = db.prepare("SELECT * FROM users WHERE id = ?").get(post.authorId) as any;
    queryCount++;
    return { ...post, author: author ? { id: author.id, name: author.name } : null };
  });
  return { posts: result, queryCount };
}

function joinApproach() {
  const posts = db.prepare(`
    SELECT p.*, u.id as authorId, u.name as authorName
    FROM posts p
    LEFT JOIN users u ON p.authorId = u.id
    ORDER BY p.createdAt DESC
  `).all() as any[];
  return {
    posts: posts.map((post) => ({
      ...post,
      author: post.authorId ? { id: post.authorId, name: post.authorName } : null,
    })),
    queryCount: 1,
  };
}

function bench(label: string, fn: () => { posts: any[]; queryCount: number }) {
  const times: number[] = [];
  let queryCount = 0;
  let postCount = 0;

  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const result = fn();
    times.push(performance.now() - start);
    queryCount = result.queryCount;
    postCount = result.posts.length;
  }

  const avg = times.reduce((a, b) => a + b, 0) / RUNS;
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.log(`\n${label}`);
  console.log(`  Posts returned : ${postCount}`);
  console.log(`  Queries made   : ${queryCount}`);
  console.log(`  Avg time       : ${avg.toFixed(2)}ms`);
  console.log(`  Min time       : ${min.toFixed(2)}ms`);
  console.log(`  Max time       : ${max.toFixed(2)}ms`);
  return avg;
}

console.log(`\n=== Performance Benchmark (${RUNS} runs each) ===`);
const n1Avg  = bench("N+1 approach (old)", n1Approach);
const joinAvg = bench("JOIN approach (new)", joinApproach);

const improvement = ((n1Avg - joinAvg) / n1Avg * 100).toFixed(1);
const speedup = (n1Avg / joinAvg).toFixed(2);
console.log(`\n  Speedup : ${speedup}x faster`);
console.log(`  Improvement : ${improvement}% reduction in query time\n`);
