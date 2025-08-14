/**
 * api.js
 * Handles all interactions with external APIs, specifically Tank01 for NFL player data.
 */

// TANK01 API Constants
const TANK_API_KEY = '53ae7f1ca3msh665960c57dd368dp1b6822jsn7145113ec292';
const TANK_API_HOST = 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com';

/**
 * Fetches the Tank01 player ID for a given player name.
 * @param {string} playerName - The display name of the NFL player or team defense (e.g., "Patrick Mahomes", "Kansas City Chiefs Defense").
 * @returns {Promise<string|null>} The playerID from Tank01, or null if not found or an error occurs.
 */
export async function getTank01PlayerID(playerName) {
    const url = `https://${TANK_API_HOST}/getNFLPlayerInfo?playerName=${encodeURIComponent(playerName)}&getStats=false`;
    try {
      const res = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': TANK_API_KEY,
          'X-RapidAPI-Host': TANK_API_HOST,
        }
      });
      if (!res.ok) {
        console.error(`Tank01 player ID fetch failed for ${playerName}: ${res.status}`);
        return null;
      }
      const data = await res.json();
      if (data.body && data.body.length > 0 && data.body[0].playerID) {
        return data.body[0].playerID;
      }
      return null;
    } catch (e) {
      console.error(`Error fetching Tank01 player ID for ${playerName}:`, e);
      return null;
    }
}

/**
 * Fetches the last game statistics for a given Tank01 player ID.
 * Includes fantasy points.
 * @param {string} playerID - The Tank01 player ID.
 * @returns {Promise<{stats: object, fantasyPoints: number}|null>} An object containing the raw stats and calculated fantasy points, or null if no data or an error occurs.
 */
export async function fetchLastGameStats(playerID) {
    if (!playerID) return null;

    const url = new URL(`https://${TANK_API_HOST}/getNFLGamesForPlayer`);
    url.searchParams.append('playerID', playerID);
    url.searchParams.append('fantasyPoints', 'true');

    try {
      const res = await fetch(url.toString(), {
        headers: {
          'X-RapidAPI-Key': TANK_API_KEY,
          'X-RapidAPI-Host': TANK_API_HOST,
        }
      });
      if (!res.ok) {
        console.error(`Tank01 player stats fetch failed for ID ${playerID}: ${res.status}`);
        return null;
      }
      const data = await res.json();
      const games = data.body || {};
      const gameIds = Object.keys(games);
      if (!gameIds.length) return null;
      
      // Sort to get the latest game (assuming gameID is sortable like YYYYMMDD...)
      gameIds.sort((a,b) => b.localeCompare(a));
      const lastGameStats = games[gameIds[0]];

      const fantasyPointsRaw = lastGameStats.fantasyPoints
                            || lastGameStats.fantasyPointsDefault?.PPR
                            || lastGameStats.fantasyPointsDefault?.standard
                            || 0;
      return { stats: lastGameStats, fantasyPoints: parseFloat(fantasyPointsRaw) || 0 };
    } catch (e) {
      console.error(`Error fetching last game stats for player ID ${playerID}:`, e);
      return null;
    }
}