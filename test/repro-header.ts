
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
const port = 3001;

app.post("/test", (c) => {
  const headers = c.req.header();
  console.log("Headers received:", JSON.stringify(headers));
  const apiKey = headers["x-api-key"];
  if (!apiKey) {
    return c.json({ error: "Missing x-api-key header" }, 401);
  }
  return c.json({ success: true, apiKey });
});

console.log(`Test server running on port ${port}`);

const server = serve({
  fetch: app.fetch,
  port,
});

// Give server a moment to start
setTimeout(async () => {
  try {
    console.log("Sending request with X-Api-Key...");
    const response = await fetch(`http://localhost:${port}/test`, {
      method: "POST",
      headers: {
        "X-Api-Key": "test-key-123",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ foo: "bar" })
    });

    const body = await response.json();
    console.log("Response:", body);

    server.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    server.close();
    process.exit(1);
  }
}, 1000);
