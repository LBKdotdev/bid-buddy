// Shared Groq rate-limit tracker
// Reads response headers to know remaining quota and backs off gracefully.
// Keeps other projects (The Scoop voice input) from getting shut out.

const STORAGE_KEY = 'groq-rate-limit';
const RESERVE_REQUESTS = 5;  // Always keep 5 requests in reserve for other services
const RESERVE_TOKENS = 1000; // Keep token buffer for voice input etc.

interface RateLimitState {
  remainingRequests: number | null;
  remainingTokens: number | null;
  resetAt: number | null; // timestamp when limits reset
  updatedAt: number;
}

function getState(): RateLimitState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { remainingRequests: null, remainingTokens: null, resetAt: null, updatedAt: 0 };
    const state = JSON.parse(raw);
    // If reset time has passed, clear the state
    if (state.resetAt && Date.now() > state.resetAt) {
      localStorage.removeItem(STORAGE_KEY);
      return { remainingRequests: null, remainingTokens: null, resetAt: null, updatedAt: 0 };
    }
    return state;
  } catch {
    return { remainingRequests: null, remainingTokens: null, resetAt: null, updatedAt: 0 };
  }
}

function saveState(state: RateLimitState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — not critical
  }
}

/** Update rate limit state from Groq response headers */
export function updateFromHeaders(headers: Headers) {
  const remaining = headers.get('x-ratelimit-remaining-requests');
  const remainingTokens = headers.get('x-ratelimit-remaining-tokens');
  const resetMs = headers.get('x-ratelimit-reset-requests'); // e.g. "2s" or "1m30s"

  const state: RateLimitState = {
    remainingRequests: remaining !== null ? parseInt(remaining) : null,
    remainingTokens: remainingTokens !== null ? parseInt(remainingTokens) : null,
    resetAt: resetMs ? Date.now() + parseResetDuration(resetMs) : null,
    updatedAt: Date.now(),
  };

  saveState(state);

  if (state.remainingRequests !== null && state.remainingRequests <= RESERVE_REQUESTS) {
    console.warn(`Groq rate limit low: ${state.remainingRequests} requests remaining`);
  }
}

/** Check if we should skip Groq to preserve quota for other services */
export function shouldThrottleGroq(): boolean {
  const state = getState();

  // No data yet — allow the call (we'll learn limits from the response)
  if (state.remainingRequests === null) return false;

  // If below reserve threshold, back off
  if (state.remainingRequests <= RESERVE_REQUESTS) {
    console.warn(`Groq throttled: only ${state.remainingRequests} requests left, reserving for other services`);
    return true;
  }

  if (state.remainingTokens !== null && state.remainingTokens <= RESERVE_TOKENS) {
    console.warn(`Groq throttled: only ${state.remainingTokens} tokens left`);
    return true;
  }

  return false;
}

/** Parse Groq's reset duration format (e.g. "2s", "1m30s", "500ms") */
function parseResetDuration(duration: string): number {
  let ms = 0;
  const minMatch = duration.match(/(\d+)m(?!s)/);
  const secMatch = duration.match(/(\d+)s/);
  const msMatch = duration.match(/(\d+)ms/);
  if (minMatch) ms += parseInt(minMatch[1]) * 60000;
  if (secMatch) ms += parseInt(secMatch[1]) * 1000;
  if (msMatch) ms += parseInt(msMatch[1]);
  return ms || 60000; // default 1 minute if unparseable
}

/** Get human-readable status for debugging/UI */
export function getGroqStatus(): { remaining: number | null; throttled: boolean } {
  const state = getState();
  return {
    remaining: state.remainingRequests,
    throttled: shouldThrottleGroq(),
  };
}
