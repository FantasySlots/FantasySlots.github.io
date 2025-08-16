/**
 * gameFlow.js
 * Contains the core game logic for team selection, drafting, and player state resets.
 */
import { gameState, playerData, isFantasyRosterFull, resetGameState, switchTurn } from './playerState.js';
import { shuffleArray, getRandomElement } from './utils.js';
import { showSlotSelectionModal, hideSlotSelectionModal } from './uiModals.js';
import { showTeamAnimationOverlay, hideTeamAnimationOverlay } from './uiAnimations.js';
import { teams } from './data.js';
import { updateLayout } from './game.js';

/**
 * Handles the process of selecting a random NFL team.
 * @param {number} playerNum - The player number (1 or 2).
 */
export async function selectTeam(playerNum) {
    if (playerNum !== gameState.currentPlayer) {
        alert("It's not your turn!");
        return;
    }
    // If roster is full, prevent new team selection or auto-draft.
    if (isFantasyRosterFull(playerNum)) {
        alert('Your fantasy roster is full! You cannot draft more players.');
        return;
    }

    // Reset current team's drafted players for a new drafting turn
    playerData[playerNum].team = null;
    playerData[playerNum].draftedPlayers = []; 
    console.log(`Player ${playerNum}: draftedPlayers reset to [] after selecting new team.`);
    
    // Clear the player content area immediately for the animation
    document.getElementById(`player${playerNum}-content-area`).innerHTML = ''; 

    showTeamAnimationOverlay('Selecting your team...', '', false); // Show animation overlay
    
    // Animate through logos
    let currentIndex = 0;
    const animationDuration = 3100; // 2.5 seconds
    const interval = 100; // Change every 100ms
    
    const animateInterval = setInterval(() => {
        const currentTeamLogo = teams[currentIndex].logo;
        showTeamAnimationOverlay('Selecting your team...', currentTeamLogo, false); // Update logo during animation
        currentIndex = (currentIndex + 1) % teams.length;
    }, interval);
    
    // Select random team after animation duration
    setTimeout(async () => {
        clearInterval(animateInterval);
        const randomTeam = teams[Math.floor(Math.random() * teams.length)];
        playerData[playerNum].team = randomTeam; 
        
        showTeamAnimationOverlay(`Selected: ${randomTeam.name}`, randomTeam.logo, false); 
        
        // Wait a bit then hide animation and update UI
        setTimeout(async () => {
            hideTeamAnimationOverlay(); 
            
            // Fetch roster and display draft interface
            try {
                const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${randomTeam.id}/roster`);
                const data = await response.json();
                
                if (data.athletes) {
                    playerData[playerNum].team.rosterData = data.athletes; 
                    localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum])); // Save state after team selection
                }
            } catch (error) {
                console.error('Error fetching roster:', error);
            }
            // Update layout based on new team selection
            updateLayout();
        }, 500);
    }, animationDuration);
}

/**
 * NEW: Helper function to find an available roster slot for a given player and their position.
 * @param {number} playerNum - The player number (1 or 2).
 * @param {object} player - The NFL player object.
 * @returns {string|null} The slot ID if available, otherwise null.
 */
function findAvailableSlotForPlayer(playerNum, player) {
    const roster = playerData[playerNum].rosterSlots;
    let position = player.position?.abbreviation || player.position?.name;
    if (position === 'PK') position = 'K';

    if (position === 'QB' && !roster.QB) return 'QB';
    if (position === 'K' && !roster.K) return 'K';
    if (position === 'DEF' && !roster.DEF) return 'DEF';
    
    if (position === 'RB') {
        if (!roster.RB) return 'RB';
        if (!roster.Flex) return 'Flex';
    }
    if (position === 'WR') {
        if (!roster.WR1) return 'WR1';
        if (!roster.WR2) return 'WR2';
        if (!roster.Flex) return 'Flex';
    }
    if (position === 'TE') {
        if (!roster.TE) return 'TE';
        if (!roster.Flex) return 'Flex';
    }
    
    return null;
}

/**
 * Handles the auto-drafting process for a player.
 * Now drafts a single random player from a random team.
 * @param {number} playerNum - The player number (1 or 2).
 */
export async function autoDraft(playerNum) {
    if (playerNum !== gameState.currentPlayer) {
        alert("It's not your turn!");
        return;
    }
    if (!playerData[playerNum].name) {
        alert('Please enter your name first!');
        return;
    }
    if (isFantasyRosterFull(playerNum)) {
        alert('Your fantasy roster is already full!');
        return;
    }

    // Show initial animation overlay
    showTeamAnimationOverlay('Auto-drafting a player...');

    const animationDuration = 3000; // 3 seconds total
    
    // Animate through player headshots while searching
    let animateInterval;
    const headshotsForAnimation = [];
    let animationTeamIndex = 0;

    const fetchHeadshotsForAnimation = async () => {
        try {
            const team = teams[animationTeamIndex % teams.length];
            const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/roster`);
            const data = await response.json();
            if (data.athletes) {
                const newHeadshots = data.athletes
                    .flatMap(pg => pg.items || [])
                    .map(p => p.headshot?.href)
                    .filter(Boolean); // Filter out players without headshots
                if(newHeadshots.length > 0) {
                    headshotsForAnimation.push(...newHeadshots);
                }
            }
        } catch (error) {
            console.warn('Could not fetch headshots for animation:', error);
        }
        animationTeamIndex++;
    };

    // Pre-fetch some headshots to start
    await fetchHeadshotsForAnimation();

    let headshotIndex = 0;
    animateInterval = setInterval(() => {
        // If we're running out of headshots, fetch more
        if (headshotIndex >= headshotsForAnimation.length - 5) {
            fetchHeadshotsForAnimation();
        }

        // If we have headshots, cycle through them. Otherwise, fallback to team logos.
        if (headshotsForAnimation.length > 0) {
            const currentHeadshot = headshotsForAnimation[headshotIndex % headshotsForAnimation.length];
            showTeamAnimationOverlay('Searching for a player...', currentHeadshot, false);
            headshotIndex++;
        } else {
            // Fallback to team logos if initial fetch fails or yields no headshots
            const currentTeamLogo = teams[animationTeamIndex % teams.length].logo;
            showTeamAnimationOverlay('Searching for a player...', currentTeamLogo, false);
            animationTeamIndex++;
        }
    }, 150);


    setTimeout(async () => {
        clearInterval(animateInterval);

        try {
            let draftedPlayer = null;
            let chosenPlayer = null;
            let availableSlot = null;
            
            const otherPlayerNum = playerNum === 1 ? 2 : 1;
            const opponentRosterIds = new Set(Object.values(playerData[otherPlayerNum].rosterSlots).filter(p => p).map(p => p.id));
            const ownRosterIds = new Set(Object.values(playerData[playerNum].rosterSlots).filter(p => p).map(p => p.id));

            // To avoid an infinite loop if no player is available. Set a max attempts.
            const maxAttempts = teams.length * 2;
            let attempts = 0;

            while (!draftedPlayer && attempts < maxAttempts) {
                attempts++;
                
                const randomTeam = getRandomElement(teams);
                
                const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${randomTeam.id}/roster`);
                const data = await response.json();

                if (!data.athletes) continue;

                let teamPlayers = data.athletes.flatMap(positionGroup => positionGroup.items || []);
                const defPlayer = {
                    id: `DEF-${randomTeam.id}`,
                    displayName: randomTeam.name,
                    position: { name: 'Defense', abbreviation: 'DEF' },
                    headshot: { href: randomTeam.logo }
                };
                teamPlayers.push(defPlayer);

                shuffleArray(teamPlayers);

                for (const player of teamPlayers) {
                    // Normalize position for PK
                    if (player.position?.abbreviation === 'PK') player.position.abbreviation = 'K';
                    
                    const isDrafted = opponentRosterIds.has(player.id) || ownRosterIds.has(player.id);
                    if (isDrafted) continue;

                    availableSlot = findAvailableSlotForPlayer(playerNum, player);
                    if (availableSlot) {
                        chosenPlayer = player;
                        draftedPlayer = true;
                        break; // Found a player
                    }
                }
            }

            if (chosenPlayer && availableSlot) {
                 // Determine if the headshot is an avatar or a real photo
                 const headshotIsAvatar = !chosenPlayer.headshot?.href || chosenPlayer.originalPosition === 'DEF';
                 const headshotSrc = chosenPlayer.headshot?.href || playerData[playerNum].avatar;
                 showTeamAnimationOverlay(`Drafted: ${chosenPlayer.displayName}`, headshotSrc, headshotIsAvatar);
                
                // Assign player to slot
                playerData[playerNum].rosterSlots[availableSlot] = {
                    id: chosenPlayer.id,
                    displayName: chosenPlayer.displayName,
                    originalPosition: chosenPlayer.position?.abbreviation || chosenPlayer.position?.name,
                    assignedSlot: availableSlot,
                    headshot: chosenPlayer.headshot,
                    fantasyPoints: null,
                    statsData: null
                };
                
                // NEW: Ensure team and draftedPlayers are nullified after auto-draft
                // This signals that the next turn requires a new "Roll Team" or another auto-draft.
                playerData[playerNum].team = null;
                playerData[playerNum].draftedPlayers = [];

                localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum]));

    setTimeout(() => {
  hideTeamAnimationOverlay();
  updateLayout(true); // wrapper will handle syncing
}, 1500);

 // Show drafted player for a bit
            } else {
                 showTeamAnimationOverlay(`No draftable player found! Try again.`);
                setTimeout(() => {
                    hideTeamAnimationOverlay();
                    // Don't switch turns if failed
                    updateLayout(false); 
                }, 1500);
            }

        } catch (error) {
            console.error('Error during auto-draft:', error);
            showTeamAnimationOverlay('Auto-draft failed!');
            setTimeout(() => {
                hideTeamAnimationOverlay();
                updateLayout(false); // Do not switch turn on error
            }, 1500);
        }
    }, animationDuration - 1500); // Start searching before visual animation ends
}

/**
 * Initiates the drafting process for a selected player.
 * @param {number} playerNum - The player number (1 or 2).
 * @param {object} player - The NFL player object to draft.
 * @param {string} originalPosition - The player's original position (e.g., 'QB', 'RB', 'WR', 'TE', 'K', 'DEF').
 */
export function draftPlayer(playerNum, player, originalPosition) {
    if (playerNum !== gameState.currentPlayer) {
        alert("It's not your turn!");
        return;
    }

    const isAlreadyInFantasyRoster = Object.values(playerData[playerNum].rosterSlots).some(
        slotPlayer => slotPlayer && slotPlayer.id === player.id
    );
    if (isAlreadyInFantasyRoster) {
        console.warn(`Player ${player.displayName} is already in Player ${playerNum}'s fantasy roster.`);
        alert(`${player.displayName} is already in your fantasy roster!`);
        return;
    }

    if (playerData[playerNum].draftedPlayers.length > 0) {
        console.warn(`Player ${playerNum} has already drafted a player from this team. draftedPlayers.length: ${playerData[playerNum].draftedPlayers.length}`);
        alert('You have already drafted a player from this team. Please select a new team or auto-draft to draft another player.');
        return;
    }

    if (isFantasyRosterFull(playerNum)) {
        console.warn(`Player ${playerNum}'s fantasy roster is full. Cannot draft ${player.displayName}.`);
        alert('Your fantasy roster is full! You cannot draft more players.');
        return;
    }

    const flexPositions = ['RB', 'WR', 'TE'];

    if (flexPositions.includes(originalPosition)) {
        showSlotSelectionModal(
            player,
            playerNum,
            originalPosition,
            playerData[playerNum],
            assignPlayerToSlot,
            hideSlotSelectionModal
        );
    } else {
        let targetSlot;
        if (originalPosition === 'QB') targetSlot = 'QB';
        else if (originalPosition === 'K') targetSlot = 'K';
        else if (originalPosition === 'DEF') targetSlot = 'DEF';

        if (targetSlot) {
            // 🚨 sanitize team before persisting to Firebase
            if (playerData[playerNum].team && playerData[playerNum].team.rosterData) {
                playerData[playerNum].team = {
                    id: playerData[playerNum].team.id,
                    name: playerData[playerNum].team.name,
                    abbreviation: playerData[playerNum].team.abbreviation
                };
            }

            assignPlayerToSlot(playerNum, player, targetSlot);
        } else {
            console.error(`Attempted to draft ${player.displayName} (${originalPosition}) to an unknown slot.`);
            alert(`Cannot draft ${player.displayName} to an unknown slot for position ${originalPosition}.`);
        }
    }
}

/**
 * Assigns a drafted player to a specific fantasy roster slot.
 * @param {number} playerNum - The player number (1 or 2).
 * @param {object} playerObj - The NFL player object to assign.
 * @param {string} slotId - The fantasy roster slot ID (e.g., 'QB', 'RB', 'WR1').
 */
export async function assignPlayerToSlot(playerNum, playerObj, slotId) {
    if (playerNum !== gameState.currentPlayer) {
        console.warn(`ASSIGNMENT BLOCKED: Not Player ${playerNum}'s turn.`);
        alert("It's not your turn!");
        hideSlotSelectionModal();
        return;
    }

    const isAlreadyInFantasyRoster = Object.values(playerData[playerNum].rosterSlots).some(slotPlayer => slotPlayer && slotPlayer.id === playerObj.id);
    if (isAlreadyInFantasyRoster) {
        console.warn(`ASSIGNMENT BLOCKED: ${playerObj.displayName} is already in Player ${playerNum}'s fantasy roster.`);
        alert(`${playerObj.displayName} is already in your fantasy roster!`);
        hideSlotSelectionModal();
        return;
    }

    // NEW: Check if the player has been drafted by the opponent.
    const otherPlayerNum = playerNum === 1 ? 2 : 1;
    if (playerData[otherPlayerNum].name) { // Only check if opponent exists
        const isDraftedByOpponent = Object.values(playerData[otherPlayerNum].rosterSlots).some(slotPlayer => slotPlayer && slotPlayer.id === playerObj.id);
        if (isDraftedByOpponent) {
            alert(`${playerObj.displayName} has already been drafted by ${playerData[otherPlayerNum].name}!`);
            hideSlotSelectionModal();
            return;
        }
    }

    // This check ensures only one player is drafted per 'team spin'
    if (playerData[playerNum].draftedPlayers.length > 0) {
        console.warn(`ASSIGNMENT BLOCKED: Player ${playerNum} has already drafted a player from this team (length: ${playerData[playerNum].draftedPlayers.length}).`);
        alert('You have already drafted a player from this team. Please select a new team or auto-draft to draft another player.');
        hideSlotSelectionModal();
        return;
    }

    if (playerData[playerNum].rosterSlots[slotId]) {
        console.warn(`ASSIGNMENT BLOCKED: The ${slotId} slot for Player ${playerNum} is already occupied by ${playerData[playerNum].rosterSlots[slotId].displayName}.`);
        alert(`The ${slotId} slot is already occupied by ${playerData[playerNum].rosterSlots[slotId].displayName}.`);
        hideSlotSelectionModal();
        return;
    }

    // If all checks pass, assign the player
    console.log(`Assigning ${playerObj.displayName} to ${slotId} for Player ${playerNum}.`);
    playerData[playerNum].rosterSlots[slotId] = {
        id: playerObj.id,
        displayName: playerObj.displayName,
        originalPosition: playerObj.position?.abbreviation || playerObj.position?.name,
        assignedSlot: slotId,
        headshot: playerObj.headshot,
        fantasyPoints: null,
        statsData: null
    };

    playerData[playerNum].draftedPlayers.push({ id: playerObj.id, assignedSlot: slotId });

    localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum]));

    hideSlotSelectionModal();

// Update visuals immediately (don’t switch turn yet)
updateLayout(true);



}
