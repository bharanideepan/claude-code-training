import express from "express";
import {
  getAllUsers,
  getUserById,
  createUser,
  getAllPosts,
  createPost,
  getUserWithPostCount,
  getAllPostsWithAuthors,
} from "./db";

const app = express();
app.use(express.json());

// --- User routes ---

app.get("/api/users", (_req, res) => {
  const users = getAllUsers();
  res.json(users);
});

app.get("/api/users/:id", (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

// BUG #1 surfaces here: POST /api/users crashes
app.post("/api/users", (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    res.status(400).json({ error: "Name and email are required" });
    return;
  }

  try {
    const user = createUser(name, email);
    res.status(201).json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// BUG #2 surfaces here: post count is wrong
app.get("/api/users/:id/stats", (req, res) => {
  const stats = getUserWithPostCount(Number(req.params.id));
  if (!stats) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(stats);
});

// --- Post routes ---

app.get("/api/posts", (_req, res) => {
  const posts = getAllPosts();
  res.json(posts);
});

// BUG #3 surfaces here: slow with many posts
app.get("/api/posts/feed", (_req, res) => {
  const start = Date.now();
  const { posts, queryCount } = getAllPostsWithAuthors();
  const duration = Date.now() - start;
  res.json({ posts, meta: { count: posts.length, durationMs: duration, queryCount } });
});

app.post("/api/posts", (req, res) => {
  const { title, body, authorId } = req.body;

  if (!title || !body || !authorId) {
    res.status(400).json({ error: "Title, body, and authorId are required" });
    return;
  }

  try {
    const post = createPost(title, body, Number(authorId));
    res.status(201).json(post);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Debug Detective API running on http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /api/users         - List all users`);
  console.log(`  POST /api/users         - Create user (BUG #1: crashes)`);
  console.log(`  GET  /api/users/:id/stats - User stats (BUG #2: wrong count)`);
  console.log(`  GET  /api/posts/feed    - Posts with authors (BUG #3: slow)`);
  console.log(`\nRun 'npm run seed' first to populate test data.`);
});
