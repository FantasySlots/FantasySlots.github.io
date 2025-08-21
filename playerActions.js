/**
 * playerActions.js
 * Contains functions related to direct player actions like confirming names and selecting avatars.
 */
import { playerData, gameState, resetGameState } from './playerState.js';
import { getRandomElement } from './utils.js';
import { updateLayout } from './game.js';

// Define available avatars
export const AVATAR_SVGS = [
    "https://www.svgrepo.com/download/3514/american-football.svg",
    "https://www.svgrepo.com/download/58433/american-football-player.svg",
    "https://www.svgrepo.com/download/9002/american-football-jersey.svg",
    "https://www.svgrepo.com/download/205005/american-football-helmet.svg",
    "https://www.svgrepo.com/download/106538/american-football-emblem.svg",
    "https://www.svgrepo.com/download/162507/american-football-stadium.svg",
    "https://www.svgrepo.com/download/150537/american-football.svg"
];

/**
 * Helper function to update the avatar preview image and placeholder.
 * @param {number} playerNum - The player number (1 or 2).
 * @param {string|null} avatarUrl - The URL of the selected avatar, or null to show placeholder.
 */
export function updateAvatarPreview(playerNum, avatarUrl) {
    const previewImg = document.getElementById(`player${playerNum}-avatar-preview`).querySelector('.player-avatar-img');
    const placeholderSpan = document.getElementById(`player${playerNum}-avatar-preview`).querySelector('.avatar-placeholder');

    if (avatarUrl) {
        previewImg.src = avatarUrl;
        previewImg.style.display = 'block';
        placeholderSpan.style.display = 'none';
    } else {
        previewImg.src = '';
        previewImg.style.display = 'none';
        placeholderSpan.style.display = 'block';
    }
}

/**
 * Callback function to set player avatar.
 * @param {number} playerNum - The player number (1 or 2).
 * @param {string} avatarUrl - The URL of the selected avatar.
 */
export function selectAvatar(playerNum, avatarUrl) {
    playerData[playerNum].avatar = avatarUrl;
    localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum]));
    // The preview and title will be updated by updateLayout when it's called after selection/modal close.
    updateLayout();
}

/**
 * Handles the confirmation of a player's name.
 * @param {number} playerNum - The player number (1 or 2).
 */
export function confirmName(playerNum) {
    const input = document.getElementById(`player${playerNum}-name`);
    const name = input.value.trim();
    
    if (!name) {
        alert('Please enter a name!');
        return;
    }
    
    playerData[playerNum].name = name;

    // If no avatar selected, pick a random one
    if (!playerData[playerNum].avatar) {
        playerData[playerNum].avatar = getRandomElement(AVATAR_SVGS);
    }
    
    localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum])); // Save state after name confirmation
    
    // Update layout based on the new name confirmed state
    updateLayout(false); // Pass false to prevent turn switch on name confirm
}

/**
 * Resets a player's fantasy data and UI.
 * @param {number} playerNum - The player number (1 or 2).
 */
export function resetPlayer(playerNum) {
    playerData[playerNum] = { 
        name: '', 
        avatar: null, // Reset avatar as well
        team: null, 
        draftedPlayers: [], 
        rosterSlots: {
            QB: null, RB: null, WR1: null, WR2: null, TE: null, Flex: null, DEF: null, K: null
        },
        isSetupStarted: false // Reset this flag on full reset
    };
    
    localStorage.removeItem(`fantasyTeam_${playerNum}`);
    
    // If both players are reset, also reset the shared game state
    if (!playerData[1].name && !playerData[2].name) {
        resetGameState();
    }
    
    // Clear input values
    const nameInput = document.getElementById(`player${playerNum}-name`);
    if (nameInput) {
        nameInput.value = '';
    }
    
    // Reset player title to default "Player X" and remove avatar
    updateLayout();
}