/**
 * gameFlow.js
 * Contains the core game logic for team selection, drafting, and player state resets.
 */
import { gameMode, withFirebaseSync } from './game.js';
import { gameState, playerData, isFantasyRosterFull, resetGameState, switchTurn } from './playerState.js';
import { shuffleArray, getRandomElement } from './utils.js';
import { showSlotSelectionModal, hideSlotSelectionModal } from './uiModals.js';
import { showTeamAnimationOverlay, hideTeamAnimationOverlay } from './uiAnimations.js';
import { teams } from './data.js';
import { updateLayout } from './game.js';
import { findAvailableSlotForPlayer } from './playerState.js';


/**
 * Handles the process of selecting a random NFL team.
 * @param {number} playerNum - The player number (1 or 2).
 */
export async function selectTeam(playerNum) {
    if (playerNum !== gameState.currentPlayer) {
        alert("It's not your turn!");
        return;
    }

    // If roster is full, prevent new team selection or auto-draft
    if (isFantasyRosterFull(playerNum)) {
        alert('Your fantasy roster is full! You cannot draft more players.');
        return;
    }

    // Clear the player content area immediately for the animation
    document.getElementById(`player${playerNum}-content-area`).innerHTML = '';

    showTeamAnimationOverlay('Selecting your team...', '', false);

    // Animate through logos
    let currentIndex = 0;
    const animationDuration = 3100;
    const interval = 100;

    const animateInterval = setInterval(() => {
        const currentTeamLogo = teams[currentIndex].logo;
        showTeamAnimationOverlay('Selecting your team...', currentTeamLogo, false);
        currentIndex = (currentIndex + 1) % teams.length;
    }, interval);

    // Select random team after animation duration
    setTimeout(async () => {
        clearInterval(animateInterval);
        const randomTeam = teams[Math.floor(Math.random() * teams.length)];

        // ✅ If the team is different from the previous one, reset draftedPlayers
        if (!playerData[playerNum].team || playerData[playerNum].team.id !== randomTeam.id) {
            playerData[playerNum].draftedPlayers = [];
            console.log(`Player ${playerNum}: draftedPlayers reset due to new team selection (${randomTeam.name}).`);
        }

        playerData[playerNum].team = randomTeam;

        showTeamAnimationOverlay(`Selected: ${randomTeam.name}`, randomTeam.logo, false);

        setTimeout(async () => {
            hideTeamAnimationOverlay();

            try {
                const response = await fetch(
                    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${randomTeam.id}/roster`
                );
                const data = await response.json();

                if (data.athletes) {
                    // Store roster locally only — don't sync to Firebase
                    playerData[playerNum].team.rosterData = data.athletes;

                    // Save state after team selection
                    localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum]));
                }
            } catch (error) {
                console.error('Error fetching roster:', error);
            }

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

    showTeamAnimationOverlay('Auto-drafting a player...');

    const animationDuration = 3000; 
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
                    .filter(Boolean);
                if (newHeadshots.length > 0) {
                    headshotsForAnimation.push(...newHeadshots);
                }
            }
        } catch (error) {
            console.warn('Could not fetch headshots for animation:', error);
        }
        animationTeamIndex++;
    };

    await fetchHeadshotsForAnimation();

    let headshotIndex = 0;
    animateInterval = setInterval(() => {
        if (headshotIndex >= headshotsForAnimation.length - 5) {
            fetchHeadshotsForAnimation();
        }

        if (headshotsForAnimation.length > 0) {
            const currentHeadshot = headshotsForAnimation[headshotIndex % headshotsForAnimation.length];
            showTeamAnimationOverlay('Searching for a player...', currentHeadshot, false);
            headshotIndex++;
        } else {
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

            const maxAttempts = teams.length * 2;
            let attempts = 0;

            while (!draftedPlayer && attempts < maxAttempts) {
                attempts++;
                
                const randomTeam = getRandomElement(teams);
                
                const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${randomTeam.id}/roster`);
                const data = await response.json();

                if (!data.athletes) continue;

                let teamPlayers = data.athletes.flatMap(positionGroup => positionGroup.items || []);

                // Add defense as a "player"
                const defPlayer = {
                    id: `DEF-${randomTeam.id}`,
                    displayName: randomTeam.name,
                    position: { name: 'Defense', abbreviation: 'DEF' },
                    headshot: { href: randomTeam.logo }
                };
                teamPlayers.push(defPlayer);

                shuffleArray(teamPlayers);

                for (const player of teamPlayers) {
                    if (player.position?.abbreviation === 'PK') player.position.abbreviation = 'K';
                    
                    const isDrafted = opponentRosterIds.has(player.id) || ownRosterIds.has(player.id);
                    if (isDrafted) continue;

                    availableSlot = findAvailableSlotForPlayer(playerNum, player);
                    if (availableSlot) {
                        chosenPlayer = player;
                        draftedPlayer = true;

                        // ✅ Reset draftedPlayers only if from a different team
                        if (!playerData[playerNum].team || playerData[playerNum].team.id !== randomTeam.id) {
                            playerData[playerNum].draftedPlayers = [];
                            console.log(`Player ${playerNum}: draftedPlayers reset due to new team selection (${randomTeam.name}) in auto-draft.`);
                        }

                        playerData[playerNum].team = randomTeam; // set current team
                        break;
                    }
                }
            }

            if (chosenPlayer && availableSlot) {
                if (!chosenPlayer.originalPosition) {
                    chosenPlayer.originalPosition = chosenPlayer.position?.abbreviation || chosenPlayer.position?.name;
                }

                const headshotIsAvatar = !chosenPlayer.headshot?.href || chosenPlayer.originalPosition === 'DEF';
                const headshotSrc = chosenPlayer.headshot?.href || playerData[playerNum].avatar;
                showTeamAnimationOverlay(`Drafted: ${chosenPlayer.displayName}`, headshotSrc, headshotIsAvatar);

                setTimeout(async () => {
                    hideTeamAnimationOverlay();

                    if (typeof gameMode !== 'undefined' && gameMode === 'multiplayer') {
                        await withFirebaseSync(assignPlayerToSlot, { switchOnComplete: true })(playerNum, chosenPlayer, availableSlot);
                    } else {
                        assignPlayerToSlot(playerNum, chosenPlayer, availableSlot);
                        updateLayout(); // ✅ Force grey-out after local auto draft
                    }
                }, 1500);
            } else {
                showTeamAnimationOverlay(`No draftable player found! Try again.`);
                setTimeout(() => {
                    hideTeamAnimationOverlay();
                    updateLayout(false);
                }, 1500);
            }

        } catch (error) {
            console.error('Error during auto-draft:', error);
            showTeamAnimationOverlay('Auto-draft failed!');
            setTimeout(() => {
                hideTeamAnimationOverlay();
                updateLayout(false);
            }, 1500);
        }
    }, animationDuration - 1500);
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

    // 🚫 Don't allow drafting the same player twice by the same team
    const isAlreadyInFantasyRoster = Object.values(playerData[playerNum].rosterSlots)
        .some(slotPlayer => slotPlayer && slotPlayer.id === player.id);
    if (isAlreadyInFantasyRoster) {
        console.warn(`Player ${player.displayName} is already in Player ${playerNum}'s fantasy roster.`);
        alert(`${player.displayName} is already in your fantasy roster!`);
        return;
    }

    // 🚫 Full roster check
    if (isFantasyRosterFull(playerNum)) {
        console.warn(`Player ${playerNum}'s fantasy roster is full. Cannot draft ${player.displayName}.`);
        alert('Your fantasy roster is full! You cannot draft more players.');
        return;
    }

    // ✅ If new team, set it (just for logo/UI purposes)
    if (!playerData[playerNum].team || playerData[playerNum].team.id !== player.teamId) {
        playerData[playerNum].team = teams.find(t => t.id === player.teamId) || playerData[playerNum].team;
        console.log(`Player ${playerNum}: now drafting from team (${playerData[playerNum].team?.name || 'Unknown'}) in manual draft.`);
    }

    const afterDraftActions = () => {
        // 🆕 Clear draftedPlayers immediately after each pick
        playerData[playerNum].draftedPlayers = [];
        updateLayout();
    };

    const flexPositions = ['RB', 'WR', 'TE'];
    if (flexPositions.includes(originalPosition)) {
        showSlotSelectionModal(
            player,
            playerNum,
            originalPosition,
            playerData[playerNum],
            gameMode === 'multiplayer'
                ? withFirebaseSync((...args) => { assignPlayerToSlot(...args); afterDraftActions(); }, { switchOnComplete: true })
                : (...args) => { assignPlayerToSlot(...args); afterDraftActions(); },
            hideSlotSelectionModal
        );
    } else {
        let targetSlot;
        if (originalPosition === 'QB') targetSlot = 'QB';
        else if (originalPosition === 'K') targetSlot = 'K';
        else if (originalPosition === 'DEF') targetSlot = 'DEF';

        if (targetSlot) {
            if (gameMode === 'multiplayer') {
                withFirebaseSync((...args) => { assignPlayerToSlot(...args); afterDraftActions(); }, { switchOnComplete: true })(playerNum, player, targetSlot);
            } else {
                assignPlayerToSlot(playerNum, player, targetSlot);
                afterDraftActions();
            }
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
export function assignPlayerToSlot(playerNum, playerObj, slotId) {
    if (playerNum !== gameState.currentPlayer) {
        console.warn(`ASSIGNMENT BLOCKED: Not Player ${playerNum}'s turn.`);
        alert("It's not your turn!");
        hideSlotSelectionModal();
        return;
    }

    // Prevent duplicate in same roster
    const isAlreadyInFantasyRoster = Object.values(playerData[playerNum].rosterSlots)
        .some(slotPlayer => slotPlayer && slotPlayer.id === playerObj.id);
    if (isAlreadyInFantasyRoster) {
        alert(`${playerObj.displayName} is already in your fantasy roster!`);
        hideSlotSelectionModal();
        return;
    }

    // Prevent drafting opponent's player
    const otherPlayerNum = playerNum === 1 ? 2 : 1;
    const isDraftedByOpponent = Object.values(playerData[otherPlayerNum].rosterSlots)
        .some(slotPlayer => slotPlayer && slotPlayer.id === playerObj.id);
    if (isDraftedByOpponent) {
        alert(`${playerObj.displayName} has already been drafted by ${playerData[otherPlayerNum].name}!`);
        hideSlotSelectionModal();
        return;
    }

    // One player per team per spin
    if (playerData[playerNum].draftedPlayers.length > 0) {
        alert('You have already drafted a player from this team. Please select a new team or auto-draft to draft another player.');
        hideSlotSelectionModal();
        return;
    }

    // Prevent overwriting filled slot
    if (playerData[playerNum].rosterSlots[slotId]?.id) {
        alert(`The ${slotId} slot is already occupied by ${playerData[playerNum].rosterSlots[slotId].displayName}.`);
        hideSlotSelectionModal();
        return;
    }

    // Assign player
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

    // 🔹 Always refresh roster & turn state
    if (typeof gameMode !== 'undefined' && gameMode === 'multiplayer') {
        updateLayout(false); // redraw UI immediately
        // Firebase will still sync and call updateLayout again when the other client gets the change
    } else {
        displayFantasyRoster(
    playerNum,
    playerData[playerNum],
    teams,
    isFantasyRosterFull(playerNum),
    openPlayerStatsModalCaller
);

        switchTurn();
        updateLayout();
    }
}

