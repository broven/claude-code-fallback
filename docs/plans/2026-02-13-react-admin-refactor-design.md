# Design Document: Admin Panel Refactor to React (Embedded in Cloudflare Workers)

**Date:** 2026-02-13
**Status:** Design

## Overview

The current admin panel (`src/admin.ts`) relies on server-side rendered HTML strings. As complexity grows (e.g., drag-and-drop provider ordering, dynamic status updates, complex forms), maintaining raw HTML strings becomes unmanageable.

This plan proposes refactoring the admin interface into a **React Single Page Application (SPA)** using **Vite** and **Tailwind CSS**. To simplify deployment on Cloudflare Workers (which has a 1MB script size limit on the free tier, but static assets are handled differently or can be embedded), we will bundle the entire frontend into a **single HTML file** using `vite-plugin-singlefile` and serve it directly from the Worker.

## Architecture

### Frontend (New)
*   **Framework:** React 19 + TypeScript
*   **Build Tool:** Vite + `vite-plugin-singlefile`
*   **Styling:** Tailwind CSS + Radix UI (or Shadcn UI components)
*   **State Management:** TanStack Query (React Query) for API data, React Context for global UI state (toasts, auth)
*   **Routing:** React Router (client-side routing for `/admin/*`)
*   **Drag & Drop:** `dnd-kit` (modern, accessible drag-and-drop)

### Backend (Existing - Modified)
*   **Server:** Hono on Cloudflare Workers
*   **API:** Existing JSON endpoints (`/admin/config`, `/admin/tokens`, etc.) remain largely unchanged.
*   **Serving:** The `adminPage` handler will serve the pre-built HTML string instead of generating it on the fly.

### Integration
1.  **Build:** Run `vite build` in `frontend/` -> Generates `dist/index.html` (all assets inlined).
2.  **Embed:** During the worker build process (or as a build step), read this HTML file into a constant string or use Wrangler's `[assets]` binding if applicable (though single-file embedding is often simpler for portability).
3.  **Serve:** The Worker returns this HTML string for `GET /admin`.

## Component Structure

### Pages
1.  **Login (`/admin/login`):**
    *   Simple, centered card.
    *   Input for Admin Token.
    *   Persists token to `localStorage`.
    *   Redirects to `/admin` on success.

2.  **Dashboard (`/admin`):**
    *   **Header:** Logo, System Status (Global Health), Logout.
    *   **Main Content Area:**
        *   **Circuit Breaker Monitor:** Real-time view of provider health.
        *   **Provider Management:** List of providers.
        *   **Settings:** Global config (cooldowns, tokens).

### Key Components
*   **ProviderList:**
    *   Draggable list items.
    *   Visual distinction for Primary vs Fallback providers.
    *   Quick actions: Toggle Enable/Disable, Edit, Delete.
*   **ProviderModal:**
    *   Tabs for General (Name, URL, Key), Headers (KV pairs), Model Mappings (KV pairs).
    *   "Test Connection" button with detailed feedback.
*   **CircuitBreakerStatus:**
    *   Visual indicator (Green/Red dot).
    *   Countdown timer for cooldowns.
    *   "Reset" button for manual override.
*   **TokenManager:**
    *   List of allowed client tokens.
    *   "Copy to Clipboard" for easy sharing.
*   **JSONEditor:**
    *   Collapsible raw config editor for advanced users.

## Data Flow

### API Interaction
*   **Authentication:** All requests include `Authorization: Bearer <token>` header, read from `localStorage`.
*   **Fetching:** `useQuery` hooks fetch `/admin/config` and `/admin/provider-states`.
*   **Updates:** `useMutation` hooks handle POST requests to update config.
*   **Polling:** Provider states are polled every 2-5 seconds to update the dashboard in near real-time.

### State
*   **Local State:** Form inputs, modal visibility.
*   **Server State:** Synced via React Query.
*   **Auth State:** Managed via Context + LocalStorage.

## Implementation Plan

### Phase 1: Setup
1.  Initialize `frontend/` directory with Vite + React + TS template.
2.  Install dependencies: `tailwindcss`, `postcss`, `autoprefixer`, `@radix-ui/*`, `lucide-react` (icons), `clsx`, `tailwind-merge`.
3.  Configure `vite.config.ts` with `vite-plugin-singlefile`.
4.  Set up proxy in Vite to redirect API calls to local worker (`http://localhost:8787`).

### Phase 2: Core UI Components
1.  Create layout shell (Sidebar/Header).
2.  Implement Login page and Auth Context.
3.  Build reusable UI components: `Button`, `Input`, `Card`, `Modal`, `Switch` (Toggle), `Badge`.

### Phase 3: Feature Implementation
1.  **Provider Management:**
    *   Display list of providers from API.
    *   Implement Add/Edit/Delete functionality.
    *   Implement Drag-and-Drop reordering.
2.  **Circuit Breaker:**
    *   Fetch and display provider states.
    *   Implement "Reset" action.
3.  **Settings & Tokens:**
    *   Manage global settings (cooldown).
    *   Manage access tokens.

### Phase 4: Integration & Deployment
1.  Create a build script to:
    *   Build frontend (`npm run build`).
    *   Copy/Embed the resulting HTML into the Worker source (e.g., `src/assets/index.html.ts` exporting a string).
2.  Update `src/admin.ts` to serve this imported string.
3.  Update `wrangler.toml` (if needed) and `package.json` scripts.
4.  Verify end-to-end flow.

## Testing Strategy
*   **Unit Tests:** Vitest for utility functions and complex logic (e.g., data transformation).
*   **Component Tests:** React Testing Library for critical components (Forms, Provider List).
*   **E2E (Manual):** Verify against the local worker dev environment.
