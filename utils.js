/**
 * utils.js
 * Contains generic utility functions.
 */

// Fisher-Yates shuffle algorithm
export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Selects a random element from an array.
 * @param {Array} array - The array to select from.
 * @returns {*} A random element from the array.
 */
export function getRandomElement(array) {
    if (!array || array.length === 0) {
        return undefined;
    }
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}

/**
 * Creates a promise that resolves after a specified number of milliseconds.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>}
 */
export const delay = ms => new Promise(res => setTimeout(res, ms));

const CACHE_PREFIX = 'fantasy-slots-cache-';

/**
 * Retrieves data from sessionStorage if it exists and is not expired.
 * @param {string} key - The cache key.
 * @returns {any|null} The cached data or null if not found/expired.
 */
export function getCachedData(key) {
    try {
        const itemStr = sessionStorage.getItem(CACHE_PREFIX + key);
        if (!itemStr) {
            return null;
        }
        const item = JSON.parse(itemStr);
        const now = new Date().getTime();
        // Check if the item has a TTL and if it's expired
        if (item.ttl && now > item.timestamp + item.ttl) {
            sessionStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }
        return item.data;
    } catch (error) {
        console.warn(`Could not retrieve cached data for key "${key}":`, error);
        return null;
    }
}

/**
 * Stores data in sessionStorage with an optional TTL.
 * @param {string} key - The cache key.
 * @param {any} data - The data to store.
 * @param {number} [ttl] - Time to live in milliseconds. If not provided, data persists for the session.
 */
export function setCachedData(key, data, ttl) {
    try {
        const item = {
            data: data,
            timestamp: new Date().getTime(),
        };
        if (ttl) {
            item.ttl = ttl;
        }
        sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
    } catch (error) {
        console.warn(`Could not set cached data for key "${key}":`, error);
    }
}

// NEW: Helper: derive opponent (and home/away) from Tank01 gameID
export function getOpponentAndVenue(stats, teamOverride = null) {
  const team = (teamOverride || stats.teamAbv || stats.team || "").toUpperCase();
  const gid = stats.gameID || "";

  // Parse gameID: "YYYYMMDD_AWAY@HOME"
  const parts = gid.split("_");
  if (parts.length >= 2) {
    const matchup = parts[1]; // "AWY@HOME"
    const [away, home] = matchup.split("@").map(s => (s || "").toUpperCase());

    if (away && home) {
      if (team === away) return { opponent: home, venue: "@" };
      if (team === home) return { opponent: away, venue: "vs" };
      return { opponent: team ? (team === away ? home : away) : (away || home), venue: "" };
    }
  }
  return { opponent: "Unknown", venue: "" };
}

// NEW: Helper: parse game date
export function formatGameDate(gameID) {
  if (gameID && gameID.includes("_")) {
    const dateStr = gameID.split("_")[0]; // "20250808"
    if (dateStr.length === 8) {
      return `${dateStr.slice(4,6)}/${dateStr.slice(6,8)}/${dateStr.slice(0,4)}`;
    }
  }
  return "Unknown Date";
}