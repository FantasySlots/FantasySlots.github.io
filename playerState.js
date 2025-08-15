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
            QB: null, RB: null, WR1: null, WR2: null, TE: null, FLEX: null, DEF: null, K: null 
        },
        isSetupStarted: false // NEW: Flag to track if player's setup process has begun
    },
    2: { 
        name: '', 
        avatar: null, // NEW: Added avatar property
        team: null, 
        draftedPlayers: [], 
        rosterSlots: {
            QB: null, RB: null, WR1: null, WR2: null, TE: null, FLEX: null, DEF: null, K: null 
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

    // Firebase can sometimes return an array with null at index 0
    // so we check for keys '1' and '2' specifically.
    if (remotePlayerData['1']) {
        Object.assign(playerData[1], JSON.parse(JSON.stringify(remotePlayerData['1'])));
    }
    if (remotePlayerData['2']) {
        Object.assign(playerData[2], JSON.parse(JSON.stringify(remotePlayerData['2'])));
    }
}

/**
 * NEW: Switches the current player turn.
 */
export function switchTurn() {
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
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
    if (!playerData[playerNum] || !playerData[playerNum].rosterSlots) {
        console.log(`Roster full check for P${playerNum}: roster data missing.`);
        return false;
    }

    const roster = playerData[playerNum].rosterSlots;
    const requiredSlots = ['QB', 'RB', 'WR1', 'WR2', 'TE', 'FLEX', 'DEF', 'K'];

    const result = requiredSlots.every(slot => roster[slot] && roster[slot].id);
    console.log(`Roster full check for P${playerNum}:`, roster, '=>', result);
    return result;
}

export function isPlayerPositionUndraftable(playerNum, originalPosition) {
    if (!playerData[playerNum] || !playerData[playerNum].rosterSlots) {
        console.log(`Undraftable check for P${playerNum} (${originalPosition}): roster data missing.`);
        return true;
    }

    const roster = playerData[playerNum].rosterSlots;
    const hasPlayer = slotId => roster[slotId] && roster[slotId].id;

    let result;
    switch (originalPosition) {
        case 'QB':
            result = hasPlayer('QB');
            break;
        case 'RB':
            result = hasPlayer('RB') && hasPlayer('FLEX');
            break;
        case 'WR':
            result = hasPlayer('WR1') && hasPlayer('WR2') && hasPlayer('FLEX');
            break;
        case 'TE':
            result = hasPlayer('TE') && hasPlayer('FLEX');
            break;
        case 'K':
            result = hasPlayer('K');
            break;
        case 'DEF':
            result = hasPlayer('DEF');
            break;
        default:
            result = true;
    }

    console.log(`Undraftable check for P${playerNum} (${originalPosition}):`, roster, '=>', result);
    return result;
}

export function findAvailableSlotForPlayer(playerNum, player) {
    if (!playerData[playerNum] || !playerData[playerNum].rosterSlots) {
        console.log(`findAvailableSlotForPlayer: P${playerNum} roster data missing.`);
        return null;
    }

    const roster = playerData[playerNum].rosterSlots;
    const hasPlayer = slotId => roster[slotId] && roster[slotId].id;
    let position = player.position?.abbreviation || player.position?.name;
    if (position === 'PK') position = 'K';

    let availableSlot = null;

    if (position === 'QB' && !hasPlayer('QB')) availableSlot = 'QB';
    else if (position === 'K' && !hasPlayer('K')) availableSlot = 'K';
    else if (position === 'DEF' && !hasPlayer('DEF')) availableSlot = 'DEF';
    else if (position === 'RB') {
        if (!hasPlayer('RB')) availableSlot = 'RB';
        else if (!hasPlayer('FLEX')) availableSlot = 'FLEX';
    }
    else if (position === 'WR') {
        if (!hasPlayer('WR1')) availableSlot = 'WR1';
        else if (!hasPlayer('WR2')) availableSlot = 'WR2';
        else if (!hasPlayer('FLEX')) availableSlot = 'FLEX';
    }
    else if (position === 'TE') {
        if (!hasPlayer('TE')) availableSlot = 'TE';
        else if (!hasPlayer('FLEX')) availableSlot = 'FLEX';
    }

    console.log(`findAvailableSlotForPlayer: P${playerNum} ${player.displayName} (${position}) => ${availableSlot}`);
    return availableSlot;
}


