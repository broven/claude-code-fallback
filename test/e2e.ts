import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

// Config
const PROXY_PORT = 3001; // Use different port to avoid conflict if dev server running
const MOCK_PORT = 4000;
const PROVIDERS_FILE = 'providers.test.yaml';
const PROXY_URL = `http://localhost:${PROXY_PORT}/v1/messages`;
const CONTROL_URL = `http://localhost:${MOCK_PORT}/_control/scenario`;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test State
let proxyProcess: ChildProcess | null = null;
let mockProcess: ChildProcess | null = null;

async function setup() {
  console.log('--- Setup ---');

  // 1. Create providers.yaml for testing
  const providersConfig = `
- name: "MockProvider"
  baseUrl: "http://localhost:${MOCK_PORT}/fallback/v1/messages"
  apiKey: "mock-key-secret"
  authHeader: "x-mock-key"
  modelMapping:
    claude-3-5-sonnet-20240620: "mock-model"
`;
  fs.writeFileSync(PROVIDERS_FILE, providersConfig);
  console.log(`Created ${PROVIDERS_FILE}`);

  // 2. Start Mock Server
  console.log('Starting Mock Server...');
  mockProcess = spawn('npx', ['tsx', 'test/mock-server.ts'], {
    stdio: 'inherit',
    env: { ...process.env }
  });
  await sleep(2000); // Wait for boot

  // 3. Start Proxy Server
  console.log('Starting Proxy Server...');
  proxyProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: PROXY_PORT.toString(),
      PROVIDERS_CONFIG_PATH: PROVIDERS_FILE,
      ANTHROPIC_BASE_URL: `http://localhost:${MOCK_PORT}/primary/v1/messages`
    }
  });
  await sleep(3000); // Wait for boot
}

async function teardown() {
  console.log('--- Teardown ---');
  if (proxyProcess) proxyProcess.kill();
  if (mockProcess) mockProcess.kill();
  if (fs.existsSync(PROVIDERS_FILE)) {
    fs.unlinkSync(PROVIDERS_FILE);
  }
}

async function setScenario(scenario: string) {
  await fetch(CONTROL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario })
  });
}

async function runTest(name: string, scenario: string, expectedStatus: number, expectedText?: string) {
  console.log(`\n=== Running Test: ${name} ===`);
  await setScenario(scenario);

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'x-api-key': 'test-client-key',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20240620',
      messages: [{ role: 'user', content: 'Hello' }]
    })
  });

  const status = response.status;
  const text = await response.text();

  console.log(`Result: Status ${status}`);
  if (status === expectedStatus) {
    if (expectedText && !text.includes(expectedText)) {
      console.error(`FAIL: Expected text "${expectedText}" not found in response: ${text}`);
      process.exit(1);
    }
    console.log('PASS');
  } else {
    console.error(`FAIL: Expected status ${expectedStatus}, got ${status}. Response: ${text}`);
    process.exit(1);
  }
}

async function main() {
  try {
    await setup();

    // Test 1: Happy Path (Primary OK)
    await runTest('Normal Operation', 'normal', 200, 'Response from Primary Anthropic Mock');

    // Test 2: Primary 429 -> Fallback OK
    await runTest('Primary Rate Limit -> Fallback', 'primary-429', 200, 'Response from Fallback Provider Mock');

    // Test 3: Primary 500 -> Fallback OK
    await runTest('Primary Server Error -> Fallback', 'primary-500', 200, 'Response from Fallback Provider Mock');

    // Test 4: All Fail
    await runTest('All Providers Fail', 'all-fail', 503, 'Fallback provider also failed'); // Mock returns 503, proxy should return it

    // Test 5: Authorization Header Support
    console.log(`\n=== Running Test: Authorization Header Support ===`);
    await setScenario('normal');
    const authResponse = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-client-key',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        messages: [{ role: 'user', content: 'Hello' }]
      })
    });
    const authStatus = authResponse.status;
    const authText = await authResponse.text();
    console.log(`Result: Status ${authStatus}`);
    if (authStatus === 200) {
      console.log('PASS');
    } else {
      console.error(`FAIL: Expected status 200, got ${authStatus}. Response: ${authText}`);
      process.exit(1);
    }

    // Test 6: Debug Logging
    console.log(`\n=== Running Test: Debug Logging ===`);
    // Restart proxy with debug enabled
    if (proxyProcess) proxyProcess.kill();

    // Create debug config
    const debugConfig = `
debug: true
providers:
  - name: "MockProvider"
    baseUrl: "http://localhost:${MOCK_PORT}/fallback/v1/messages"
    apiKey: "mock-key-secret"
`;
    fs.writeFileSync(PROVIDERS_FILE, debugConfig);

    // Clear log if exists
    if (fs.existsSync('debug.log')) fs.unlinkSync('debug.log');

    // Start Proxy again
    console.log('Restarting Proxy Server with debug enabled...');
    proxyProcess = spawn('npx', ['tsx', 'src/index.ts'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: PROXY_PORT.toString(),
        PROVIDERS_CONFIG_PATH: PROVIDERS_FILE,
        ANTHROPIC_BASE_URL: `http://localhost:${MOCK_PORT}/primary/v1/messages`
      }
    });
    await sleep(3000); // Wait for boot

    // Make a request
    await setScenario('normal');
    await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'x-api-key': 'test-client-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'debug-test', messages: [] })
    });

    // Check log file
    if (fs.existsSync('debug.log')) {
      const logContent = fs.readFileSync('debug.log', 'utf-8');
      if (logContent.includes('Incoming Request') && logContent.includes('debug-test')) {
        console.log('PASS: debug.log created and contains request data');
      } else {
        console.error('FAIL: debug.log does not contain expected data');
        console.error('Log content:', logContent);
        process.exit(1);
      }
    } else {
      console.error('FAIL: debug.log was not created');
      process.exit(1);
    }

    // Clean up log
    if (fs.existsSync('debug.log')) fs.unlinkSync('debug.log');

    console.log('\nAll tests passed successfully!');

  } catch (error) {
    console.error('Test Suite Error:', error);
  } finally {
    await teardown();
  }
}

main();
