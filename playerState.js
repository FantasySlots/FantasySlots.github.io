/**
 * playerState.js
 * Manages the core game state related to players, their rosters, and helper functions
 * to check roster status.
 */

// NEW: Centralized game state for turn management and game phase
export const gameState = {
    currentPlayer: 1,
    phase: 'NAME_ENTRY', // Can be 'NAME_ENTRY', 'DRAFTING', 'COMPLETE'
};

export const playerData = {
    1: { 
        name: '', 
        avatar: null, // NEW: Added avatar property
        team: null, 
        draftedPlayers: [], 
        rosterSlots: { 
            QB: null, RB: null, WR1: null, WR2: null, TE: null, Flex: null, DEF: null, K: null 
        },
        isSetupStarted: false // NEW: Flag to track if player's setup process has begun
    },
    2: { 
        name: '', 
        avatar: null, // NEW: Added avatar property
        team: null, 
        draftedPlayers: [], 
        rosterSlots: {
            QB: null, RB: null, WR1: null, WR2: null, TE: null, Flex: null, DEF: null, K: null 
        },
        isSetupStarted: false // NEW: Flag to track if player's setup process has begun
    }
};

/**
 * NEW: Safely updates the local playerData object with data from Firebase.
 * This handles cases where Firebase might return an array-like object.
 * @param {object} remotePlayerData - The playerData object from Firebase.
 */
export function updateLocalPlayerData(remotePlayerData) {
  if (!remotePlayerData) return;

  const defaultRoster = {
    QB: null, RB: null, WR1: null, WR2: null,
    TE: null, Flex: null, DEF: null, K: null
  };

  function normalizePlayerData(raw) {
    const parsed = JSON.parse(JSON.stringify(raw || {}));
    return {
      name: parsed.name || '',
      avatar: parsed.avatar || null,
      team: parsed.team ?? null,  // always defined, default null
      draftedPlayers: parsed.draftedPlayers || [],
      rosterSlots: { ...defaultRoster, ...(parsed.rosterSlots || {}) },
      isSetupStarted: parsed.isSetupStarted || false
    };
  }

  if (remotePlayerData['1']) {
    playerData[1] = normalizePlayerData(remotePlayerData['1']);
  }
  if (remotePlayerData['2']) {
    playerData[2] = normalizePlayerData(remotePlayerData['2']);
  }
}




/**
 * NEW: Switches the current player turn.
 */
export function switchTurn(syncCallback, playerNum) {
  gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
  if (typeof syncCallback === 'function') {
    syncCallback(playerNum); // still only sync current player branch
  }
}


/**
 * NEW: Sets the current game phase.
 * @param {string} newPhase - The new phase to set ('NAME_ENTRY', 'DRAFTING', 'COMPLETE').
 */
export function setGamePhase(newPhase) {
    gameState.phase = newPhase;
}

/**
 * NEW: Resets the game state to its initial values.
 */
export function resetGameState() {
    gameState.currentPlayer = 1;
    gameState.phase = 'NAME_ENTRY';
}

/**
 * Checks if a player's fantasy roster is completely full.
 * @param {number} playerNum - The player number (1 or 2).
 * @returns {boolean} True if the roster is full, false otherwise.
 */
export function isFantasyRosterFull(playerNum) {
    // Add a guard to prevent errors if playerData for the player or its rosterSlots doesn't exist yet.
    if (!playerData[playerNum] || !playerData[playerNum].rosterSlots) {
        return false;
    }
    const roster = playerData[playerNum].rosterSlots;
    const requiredSlots = ['QB', 'RB', 'WR1', 'WR2', 'TE', 'Flex', 'DEF', 'K'];
    return requiredSlots.every(slot => roster[slot] !== null);
}

/**
 * Checks if a player's fantasy roster has any available slot for a given position type.
 * @param {number} playerNum - The player number (1 or 2).
 * @param {string} originalPosition - The player's original position (e.g., 'QB', 'RB', 'WR', 'TE', 'K', 'DEF').
 * @returns {boolean} True if no slot is available for that position, false otherwise.
 */
export function isPlayerPositionUndraftable(playerNum, originalPosition) {
    // Add a guard to prevent errors.
    if (!playerData[playerNum] || !playerData[playerNum].rosterSlots) {
        return true; // Assume undraftable if data is missing
    }
    const rosterSlots = playerData[playerNum].rosterSlots;

    if (originalPosition === 'QB') {
        return rosterSlots.QB !== null;
    }
    if (originalPosition === 'RB') {
        return rosterSlots.RB !== null && rosterSlots.Flex !== null;
    }
    if (originalPosition === 'WR') {
        return rosterSlots.WR1 !== null && rosterSlots.WR2 !== null && rosterSlots.Flex !== null;
    }
    if (originalPosition === 'TE') {
        return rosterSlots.TE !== null && rosterSlots.Flex !== null;
    }
    if (originalPosition === 'K') {
        return rosterSlots.K !== null;
    }
    if (originalPosition === 'DEF') {
        return rosterSlots.DEF !== null;
    }
    return true; 
}