/**
 * game.js
 * Contains the core game logic, state management, and orchestration of UI and API interactions.
 */

// Import from new modular files
import { gameState, playerData, isFantasyRosterFull, isPlayerPositionUndraftable, switchTurn, setGamePhase, updateLocalPlayerData } from './playerState.js';
import { getOrCreateChild, updatePlayerContentDisplay, displayDraftInterface, displayFantasyRoster, renderPlayerAvatar } from './uiRenderer.js';
import { showSlotSelectionModal, hideSlotSelectionModal, hideRosterModal, showPlayerStatsModal, hidePlayerStatsModal, renderPlayerStatsInModal, showAvatarSelectionModal, hideAvatarSelectionModal } from './uiModals.js';
import { confirmName, selectAvatar, updateAvatarPreview, AVATAR_SVGS, resetPlayer } from './playerActions.js';
import { selectTeam, autoDraft, draftPlayer } from './gameFlow.js';

// Import API functions
import { getTank01PlayerID, fetchLastGameStats } from './api.js';

// Import static data
import { teams } from './data.js'; 

// NEW: Import Firebase
import { db } from './firebase.js';
import { ref, onValue, set, get, update, onDisconnect, serverTimestamp } from "firebase/database";

// NEW: Global variables for multiplayer
export let gameMode = 'local';
export function setGameMode(mode) {
    if (mode === 'local' || mode === 'multiplayer') {
        gameMode = mode;
    } else {
        console.warn(`Invalid game mode: ${mode}`);
    }
}

let roomId = null;
let localPlayerNum = null;
let gameRef = null;
let playerRef = null;
let isSyncing = false; // Flag to prevent feedback loops

/**
 * NEW: Sync local state with Firebase.
 * This function is the single point of truth for updating the remote state.
 */
async function syncWithFirebase() {
    if (gameMode !== 'multiplayer' || !gameRef) return;
    
    isSyncing = true; // Prevent onValue listener from re-triggering actions
    console.log("Syncing to Firebase:", { gameState, playerData });
    try {
        // Use update instead of set to avoid erasing the 'players' node.
        await update(gameRef, {
            gameState: { ...gameState },
            playerData: { ...playerData }
        });
    } catch (error) {
        console.error("Firebase sync failed:", error);
    } finally {
        // Use a short timeout to ensure the write has time to propagate before we listen again
        setTimeout(() => { isSyncing = false; }, 200);
    }
}

/**
 * Utility function to open player stats modal, acting as a bridge.
 * This is needed because `displayFantasyRoster` in `uiRenderer.js` requires a callback,
 * and that callback needs to pass `getTank01PlayerID` and `fetchLastGameStats` (from `api.js`)
 * and `renderPlayerStatsInModal` (from `uiModals.js`) to `showPlayerStatsModal`.
 * @param {object} playerObj - The player object from the fantasy roster.
 */
function openPlayerStatsModalCaller(playerObj) {
    showPlayerStatsModal(playerObj, teams, getTank01PlayerID, fetchLastGameStats, renderPlayerStatsInModal);
}

/**
 * Fetches and displays fantasy points for all players in a roster.
 * This is called when both rosters are full or on initial load for full rosters.
 * @param {number} playerNum - The player number (1 or 2).
 */
async function fetchAndDisplayPlayerFantasyPoints(playerNum) {
    const playerRoster = playerData[playerNum].rosterSlots;
    const rosterSlotsOrder = ['QB', 'RB', 'WR1', 'WR2', 'TE', 'Flex', 'DEF', 'K'];

    for (const slotId of rosterSlotsOrder) {
        const playerInSlot = playerRoster[slotId];
        if (playerInSlot && playerInSlot.fantasyPoints === null) {
            let playerNameForTank01 = playerInSlot.displayName;
            if (playerInSlot.originalPosition === 'DEF') {
                const team = teams.find(t => t.id === playerInSlot.id.split('-')[1]);
                if (team) {
                    playerNameForTank01 = `${team.name} Defense`;
                }
            }

            const tank01PlayerID = await getTank01PlayerID(playerNameForTank01);
            if (tank01PlayerID) {
                const result = await fetchLastGameStats(tank01PlayerID);
                playerInSlot.fantasyPoints = result ? result.fantasyPoints : 'N/A';
                playerInSlot.statsData = result ? result.stats : null;
            } else {
                playerInSlot.fantasyPoints = 'N/A';
                playerInSlot.statsData = null;
            }
            localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum]));
            // Re-render the fantasy roster after each player's points are fetched
            displayFantasyRoster(playerNum, playerData[playerNum], teams, isFantasyRosterFull(playerNum), openPlayerStatsModalCaller); 
        }
    }
}

/**
 * Function to handle adding Player 2, typically called by a button.
 */
function addPlayer2() {
    // This function is now obsolete with the new flow but kept to prevent errors if called.
    console.log("addPlayer2 is obsolete and should not be called.");
}

/**
 * NEW: Wraps a player action with Firebase sync.
 * @param {function} actionFn - The async function to execute (e.g., selectTeam).
 * @returns {function} A new function that calls the original and then syncs.
 */
function sanitizeForFirebase(obj) {
    if (Array.isArray(obj)) {
        return obj.map(sanitizeForFirebase);
    } else if (obj && typeof obj === 'object') {
        const cleanObj = {};
        for (const [key, value] of Object.entries(obj)) {
            // Skip illegal keys for Firebase
            if (/[\.\#\$\[\]\/]/.test(key)) continue;
            cleanObj[key] = sanitizeForFirebase(value);
        }
        return cleanObj;
    }
    return obj;
}

export function withFirebaseSync(actionFn, { switchOnComplete = false } = {}) {
    return async (...args) => {
        const playerNum = args[0];

        if (gameMode === 'multiplayer') {
            if (playerNum !== localPlayerNum) return;

            const isDraftingAction = [
                'selectTeam',
                'autoDraft',
                'draftPlayer',
                'assignPlayerToSlot'
            ].includes(actionFn.name);

            if (isDraftingAction && localPlayerNum !== gameState.currentPlayer) {
                alert("It's not your turn!");
                return;
            }
        }

        await actionFn(...args);

        if (switchOnComplete) {
            const bothFull = isFantasyRosterFull(1) && isFantasyRosterFull(2);
            if (!bothFull) {
                console.log(`[withFirebaseSync] Switching turn from Player ${gameState.currentPlayer}`);
                switchTurn();
            } else {
                console.log(`[withFirebaseSync] Both rosters full — setting phase to COMPLETE`);
                setGamePhase('COMPLETE');
            }
        }

        try {
            await update(gameRef, {
                playerData: sanitizeForFirebase(playerData),
                gameState: sanitizeForFirebase(gameState)
            });
        } catch (err) {
            console.error("Firebase sync failed:", err);
        }
    };
}




/**
 * Initializes the application on DOMContentLoaded.
 * Sets up event listeners and loads saved data.
 */
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room');
    gameMode = roomId ? 'multiplayer' : 'local';

    if (gameMode === 'multiplayer') {
        await setupMultiplayerGame();
    } else {
        setupLocalGame();
    }
});

function setupLocalGame() {
  console.log("Setting up LOCAL game.");

  // You have duplicate resets — keep only one pair
  resetPlayer(1);
  resetPlayer(2);

  // Use the wrapper even in local mode
  document.getElementById('player1-name-confirm-btn').addEventListener('click', () => withFirebaseSync(confirmName)(1));
  document.getElementById('player1-select-team-btn').addEventListener('click', () => withFirebaseSync(selectTeam)(1));
  document.getElementById('player1-auto-draft-btn').addEventListener('click', () => withFirebaseSync(autoDraft)(1));
  document.getElementById('player1-reset-btn').addEventListener('click', () => withFirebaseSync(resetPlayer)(1));

  document.getElementById('player2-name-confirm-btn').addEventListener('click', () => withFirebaseSync(confirmName)(2));
  document.getElementById('player2-select-team-btn').addEventListener('click', () => withFirebaseSync(selectTeam)(2));
  document.getElementById('player2-auto-draft-btn').addEventListener('click', () => withFirebaseSync(autoDraft)(2));
  document.getElementById('player2-reset-btn').addEventListener('click', () => withFirebaseSync(resetPlayer)(2));

  initializeCommonListeners();
  updateLayout();
}

async function setupMultiplayerGame() {
    console.log(`Setting up MULTIPLAYER game for room: ${roomId}`);
    gameRef = ref(db, `games/${roomId}`);
    const clientId = getOrCreateClientId();

    const snapshot = await get(gameRef);
    if (!snapshot.exists()) {
        alert("Game room not found! It may have expired or the link is incorrect.");
        window.location.href = 'index.html';
        return;
    }

    const gameData = snapshot.val();
    const playersNode = gameData.players || {};

    if (!playersNode.player1 || playersNode.player1.clientId === clientId) {
        localPlayerNum = 1;
        playerRef = ref(db, `games/${roomId}/players/player1`);
        // Use update to avoid removing other player's presence
        await update(ref(db, `games/${roomId}/players`), { player1: { clientId: clientId, connected: true, lastSeen: serverTimestamp() } });
    } else if (!playersNode.player2 || playersNode.player2.clientId === clientId) {
        localPlayerNum = 2;
        playerRef = ref(db, `games/${roomId}/players/player2`);
        await update(ref(db, `games/${roomId}/players`), { player2: { clientId: clientId, connected: true, lastSeen: serverTimestamp() } });
    } else {
        alert("This game room is full!");
        window.location.href = 'index.html';
        return;
    }
    
    await onDisconnect(playerRef).update({ connected: false });

    console.log(`You are Player ${localPlayerNum}`);
    
    // Update share link UI
    document.getElementById('share-link-container').style.display = 'flex';
    const shareLinkInput = document.getElementById('share-link-input');
    shareLinkInput.value = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    document.getElementById('copy-link-btn').addEventListener('click', () => {
        shareLinkInput.select();
        navigator.clipboard.writeText(shareLinkInput.value);
        document.getElementById('copy-link-btn').textContent = 'Copied!';
    });

    onValue(gameRef, (snapshot) => {
        if (isSyncing) return; // Ignore updates that we initiated
        const remoteData = snapshot.val();
        if (remoteData) {
            console.log("Received data from Firebase:", remoteData);
            // Deep copy to avoid mutation issues
            Object.assign(gameState, JSON.parse(JSON.stringify(remoteData.gameState || {})));
            // Safely update player data using the new helper function
            updateLocalPlayerData(remoteData.playerData);
            // NEW: Pass the players presence node to updateLayout
            updateLayout(remoteData.players);
        }
    });
    
    // Wrap actions with Firebase sync logic
    // CRITICAL FIX: The action is for player 1, not necessarily the local player.
    document.getElementById('player1-name-confirm-btn').addEventListener('click', () => withFirebaseSync(confirmName)(1));
    document.getElementById('player1-select-team-btn').addEventListener('click', () => withFirebaseSync(selectTeam)(1));
    document.getElementById('player1-auto-draft-btn').addEventListener('click', () => withFirebaseSync(autoDraft)(1));
    document.getElementById('player1-reset-btn').addEventListener('click', () => withFirebaseSync(resetPlayer)(1));

    // CRITICAL FIX: The action is for player 2.
    document.getElementById('player2-name-confirm-btn').addEventListener('click', () => withFirebaseSync(confirmName)(2));
    document.getElementById('player2-select-team-btn').addEventListener('click', () => withFirebaseSync(selectTeam)(2));
    document.getElementById('player2-auto-draft-btn').addEventListener('click', () => withFirebaseSync(autoDraft)(2));
    document.getElementById('player2-reset-btn').addEventListener('click', () => withFirebaseSync(resetPlayer)(2));
    
    initializeCommonListeners();
}

function initializeCommonListeners() {
    // Attach event listener for the new Add Player 2 button
    document.getElementById('add-player2-btn').addEventListener('click', addPlayer2);

    // Attach event listeners for modals (using IDs for direct access)
    document.querySelector('.close-roster').addEventListener('click', hideRosterModal); 
    document.querySelector('.cancel-slot-selection').addEventListener('click', hideSlotSelectionModal);
    document.querySelector('.close-stats').addEventListener('click', hidePlayerStatsModal);
    document.querySelector('.close-avatar-modal').addEventListener('click', hideAvatarSelectionModal); 

    // Handle outside clicks for modals
    window.addEventListener('click', (event) => {
        const rosterModal = document.getElementById('roster-modal');
        const statsModal = document.getElementById('player-stats-modal');
        const slotModal = document.getElementById('slot-selection-modal');
        const avatarModal = document.getElementById('avatar-selection-modal'); 

        if (event.target === rosterModal) {
            hideRosterModal(); 
        }
        if (event.target === statsModal) {
            hidePlayerStatsModal();
        }
        if (event.target === slotModal) { 
            hideSlotSelectionModal();
        }
        if (event.target === avatarModal) { 
            hideAvatarSelectionModal();
        }
    });

    // Add click listener to avatar previews to open the avatar selection modal
    document.getElementById('player1-avatar-preview').addEventListener('click', () => {
        if (gameMode === 'multiplayer' && localPlayerNum !== 1) return;
        showAvatarSelectionModal(1, playerData[1].avatar, AVATAR_SVGS, (pNum, avatarUrl) => gameMode === 'multiplayer' ? withFirebaseSync(selectAvatar)(pNum, avatarUrl) : selectAvatar(pNum, avatarUrl));
    });
    document.getElementById('player2-avatar-preview').addEventListener('click', () => {
        if (gameMode === 'multiplayer' && localPlayerNum !== 2) return;
        showAvatarSelectionModal(2, playerData[2].avatar, AVATAR_SVGS, (pNum, avatarUrl) => gameMode === 'multiplayer' ? withFirebaseSync(selectAvatar)(pNum, avatarUrl) : selectAvatar(pNum, avatarUrl));
    });

    // Load saved data for both players and initialize playerData structure
    // In multiplayer, this is overwritten by Firebase, but useful for local mode.
    if (gameMode === 'local') {
        [1, 2].forEach(playerNum => {
            const savedData = localStorage.getItem(`fantasyTeam_${playerNum}`);
            
            // Ensure playerData structure is correctly initialized, filling in missing fields for old saves
            if (savedData) {
                const parsed = JSON.parse(savedData);
                playerData[playerNum] = { 
                    name: parsed.name || '', 
                    avatar: parsed.avatar || null, 
                    team: parsed.team || null, 
                    draftedPlayers: parsed.draftedPlayers || [], 
                    rosterSlots: parsed.rosterSlots || {
                        QB: null, RB: null, WR1: null, WR2: null, TE: null, Flex: null, DEF: null, K: null
                    },
                    isSetupStarted: parsed.isSetupStarted || false 
                };

                // Ensure fantasyPoints and statsData field is initialized for loaded players if not present (for old saves)
                for (const slot in playerData[playerNum].rosterSlots) {
                    if (playerData[playerNum].rosterSlots[slot] && playerData[playerNum].rosterSlots[slot].fantasyPoints === undefined) {
                        playerData[playerNum].rosterSlots[slot].fantasyPoints = null;
                        playerData[playerNum].rosterSlots[slot].statsData = null;
                    }
                }
            } else {
                // If no saved data, ensure base player data is set (it's already set by default export, but explicit is good)
                playerData[playerNum] = { 
                    name: '', avatar: null, team: null, draftedPlayers: [], 
                    rosterSlots: { QB: null, RB: null, WR1: null, WR2: null, TE: null, Flex: null, DEF: null, K: null },
                    isSetupStarted: false
                };
            }
            
            // Populate name input field from loaded data
            document.getElementById(`player${playerNum}-name`).value = playerData[playerNum].name;

            // Note: No direct style.display manipulation here. updateLayout will handle it.
        });
    }
    
    // Call updateLayout AFTER all saved data is loaded to set initial UI state correctly
    updateLayout(); 
}

function getOrCreateClientId() {
    let clientId = sessionStorage.getItem('nfl-slots-clientId');
    if (!clientId) {
        clientId = `client_${Math.random().toString(36).substring(2, 10)}`;
        sessionStorage.setItem('nfl-slots-clientId', clientId);
    }
    return clientId;
}

/**
 * Updates the main layout of the application (single player view vs. two-player view)
 * and the internal display of each player section (name input vs. team display, draft vs. fantasy roster).
 * @param {boolean} shouldSwitchTurn - Whether to switch the current player turn.
 * @param {object} [playersPresence={}] - The presence object for multiplayer from Firebase.
 */
export function updateLayout(playersPresence = {}) {
    // Check game phase transition
    if (
        gameState.phase === 'NAME_ENTRY' &&
        playerData[1]?.name &&
        playerData[2]?.name
    ) {
        setGamePhase('DRAFTING');
    }

    if (isFantasyRosterFull(1) && isFantasyRosterFull(2)) {
        setGamePhase('COMPLETE');
    }

    const playersContainer = document.querySelector('.players-container');
    playersContainer.classList.add('two-player-view');
    playersContainer.classList.remove('single-player-view');

    document.getElementById('add-player2-btn').style.display = 'none';

    // Multiplayer status UI
    const multiplayerStatusBox = document.getElementById('multiplayer-status-box');
    if (gameMode === 'multiplayer') {
        multiplayerStatusBox.style.display = 'block';
        const statusText = document.getElementById('multiplayer-status-text');
        const bothPlayersConnected =
            playersPresence?.player1?.connected &&
            playersPresence?.player2?.connected;

        if (playerData[1].name && playerData[2].name) {
            statusText.textContent = 'Game is on! Good luck!';
            multiplayerStatusBox.classList.add('game-ready');
            document.getElementById('share-link-container').style.display = 'none';
        } else if (bothPlayersConnected) {
            statusText.textContent = 'Opponent connected! Set your names to begin.';
            multiplayerStatusBox.classList.add('opponent-connected');
            multiplayerStatusBox.classList.remove('game-ready');
            document.getElementById('share-link-container').style.display = 'none';
        } else {
            statusText.textContent = 'Waiting for opponent to join...';
            multiplayerStatusBox.classList.remove('game-ready', 'opponent-connected');
            document.getElementById('share-link-container').style.display = 'flex';
        }
    }

    // Update each player UI
    [1, 2].forEach(playerNum => {
        if (!playerData[playerNum]) {
            console.warn(`playerData for player ${playerNum} is missing. Skipping layout update.`);
            return;
        }

        const playerSection = document.getElementById(`player${playerNum}-section`);
        const nameInputContainer = playerSection.querySelector('.name-input-container');
        const playerDisplayDiv = document.getElementById(`player${playerNum}-display`);
        const playerLogoEl = document.getElementById(`player${playerNum}-logo`);
        const playerContentArea = document.getElementById(`player${playerNum}-content-area`);
        const isCurrentPlayerRosterFull = isFantasyRosterFull(playerNum);
        const readyMessageEl = document.getElementById(`player${playerNum}-ready-message`);

        // Handle NAME_ENTRY vs DRAFTING/COMPLETE phases
        if (gameState.phase === 'NAME_ENTRY') {
            playerSection.classList.remove('active-turn', 'inactive-turn');
            playerDisplayDiv.style.display = 'none';

            if (playerData[playerNum].name) {
                nameInputContainer.style.display = 'none';
                readyMessageEl.textContent = `${playerData[playerNum].name} is ready`;
                readyMessageEl.style.display = 'block';
                renderPlayerAvatar(playerNum, playerData[playerNum].name, playerData[playerNum].avatar);
            } else {
                nameInputContainer.style.display = 'flex';
                readyMessageEl.style.display = 'none';
                renderPlayerAvatar(playerNum, `Player ${playerNum}`, null);
            }
        } else {
            nameInputContainer.style.display = 'none';
            readyMessageEl.style.display = 'none';
            playerDisplayDiv.style.display = 'block';

            renderPlayerAvatar(playerNum, playerData[playerNum].name, playerData[playerNum].avatar);

            // 🔹 Always visually show whose turn it is
            const isMyTurn = playerNum === gameState.currentPlayer;
            if (isMyTurn) {
                playerSection.classList.add('active-turn');
                playerSection.classList.remove('inactive-turn');
            } else {
                playerSection.classList.add('inactive-turn');
                playerSection.classList.remove('active-turn');
            }

            // 🔹 Disable controls for non-local player in multiplayer
            if (gameMode === 'multiplayer' && playerNum !== localPlayerNum) {
                disablePlayerControls(playerNum);
            } else {
                enablePlayerControls(playerNum);
            }

            // Logo and team name logic
            if (isCurrentPlayerRosterFull && playerData[playerNum].avatar) {
                playerLogoEl.src = playerData[playerNum].avatar;
                playerLogoEl.alt = `${playerData[playerNum].name}'s avatar`;
                playerLogoEl.classList.add('is-avatar');
                document.getElementById(`player${playerNum}-team-name`).textContent =
                    `${playerData[playerNum].name}'s Roster`;
            } else if (playerData[playerNum].team?.id) {
                playerLogoEl.src = playerData[playerNum].team.logo;
                playerLogoEl.alt = `${playerData[playerNum].team.name} logo`;
                playerLogoEl.classList.remove('is-avatar');
                document.getElementById(`player${playerNum}-team-name`).textContent =
                    playerData[playerNum].team.name;

                if (playerData[playerNum].team.rosterData && playerData[playerNum].draftedPlayers.length === 0) {
                    const otherPlayerNum = playerNum === 1 ? 2 : 1;
                    displayDraftInterface(
                        playerNum,
                        playerData[playerNum].team.rosterData,
                        playerData[playerNum],
                        playerData[otherPlayerNum],
                        isFantasyRosterFull,
                        isPlayerPositionUndraftable,
                        draftPlayer
                    );
                } else {
                    const inlineRosterEl = getOrCreateChild(playerContentArea, 'inline-roster');
                    inlineRosterEl.innerHTML = '';
                }
            } else if (playerData[playerNum].avatar) {
                playerLogoEl.src = playerData[playerNum].avatar;
                playerLogoEl.alt = `${playerData[playerNum].name}'s avatar`;
                playerLogoEl.classList.add('is-avatar');
                document.getElementById(`player${playerNum}-team-name`).textContent = 'Select your team!';
            } else {
                playerLogoEl.src = '';
                playerLogoEl.alt = '';
                playerLogoEl.classList.remove('is-avatar');
                document.getElementById(`player${playerNum}-team-name`).textContent = 'Select your team!';
            }

            // Always show fantasy roster
            displayFantasyRoster(playerNum, playerData[playerNum], teams, isCurrentPlayerRosterFull, openPlayerStatsModalCaller);
            updatePlayerContentDisplay(playerNum, playerData[playerNum], isFantasyRosterFull);

            if (isCurrentPlayerRosterFull) {
                fetchAndDisplayPlayerFantasyPoints(playerNum);
            }
        }

        updateAvatarPreview(playerNum, playerData[playerNum].avatar);
    });
}
