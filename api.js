/**
 * api.js
 * Handles all interactions with external APIs, specifically Tank01 for NFL player data.
 */
import { getCachedData, setCachedData } from './utils.js';

// TANK01 API Constants
const TANK_API_KEY = '1eb53dd891msh0fb7989313af6d1p1655b2jsn140053348c78';
const TANK_API_HOST = 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com';

/**
 * Fetches the Tank01 player ID for a given player name.
 * @param {string} playerName - The display name of the NFL player or team defense (e.g., "Patrick Mahomes", "Kansas City Chiefs Defense").
 * @returns {Promise<string|null>} The playerID from Tank01, or null if not found or an error occurs.
 */
export async function getTank01PlayerID(playerName) {
    const cacheKey = `tank01-id-${playerName.replace(/\s+/g, '-').toLowerCase()}`;
    const cachedId = getCachedData(cacheKey);
    if (cachedId) {
        return cachedId;
    }

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
        const playerId = data.body[0].playerID;
        setCachedData(cacheKey, playerId); // Cache indefinitely for the session
        return playerId;
      }
      return null;
    } catch (e) {
      console.error(`Error fetching Tank01 player ID for ${playerName}:`, e);
      return null;
    }
}

/**
 * NEW: Fetches the last game for a team, using player endpoint as primary and team schedule as fallback.
 * @param {string} teamAbv - The team's abbreviation (e.g., 'KC').
 * @param {string} samplePlayerID - A player ID from the team to check the player-specific endpoint.
 * @returns {Promise<object|null>} The game data object for the team's last played game.
 */
export async function fetchLastTeamGame(teamAbv, samplePlayerID) {
    const cacheKey = `tank01-team-game-${teamAbv}`;
    const TTL = 60 * 1000; // 1 minute TTL
    const cachedGame = getCachedData(cacheKey);
    if (cachedGame) {
        return cachedGame;
    }

  try {
    // 🔹 1) Try player endpoint first (most reliable for live/in-progress)
    if (samplePlayerID) {
        const playerUrl = `https://${TANK_API_HOST}/getNFLPlayerGameStats?playerID=${samplePlayerID}`;
        const playerRes = await fetch(playerUrl, {
          headers: {
            "X-RapidAPI-Key": TANK_API_KEY,
            "X-RapidAPI-Host": TANK_API_HOST,
          }
        });
        if (playerRes.ok) {
            const playerData = await playerRes.json();
            const playerGames = (playerData.body && playerData.body.playerStats) || [];

            if (playerGames.length) {
              // They return in descending order already, so first one is last game
              const playerLastGame = playerGames[0];
              if (
                playerLastGame.gameStatus === "InProgress" ||
                playerLastGame.gameStatusCode === "1" ||
                playerLastGame.gameStatus === "Completed" ||
                playerLastGame.gameStatusCode === "2"
              ) {
                setCachedData(cacheKey, playerLastGame, TTL);
                return playerLastGame; // ✅ trust this one
              }
            }
        }
    }


    // 🔹 2) Fallback: team schedule endpoint
    const url = `https://${TANK_API_HOST}/getNFLTeamSchedule?teamAbv=${teamAbv}`;

    const res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": TANK_API_KEY,
        "X-RapidAPI-Host": TANK_API_HOST,
      }
    });
    
    if (!res.ok) {
        console.error(`Tank01 team schedule fetch failed for ${teamAbv}: ${res.status}`);
        return null;
    }

    const data = await res.json();
    const games = (data.body && data.body.schedule) || [];

    if (!games.length) return null;

    // filter to completed or in-progress
    const playedGames = games.filter(g =>
      g.gameStatus === "Completed" ||
      g.gameStatusCode === "2" ||
      g.gameStatus === "InProgress" ||
      g.gameStatusCode === "1"
    );

    if (!playedGames.length) return null;

    // pick latest by date
    playedGames.sort((a, b) => b.gameDate.localeCompare(a.gameDate));
    const latest = playedGames[0];

    setCachedData(cacheKey, latest, TTL);
    return latest;

  } catch (e) {
    console.error(`Tank01 team fetch failed for ${teamAbv}:`, e);
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

    const cacheKey = `tank01-stats-${playerID}`;
    const TTL = 60 * 1000; // 1 minute TTL
    const cachedResult = getCachedData(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

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
      const result = { stats: lastGameStats, fantasyPoints: parseFloat(fantasyPointsRaw) || 0 };
      setCachedData(cacheKey, result, TTL);
      return result;
    } catch (e) {
      console.error(`Error fetching last game stats for player ID ${playerID}:`, e);
      return null;
    }
}