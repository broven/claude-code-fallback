# Observability Guide

This document explains how to monitor and debug your Claude Code Fallback Proxy using Cloudflare's observability features.

## Overview

The proxy now outputs **structured JSON logs** that are automatically collected by Cloudflare Workers Logs. Every request is assigned a unique **Request ID** for end-to-end tracing.

## Features Enabled

### 1. Structured JSON Logging

All logs are output in JSON format with the following structure:

```json
{
  "timestamp": "2026-02-11T03:12:31.777Z",
  "level": "info",
  "event": "provider.success",
  "message": "Provider request successful",
  "requestId": "req_1770779551776_2y97ttx",
  "data": {
    "provider": "openrouter",
    "model": "claude-sonnet-4-5-20250929",
    "status": 200,
    "latency": 234
  }
}
```

**Fields:**
- `timestamp`: ISO 8601 timestamp
- `level`: `debug` | `info` | `warn` | `error`
- `event`: Event type (see below)
- `message`: Human-readable description
- `requestId`: Unique request identifier
- `data`: Event-specific structured data

### 2. Request ID Tracking

Every request gets a unique ID (format: `req_{timestamp}_{random}`):
- Automatically generated for incoming requests
- Can be provided by client via `X-Request-ID` header
- Returned to client in `X-Request-ID` response header
- Included in all log entries for that request

### 3. Cloudflare Workers Observability

Enabled in `wrangler.jsonc`:

```jsonc
{
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1  // 100% of requests logged
  }
}
```

## Log Event Types

| Event | Level | Description |
|-------|-------|-------------|
| `request.start` | info | Incoming request received |
| `request.complete` | info | Request completed successfully |
| `request.error` | error | Request failed after all attempts |
| `provider.attempt` | info | Attempting to call a provider |
| `provider.success` | info | Provider call succeeded |
| `provider.failure` | warn | Provider call failed |
| `provider.timeout` | error | Provider call timed out or network error |
| `circuit_breaker.skip` | info | Provider skipped due to cooldown |
| `circuit_breaker.cooldown` | info | Provider entered cooldown state |
| `circuit_breaker.reset` | info | Provider circuit breaker reset |
| `safety_valve.triggered` | info | Safety valve activated (all providers in cooldown) |
| `auth.failure` | warn | Authentication failed |
| `config.load` | info | Configuration loaded |

## Viewing Logs

### Method 1: Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to: **Workers & Pages** → **Your Worker** → **Observability**
3. Use the Query Builder to filter logs:
   - Filter by `event` type: `event = "provider.failure"`
   - Filter by Request ID: `requestId = "req_..."`
   - Filter by provider: `data.provider = "openrouter"`

### Method 2: Real-time Tail (Development)

```bash
npm run tail
```

This streams logs in real-time from your production worker. Great for debugging live issues.

### Method 3: Logpush (Advanced)

Export logs to external monitoring systems:
- Grafana Cloud
- Datadog
- Splunk
- S3 / R2

[Cloudflare Logpush Documentation](https://developers.cloudflare.com/logs/get-started/enable-destinations/)

## Common Query Examples

### Find all failed requests
```
event = "request.error"
```

### Track a specific request
```
requestId = "req_1770779551776_2y97ttx"
```

### Find provider failures for a specific model
```
event = "provider.failure" AND data.model = "claude-sonnet-4-5-20250929"
```

### Find slow requests (> 5 seconds)
```
data.latency > 5000
```

### Find all circuit breaker activations
```
event = "circuit_breaker.skip" OR event = "circuit_breaker.cooldown"
```

### Safety valve triggers (critical - all providers down)
```
event = "safety_valve.triggered"
```

## Typical Request Flow

A successful request with fallback looks like this:

```json
// 1. Request starts
{"event": "request.start", "data": {"model": "claude-sonnet-4-5-20250929"}}

// 2. Try Anthropic (fails)
{"event": "provider.attempt", "data": {"provider": "anthropic-primary"}}
{"event": "provider.failure", "data": {"provider": "anthropic-primary", "status": 429}}
{"event": "circuit_breaker.cooldown", "data": {"provider": "anthropic-primary"}}

// 3. Try fallback (succeeds)
{"event": "provider.attempt", "data": {"provider": "openrouter"}}
{"event": "provider.success", "data": {"provider": "openrouter", "status": 200, "latency": 234}}
```

## Debugging Scenarios

### Scenario 1: High Error Rate

**Query:**
```
event = "provider.failure" OR event = "provider.timeout"
```

**Look for:**
- Which provider is failing most?
- What status codes are returned?
- Are latencies high before failures?

### Scenario 2: Slow Responses

**Query:**
```
event = "provider.success" AND data.latency > 3000
```

**Look for:**
- Which provider has high latency?
- Does latency correlate with specific models?
- Is circuit breaker helping or hindering?

### Scenario 3: All Providers Down

**Query:**
```
event = "safety_valve.triggered"
```

**Action:**
- Check if safety valve is frequently activating
- Indicates all providers are in cooldown simultaneously
- Review provider health and API keys

### Scenario 4: Authentication Issues

**Query:**
```
event = "auth.failure"
```

**Action:**
- Verify `x-ccf-api-key` header is being sent
- Check allowed tokens in KV configuration

## Performance Metrics

Key metrics to monitor:

1. **Success Rate** = `provider.success` / (`provider.success` + `provider.failure`)
2. **Average Latency** = mean(`data.latency`) where event = `provider.success`
3. **Circuit Breaker Activation Rate** = count(`circuit_breaker.cooldown`)
4. **Safety Valve Triggers** = count(`safety_valve.triggered`)
5. **Provider Distribution** = count by `data.provider`

## Best Practices

1. **Always include Request ID** when reporting issues
2. **Monitor safety valve triggers** - indicates systemic problems
3. **Set up alerts** for high error rates using Logpush
4. **Use sampling** for high-traffic workers (adjust `head_sampling_rate`)
5. **Correlate with Cloudflare Tracing** for complete request visibility

## Tracing (Automatic)

Cloudflare automatically traces:
- All `fetch()` calls to provider APIs
- KV operations
- Subrequest timing

View traces in: **Dashboard → Observability → Tracing**

No code changes needed - tracing is automatic when observability is enabled.

## Next Steps

- **Set up Logpush** to export to your monitoring system
- **Create dashboards** in Grafana/Datadog for key metrics
- **Configure alerts** for critical events (all providers down)
- **Optimize circuit breaker** settings based on observed patterns
