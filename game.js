/**
 * game.js
 * Contains the core game logic, state management, and orchestration of UI and API interactions.
 */

// Import from new modular files
import { gameState, playerData, isFantasyRosterFull, isPlayerPositionUndraftable, switchTurn, setGamePhase, updateLocalPlayerData } from './playerState.js';
import { getOrCreateChild, updatePlayerContentDisplay, displayDraftInterface, displayFantasyRoster, renderPlayerAvatar } from './uiRenderer.js';
import { showSlotSelectionModal, hideSlotSelectionModal, hideRosterModal, showPlayerStatsModal, hidePlayerStatsModal, renderPlayerStatsInModal, showAvatarSelectionModal, hideAvatarSelectionModal } from './uiModals.js';
import { confirmName, selectAvatar, updateAvatarPreview, AVATAR_SVGS } from './playerActions.js';
import { selectTeam, autoDraft, draftPlayer, autoDraftFullRoster } from './gameFlow.js';

// Import API functions
import { getTank01PlayerID, fetchLastGameStats, fetchLastTeamGame } from './api.js';

// Import static data
import { teams } from './data.js'; 
// Import utility functions
import { getOpponentAndVenue, formatGameDate } from './utils.js';

// NEW: Import Firebase
import { db } from './firebase.js';
import { ref, onValue, set, get, update, onDisconnect, serverTimestamp } from "firebase/database";

// NEW: Global variables for multiplayer
let gameMode = 'local';
let roomId = null;
let localPlayerNum = null;
let gameRef = null;
let playerRef = null;
let isSyncing = false; // Flag to prevent feedback loops
let fantasyPointInterval = null; // NEW: To hold the setInterval for point updates

/**
 * NEW: Sync local state with Firebase.
 * This function is the single point of truth for updating the remote state.
 */
async function syncWithFirebase() {
     if (gameMode !== 'multiplayer' || !gameRef) return;

  isSyncing = true;
  
  // CRITICAL: Sanitize playerData before syncing to remove large, non-serializable data and undefined values.
  const sanitizedPlayerData = JSON.parse(JSON.stringify(playerData, (key, value) => {
      return value === undefined ? null : value;
  }));
  
  for (const playerNum in sanitizedPlayerData) {
      if (sanitizedPlayerData[playerNum].team && sanitizedPlayerData[playerNum].team.rosterData) {
          delete sanitizedPlayerData[playerNum].team.rosterData;
      }
  }

  console.log("SYNCING to Firebase:", { gameState, playerData: sanitizedPlayerData });

  try {
    // Always sync the full game state and player data to ensure consistency
    await update(gameRef, {
      gameState: { ...gameState },
      playerData: sanitizedPlayerData
    });
  } catch (error) {
    console.error("Firebase sync failed:", error);
  } finally {
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
 * NEW: Fetches and updates fantasy points for a single player's roster.
 * This is designed to be called repeatedly for live updates.
 * @param {number} playerNum - The player number (1 or 2).
 * @returns {Promise<boolean>} A promise that resolves to true if any points were updated.
 */
async function updateFantasyPointsForPlayer(playerNum) {
    const playerRoster = playerData[playerNum].rosterSlots;
    if (!playerRoster) return false;

    let pointsUpdated = false;
    const rosterSlotsOrder = ['QB', 'RB', 'WR1', 'WR2', 'TE', 'Flex', 'DEF', 'K'];

    for (const slotId of rosterSlotsOrder) {
        const playerInSlot = playerRoster[slotId];
        if (playerInSlot) { // Fetch for any drafted player
            let playerNameForTank01 = playerInSlot.displayName;
            if (playerInSlot.originalPosition === 'DEF') {
                const team = teams.find(t => t.id === playerInSlot.id.split('-')[1]);
                playerNameForTank01 = team ? `${team.name} Defense` : playerNameForTank01;
            }

            const tank01PlayerID = await getTank01PlayerID(playerNameForTank01);
            let newFantasyPoints = 'N/A';
            let newStatsData = null;

            if (tank01PlayerID) {
                const result = await fetchLastGameStats(tank01PlayerID);
                if (result && result.stats) {
                    newStatsData = result.stats;
                    const fantasyPointsRaw = result.fantasyPoints;

                    if (playerInSlot.originalPosition === 'DEF') {
                        newFantasyPoints = fantasyPointsRaw;
                    } else {
                        const gameDate = formatGameDate(result.stats.gameID);
                        const { opponent } = getOpponentAndVenue(result.stats);
                        const scheduleGame = await fetchLastTeamGame(result.stats.teamAbv, tank01PlayerID);
                        let teamGame = result.stats;
                        if (scheduleGame && scheduleGame.gameID && scheduleGame.gameID.localeCompare(result.stats.gameID) > 0) {
                            teamGame = scheduleGame;
                        }
                        const teamGameDate = formatGameDate(teamGame.gameID);
                        const { opponent: teamOpp } = getOpponentAndVenue(teamGame, result.stats.teamAbv);
                        newFantasyPoints = (opponent !== teamOpp || gameDate !== teamGameDate) ? 0 : fantasyPointsRaw;
                    }
                }
            }
            // Check if the points have actually changed before marking as updated
            if (playerInSlot.fantasyPoints !== newFantasyPoints) {
                playerInSlot.fantasyPoints = newFantasyPoints;
                playerInSlot.statsData = newStatsData;
                pointsUpdated = true;
            }
        }
    }
    return pointsUpdated;
}


/**
 * Fetches and displays fantasy points for all players in a roster.
 * This is called when both rosters are full or on initial load for full rosters.
 * @param {number} playerNum - The player number (1 or 2).
 */
async function fetchAndDisplayPlayerFantasyPoints(playerNum) {
    // This function is now a wrapper around the new update function.
    const updated = await updateFantasyPointsForPlayer(playerNum);
    if (updated) {
        // If points were updated, save to local storage (for local games) and re-render.
        localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum]));
        displayFantasyRoster(playerNum, playerData[playerNum], teams, isFantasyRosterFull(playerNum), openPlayerStatsModalCaller);
    }
}

/**
 * NEW: Wraps a player action with Firebase sync.
 * @param {function} actionFn - The async function to execute (e.g., selectTeam).
 * @returns {function} A new function that calls the original and then syncs.
 */
function withFirebaseSync(actionFn) {
  return async (...args) => {
    const playerNum = args[0];
    if (gameMode === 'multiplayer' && playerNum !== localPlayerNum) {
      console.warn(`Action for Player ${playerNum} blocked because you are Player ${localPlayerNum}.`);
      return;
    }

    await actionFn(...args);
    // After the action is complete, sync the state.
    await syncWithFirebase();
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
        // If this is a new game, expand the header by default on mobile.
        if (urlParams.get('new_game') === 'true') {
            const gameHeader = document.querySelector('.game-header');
            const headerToggleBtn = document.getElementById('header-toggle-btn');
            if (gameHeader) {
                gameHeader.classList.add('header-open');
            }
            if (headerToggleBtn) {
                headerToggleBtn.setAttribute('aria-expanded', 'true');
            }
        }
    } else {
        setupLocalGame();
    }
});

function setupLocalGame() {
    console.log("Setting up LOCAL game.");
    
    // On initial load for local game, clear storage to ensure a clean start.
    // This prevents loading old completed games.
    localStorage.removeItem('fantasyTeam_1');
    localStorage.removeItem('fantasyTeam_2');

    // Attach event listeners for player 1
    document.getElementById('player1-name-confirm-btn').addEventListener('click', () => confirmName(1));
    document.getElementById('player1-select-team-btn').addEventListener('click', () => selectTeam(1));
    document.getElementById('player1-auto-draft-btn').addEventListener('click', () => autoDraft(1));
    document.getElementById('player1-auto-draft-full-btn').addEventListener('click', () => autoDraftFullRoster(1));

    // Attach event listeners for player 2
    document.getElementById('player2-name-confirm-btn').addEventListener('click', () => confirmName(2));
    document.getElementById('player2-select-team-btn').addEventListener('click', () => selectTeam(2));
    document.getElementById('player2-auto-draft-btn').addEventListener('click', () => autoDraft(2));
    document.getElementById('player2-auto-draft-full-btn').addEventListener('click', () => autoDraftFullRoster(2));
    
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
    const shareLinkInput = document.getElementById('share-link-input');
    shareLinkInput.value = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    document.getElementById('copy-link-btn').addEventListener('click', () => {
        shareLinkInput.select();
        navigator.clipboard.writeText(shareLinkInput.value);
        document.getElementById('copy-link-btn').textContent = 'Copied!';
        setTimeout(() => { document.getElementById('copy-link-btn').textContent = 'Copy'; }, 2000);
    });

    onValue(gameRef, (snapshot) => {
        if (isSyncing) return; // Ignore updates that we initiated
        const remoteData = snapshot.val();
        if (remoteData) {
            // NEW: Prevent re-renders if the incoming data is the same as local state.
            // This is a simple guard against feedback loops or redundant updates.
            if (JSON.stringify(remoteData.gameState) === JSON.stringify(gameState) &&
                JSON.stringify(remoteData.playerData) === JSON.stringify(playerData)) {
                return;
            }
            console.log("Received data from Firebase:", remoteData);
            // Deep copy to avoid mutation issues
            Object.assign(gameState, JSON.parse(JSON.stringify(remoteData.gameState || {})));
            // Safely update player data using the new helper function
            updateLocalPlayerData(remoteData.playerData);
            // NEW: Pass the players presence node to updateLayout
            updateLayout(false, remoteData.players);
        }
    });
    
    // Wrap actions with Firebase sync logic
    // CRITICAL FIX: The action is for player 1, not necessarily the local player.
    document.getElementById('player1-name-confirm-btn').addEventListener('click', () => withFirebaseSync(confirmName)(1));
    document.getElementById('player1-select-team-btn').addEventListener('click', () => withFirebaseSync(selectTeam)(1));
    document.getElementById('player1-auto-draft-btn').addEventListener('click', () => withFirebaseSync(autoDraft)(1));
    document.getElementById('player1-auto-draft-full-btn').addEventListener('click', () => withFirebaseSync(autoDraftFullRoster)(1));
    
    // CRITICAL FIX: The action is for player 2.
    document.getElementById('player2-name-confirm-btn').addEventListener('click', () => withFirebaseSync(confirmName)(2));
    document.getElementById('player2-select-team-btn').addEventListener('click', () => withFirebaseSync(selectTeam)(2));
    document.getElementById('player2-auto-draft-btn').addEventListener('click', () => withFirebaseSync(autoDraft)(2));
    document.getElementById('player2-auto-draft-full-btn').addEventListener('click', () => withFirebaseSync(autoDraftFullRoster)(2));
    
    initializeCommonListeners();
}

function initializeCommonListeners() {
    // Header toggle for mobile
    const headerToggleBtn = document.getElementById('header-toggle-btn');
    const gameHeader = document.querySelector('.game-header');
    if (headerToggleBtn && gameHeader) {
        headerToggleBtn.addEventListener('click', () => {
            const isExpanded = gameHeader.classList.toggle('header-open');
            headerToggleBtn.setAttribute('aria-expanded', isExpanded);
        });
    }

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

    // NEW: Add swipe gesture for mobile view swapping
    const playersContainer = document.querySelector('.players-container');
    let touchstartX = 0;
    let touchendX = 0;
    const swipeThreshold = 50; // minimum distance for a swipe in pixels
    let isTouchingFilterBar = false; // Flag to prevent panel swipe when scrolling filters

    function handleSwipe() {
        if (window.innerWidth > 768) return; // Only for mobile devices

        // If the swipe started on the filter bar, do not trigger panel swipe
        if (isTouchingFilterBar) {
            isTouchingFilterBar = false; // Reset for next touch
            return;
        }

        const swipeDistance = touchendX - touchstartX;

        if (Math.abs(swipeDistance) < swipeThreshold) {
            return; // Ignore clicks and short swipes
        }

        if (swipeDistance < 0) { // Swiped left
            if (playersContainer.classList.contains('view-p1')) {
                playersContainer.classList.remove('view-p1');
                playersContainer.classList.add('view-p2');
            }
        } else { // Swiped right
            if (playersContainer.classList.contains('view-p2')) {
                playersContainer.classList.remove('view-p2');
                playersContainer.classList.add('view-p1');
            }
        }
    }

    playersContainer.addEventListener('touchstart', e => {
        touchstartX = e.changedTouches[0].screenX;
        // Check if the touch event originated within a filter bar
        if (e.target.closest('.position-filter-bar')) {
            isTouchingFilterBar = true;
        } else {
            isTouchingFilterBar = false;
        }
    }, { passive: true });

    playersContainer.addEventListener('touchend', e => {
        touchendX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });

    // NEW: Add click listeners for mobile view swapping
    const playersContainerMobile = document.querySelector('.players-container');
    document.querySelectorAll('.swap-view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent clicks bubbling up
            const targetPlayer = btn.dataset.target;
            
            // Toggle the view
            if (playersContainerMobile.classList.contains(`view-p${targetPlayer}`)) {
                // If we are already viewing the target, do nothing (or switch back, but this is simpler)
            } else {
                playersContainerMobile.classList.remove('view-p1', 'view-p2');
                playersContainerMobile.classList.add(`view-p${targetPlayer}`);
            }
        });
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
export function updateLayout(shouldSwitchTurn = false, playersPresence = {}) {
    const playersContainer = document.querySelector('.players-container');
    // Check game phase transition
    if (gameState.phase === 'NAME_ENTRY' && playerData[1].name && playerData[2].name) {
        setGamePhase('DRAFTING');
    }

    if (shouldSwitchTurn && gameState.phase === 'DRAFTING') {
        const otherPlayerNum = gameState.currentPlayer === 1 ? 2 : 1;
        // If the other player's roster is NOT full, then it's their turn.
        // If it IS full, the current player keeps their turn (no switch).
        if (!isFantasyRosterFull(otherPlayerNum)) {
            // In multiplayer, only the current player can switch the turn
            if (gameMode !== 'multiplayer' || localPlayerNum === gameState.currentPlayer) {
                switchTurn(syncWithFirebase);
            } else if (gameMode === 'local') {
                switchTurn();
            }
        }
    }
    
    const areBothRostersFull = isFantasyRosterFull(1) && isFantasyRosterFull(2);
    if (areBothRostersFull && gameState.phase !== 'COMPLETE') {
        setGamePhase('COMPLETE');
        // NEW: Explicitly sync when the game is marked as complete.
        if (gameMode === 'multiplayer') {
            // Use a small delay to allow the last action's sync to potentially complete,
            // preventing race conditions, then force a final sync.
            setTimeout(syncWithFirebase, 300);
        }
    }

    // NEW: Start fetching fantasy points periodically when the game is complete (or rosters are full)
    if (gameState.phase === 'COMPLETE' && !fantasyPointInterval && gameMode === 'multiplayer') {
        console.log("STARTING FANTASY POINT POLLING");
        fantasyPointInterval = setInterval(async () => {
            console.log("Polling for fantasy points...");
            // Only the "host" (player 1) should be responsible for fetching to avoid duplicate API calls.
            if (localPlayerNum === 1) {
                const p1Updated = await updateFantasyPointsForPlayer(1);
                const p2Updated = await updateFantasyPointsForPlayer(2);
                if (p1Updated || p2Updated) {
                    console.log("Points changed, syncing...");
                    await syncWithFirebase();
                }
            }
        }, 30000); // Poll every 30 seconds
    } else if (gameState.phase !== 'COMPLETE' && fantasyPointInterval) {
        // Clear interval if game resets
        clearInterval(fantasyPointInterval);
        fantasyPointInterval = null;
    }

    // NEW: Add/remove drafting-phase class for mobile layout
    if (gameState.phase === 'DRAFTING' || gameState.phase === 'COMPLETE') {
        playersContainer.classList.add('drafting-phase');
    } else {
        playersContainer.classList.remove('drafting-phase');
    }

    // NEW: Set initial mobile view based on whose turn it is
    if (window.innerWidth <= 768 && (gameState.phase === 'DRAFTING' || gameState.phase === 'COMPLETE')) {
        if (shouldSwitchTurn) { // Only snap on turn switch
            playersContainer.classList.remove('view-p1', 'view-p2');
            playersContainer.classList.add(`view-p${gameState.currentPlayer}`);
        } else if (!playersContainer.classList.contains('view-p1') && !playersContainer.classList.contains('view-p2')) {
            // On initial load of drafting phase, set to player 1's view
            playersContainer.classList.add('view-p1');
        }
    }

    // NEW: Update multiplayer status UI
    const multiplayerStatusBox = document.getElementById('multiplayer-status-box');
    if (gameMode === 'multiplayer') {
        multiplayerStatusBox.style.display = 'block';
        const statusText = document.getElementById('multiplayer-status-text');
        const bothPlayersConnected = playersPresence?.player1?.connected && playersPresence?.player2?.connected;

        if (playerData[1].name && playerData[2].name) {
            statusText.textContent = 'Game is on! Good luck!';
            multiplayerStatusBox.className = 'game-ready';
            document.getElementById('share-link-container').style.display = 'none';
        } else if (bothPlayersConnected) {
            statusText.textContent = 'Opponent connected! Set your names to begin.';
            multiplayerStatusBox.className = 'opponent-connected';
            document.getElementById('share-link-container').style.display = 'none';
        } else {
            statusText.textContent = 'Waiting for opponent to join...';
            multiplayerStatusBox.className = '';
            document.getElementById('share-link-container').style.display = 'flex';
        }
    }

    // NEW: Manage drafting view at a higher level to prevent conflicts.
    playersContainer.classList.remove('drafting-view', 'p1-drafting', 'p2-drafting'); // Reset first

    const p1Data = playerData[1];
    const p2Data = playerData[2];

    if (p1Data && p1Data.team && p1Data.draftedPlayers.length === 0) {
        playersContainer.classList.add('drafting-view', 'p1-drafting');
    } else if (p2Data && p2Data.team && p2Data.draftedPlayers.length === 0) {
        playersContainer.classList.add('drafting-view', 'p2-drafting');
    }

    // Update internal display for each player section based on their individual state
    [1, 2].forEach(playerNum => {
        // NEW: Add a guard to ensure player data exists before proceeding.
        if (!playerData[playerNum]) {
            console.warn(`playerData for player ${playerNum} is missing. Skipping layout update for this player.`);
            return;
        }

        const playerSection = document.getElementById(`player${playerNum}-section`);
        const nameInputContainer = document.querySelector(`#player${playerNum}-section .name-input-container`);
        const playerDisplayDiv = document.getElementById(`player${playerNum}-display`);
        const playerLogoEl = document.getElementById(`player${playerNum}-logo`);
        const playerContentArea = document.getElementById(`player${playerNum}-content-area`);
        const isCurrentPlayerRosterFull = isFantasyRosterFull(playerNum);
        const readyMessageEl = document.getElementById(`player${playerNum}-ready-message`);

        const isLocalPlayer = gameMode !== 'multiplayer' || playerNum === localPlayerNum;

        // Reset all state classes first
        playerSection.classList.remove('active-turn', 'inactive-turn', 'non-local-player');
        
        // Get overlay text element
        const playerHeader = playerSection.querySelector('.player-header');
        const draftingOverlayEl = playerHeader.querySelector('.drafting-overlay .overlay-text');
        const inactiveOverlayEl = playerSection.querySelector('.inactive-overlay .overlay-text');

        // If in multiplayer and this isn't the local player's section, make it non-interactive.
        if (gameMode === 'multiplayer' && !isLocalPlayer && gameState.phase !== 'COMPLETE') {
            playerSection.classList.add('non-local-player');
        }

        // Handle visibility of name input vs team display based on whether the name is confirmed
        if (gameState.phase === 'NAME_ENTRY') {
             // In NAME_ENTRY phase, show name input or a ready message.
            playerDisplayDiv.style.display = 'none';
            if (!playerData[playerNum].name) {
                nameInputContainer.style.display = 'flex';
                readyMessageEl.style.display = 'none';
            } else {
                nameInputContainer.style.display = 'none';
                readyMessageEl.style.display = 'block';
                readyMessageEl.textContent = 'Ready! Waiting for opponent...';
            }
             // Update title with name if available, otherwise "Player X"
            renderPlayerAvatar(playerNum, playerData[playerNum].name || `Player ${playerNum}`, playerData[playerNum].avatar);
        } else {
            // Player HAS confirmed their name, show their game area
            nameInputContainer.style.display = 'none';
            playerDisplayDiv.style.display = 'block';
            readyMessageEl.style.display = 'none'; // No longer show "ready" message

            // Update player title with name and avatar
            renderPlayerAvatar(playerNum, playerData[playerNum].name, playerData[playerNum].avatar);

            // Set active/inactive turn status only for the local player's perspective
            if (gameState.phase === 'DRAFTING') {
                const isMyTurn = playerNum === gameState.currentPlayer;
                const activePlayerName = playerData[gameState.currentPlayer]?.name || `Player ${gameState.currentPlayer}`;

                if (isMyTurn) {
                    playerSection.classList.add('active-turn');
                    // Update overlay text for the active player's header
                    if (draftingOverlayEl) {
                        draftingOverlayEl.textContent = `DRAFTING...`;
                    }
                } else {
                    playerSection.classList.add('inactive-turn');
                     // Update overlay text for the inactive player's section
                    if (inactiveOverlayEl) {
                        inactiveOverlayEl.textContent = `${activePlayerName} is drafting...`;
                    }
                }
            }

            // Update team logo / avatar and team name
            if (isCurrentPlayerRosterFull && playerData[playerNum].avatar) {
                // If roster is full (e.g., after auto-draft), show player's avatar
                playerLogoEl.src = playerData[playerNum].avatar;
                playerLogoEl.alt = `${playerData[playerNum].name}'s avatar`;
                playerLogoEl.classList.add('is-avatar'); // Add class to invert colors
                document.getElementById(`player${playerNum}-team-name`).textContent = `${playerData[playerNum].name}'s Roster`;
                
                if (playerData[playerNum].team && playerData[playerNum].team.rosterData && playerData[playerNum].draftedPlayers.length === 0) {
                    const otherPlayerNum = playerNum === 1 ? 2 : 1;
                    const opponentData = playerData[otherPlayerNum];
                    const draftCallback = gameMode === 'multiplayer' ? withFirebaseSync(draftPlayer) : draftPlayer;
                    displayDraftInterface(playerNum, playerData[playerNum].team.rosterData, playerData[playerNum], opponentData, isFantasyRosterFull, isPlayerPositionUndraftable, draftCallback, openPlayerStatsModalCaller);
                } else {
                    const inlineRosterEl = getOrCreateChild(playerContentArea, 'inline-roster');
                    inlineRosterEl.innerHTML = ''; 
                }

            } else if (playerData[playerNum].team && playerData[playerNum].team.id) {
                // If a team is selected (for manual drafting or just rolled a team), display team logo
                playerLogoEl.src = playerData[playerNum].team.logo;
                playerLogoEl.alt = `${playerData[playerNum].team.name} logo`;
                playerLogoEl.classList.remove('is-avatar'); // Remove class if it's a team logo
                document.getElementById(`player${playerNum}-team-name`).textContent = playerData[playerNum].team.name;
                
                if (playerData[playerNum].team.rosterData && playerData[playerNum].draftedPlayers.length === 0) {
                    const otherPlayerNum = playerNum === 1 ? 2 : 1;
                    const opponentData = playerData[otherPlayerNum];
                    const draftCallback = gameMode === 'multiplayer' ? withFirebaseSync(draftPlayer) : draftPlayer;
                    displayDraftInterface(playerNum, playerData[playerNum].team.rosterData, playerData[playerNum], opponentData, isFantasyRosterFull, isPlayerPositionUndraftable, draftCallback, openPlayerStatsModalCaller);
                } else {
                    const inlineRosterEl = getOrCreateChild(playerContentArea, 'inline-roster');
                    inlineRosterEl.innerHTML = ''; 
                }

            } else if (playerData[playerNum].avatar) {
                // If no team is selected but player has an avatar, show avatar and "Select your team!"
                playerLogoEl.src = playerData[playerNum].avatar;
                playerLogoEl.alt = `${playerData[playerNum].name}'s avatar`;
                playerLogoEl.classList.add('is-avatar');
                document.getElementById(`player${playerNum}-team-name`).textContent = 'Select your team!';
            } else { // Fallback if no avatar or team
                playerLogoEl.src = '';
                playerLogoEl.alt = '';
                playerLogoEl.classList.remove('is-avatar');
                document.getElementById(`player${playerNum}-team-name`).textContent = 'Select your team!';
            }
            
            // Render fantasy roster always if name is confirmed, it will show as empty slots if not filled
            displayFantasyRoster(playerNum, playerData[playerNum], teams, openPlayerStatsModalCaller);
            
            // This function also handles showing/hiding roll/auto-draft buttons and roster views
            updatePlayerContentDisplay(playerNum, playerData[playerNum], isFantasyRosterFull, areBothRostersFull);

            // If roster is full, fetch fantasy points
            if (isCurrentPlayerRosterFull) {
                fetchAndDisplayPlayerFantasyPoints(playerNum);
            }
        }

        // Always update avatar preview for the selection area
        updateAvatarPreview(playerNum, playerData[playerNum].avatar);
    });
}