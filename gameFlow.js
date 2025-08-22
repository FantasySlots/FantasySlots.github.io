/**
 * gameFlow.js
 * Contains the core game logic for team selection, drafting, and player state resets.
 */
import { gameState, playerData, isFantasyRosterFull, switchTurn } from './playerState.js';
import { shuffleArray, getRandomElement, delay, getCachedData, setCachedData } from './utils.js';
import { showSlotSelectionModal, hideSlotSelectionModal } from './uiModals.js';
import { showTeamAnimationOverlay, hideTeamAnimationOverlay, startLogoCyclingAnimation, stopLogoCyclingAnimation } from './uiAnimations.js';
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
    if (isFantasyRosterFull(playerNum)) {
        alert('Your fantasy roster is full! You cannot draft more players.');
        return;
    }

    playerData[playerNum].team = null;
    playerData[playerNum].draftedPlayers = []; 
    console.log(`Player ${playerNum}: draftedPlayers reset to [] after selecting new team.`);
    
    document.getElementById(`player${playerNum}-content-area`).innerHTML = ''; 

    showTeamAnimationOverlay('Selecting your team...');
    
    const shuffledTeams = shuffleArray([...teams]);
    const logos = shuffledTeams.map(t => ({ src: t.logo, isAvatar: false }));
    const animationDuration = 3100;

    startLogoCyclingAnimation(logos, 100);

    setTimeout(async () => {
        stopLogoCyclingAnimation();
        
        const randomTeam = getRandomElement(teams);
        playerData[playerNum].team = randomTeam; 
        
        showTeamAnimationOverlay(`Selected: ${randomTeam.name}`, randomTeam.logo, false); 
        
        await delay(500);

        hideTeamAnimationOverlay(); 
        
        try {
            const rosterCacheKey = `espn-roster-${randomTeam.id}`;
            const TTL = 10 * 60 * 1000; // 10 minutes
            let rosterData = getCachedData(rosterCacheKey);

            if (!rosterData) {
                const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${randomTeam.id}/roster`);
                const data = await response.json();
                if (data.athletes) {
                    rosterData = data.athletes;
                    setCachedData(rosterCacheKey, rosterData, TTL);
                }
            }
            
            if (rosterData) {
                playerData[playerNum].team.rosterData = rosterData; 
                localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum]));
            }
        } catch (error) {
            console.error('Error fetching roster:', error);
        }
        updateLayout();
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

    showTeamAnimationOverlay('Auto-drafting a player...');
    
    const animationDuration = 3000;
    let animationLogos = [];
    let teamsForAnimation = shuffleArray([...teams]);

    const fetchLogosForAnimation = async () => {
        if (teamsForAnimation.length === 0) return;
        const team = teamsForAnimation.pop();
        try {
            const rosterCacheKey = `espn-roster-${team.id}`;
            const TTL = 10 * 60 * 1000; // 10 minutes
            let rosterData = getCachedData(rosterCacheKey);

            if (!rosterData) {
                const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/roster`);
                const data = await response.json();
                rosterData = data?.athletes;
                if (rosterData) setCachedData(rosterCacheKey, rosterData, TTL);
            }

            if (rosterData) {
                const headshots = rosterData
                    .flatMap(pg => pg.items || [])
                    .map(p => p.headshot?.href)
                    .filter(Boolean);
                if (headshots.length > 0) {
                    animationLogos.push(...shuffleArray(headshots).map(src => ({ src, isAvatar: false })));
                } else {
                     animationLogos.push({ src: team.logo, isAvatar: false });
                }
            } else {
                animationLogos.push({ src: team.logo, isAvatar: false });
            }
        } catch (error) {
            console.warn('Could not fetch headshots for animation:', error);
            animationLogos.push({ src: team.logo, isAvatar: false });
        }
    };

    // Preload some logos
    await Promise.all([fetchLogosForAnimation(), fetchLogosForAnimation()]);

    startLogoCyclingAnimation(animationLogos, 150, fetchLogosForAnimation);

    const draftingPromise = (async () => {
        await delay(animationDuration - 1500);
        stopLogoCyclingAnimation();

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

                const rosterCacheKey = `espn-roster-${randomTeam.id}`;
                const TTL = 10 * 60 * 1000; // 10 minutes
                let rosterData = getCachedData(rosterCacheKey);

                if (!rosterData) {
                    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${randomTeam.id}/roster`);
                    const data = await response.json();
                    if (data.athletes) {
                        rosterData = data.athletes;
                        setCachedData(rosterCacheKey, rosterData, TTL);
                    }
                }

                if (!rosterData) continue;

                let teamPlayers = rosterData.flatMap(positionGroup => positionGroup.items || []);
                const defPlayer = {
                    id: `DEF-${randomTeam.id}`, displayName: randomTeam.name,
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
                        break;
                    }
                }
            }

            if (chosenPlayer && availableSlot) {
                const headshotIsAvatar = !chosenPlayer.headshot?.href || chosenPlayer.originalPosition === 'DEF';
                const fillerHeadshot = 'https://i.postimg.cc/Hxsb5C4T/Chat-GPT-Image-Aug-16-2025-02-34-57-PM.png';
                const headshotSrc = chosenPlayer.headshot?.href || fillerHeadshot;
                showTeamAnimationOverlay(`Drafted: ${chosenPlayer.displayName}`, headshotSrc, headshotIsAvatar);
                
                playerData[playerNum].rosterSlots[availableSlot] = {
                    id: chosenPlayer.id, displayName: chosenPlayer.displayName,
                    originalPosition: chosenPlayer.position?.abbreviation || chosenPlayer.position?.name,
                    assignedSlot: availableSlot, 
                    headshot: chosenPlayer.headshot || null, // Ensure headshot is not undefined
                    fantasyPoints: null, statsData: null
                };
                
                playerData[playerNum].team = null;
                playerData[playerNum].draftedPlayers = [];
                localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum]));

                await delay(1500);
                hideTeamAnimationOverlay();
                updateLayout(true);
            } else {
                showTeamAnimationOverlay(`No draftable player found! Try again.`);
                await delay(1500);
                hideTeamAnimationOverlay();
                updateLayout(true);
            }
        } catch (error) {
            console.error('Error during auto-draft:', error);
            showTeamAnimationOverlay('Auto-draft failed!');
            await delay(1500);
            hideTeamAnimationOverlay();
            updateLayout(false);
        }
    })();
    
    await draftingPromise; // Wait for the whole process to complete
}

/**
 * NEW: Handles auto-drafting a full roster for a player.
 * Fills all empty slots with random, available players.
 * @param {number} playerNum - The player number (1 or 2).
 */
export async function autoDraftFullRoster(playerNum) {
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

    showTeamAnimationOverlay('Auto-drafting full roster...');
    await delay(200); // Short delay to allow overlay to show

    try {
        const roster = playerData[playerNum].rosterSlots;
        const emptySlots = Object.keys(roster).filter(slot => !roster[slot]);

        const otherPlayerNum = playerNum === 1 ? 2 : 1;
        const opponentRosterIds = new Set(Object.values(playerData[otherPlayerNum].rosterSlots).filter(p => p).map(p => p.id));
        const ownRosterIds = new Set(Object.values(playerData[playerNum].rosterSlots).filter(p => p).map(p => p.id));
        const allDraftedIds = new Set([...opponentRosterIds, ...ownRosterIds]);

        const allPlayersPromises = teams.map(team => {
            const rosterCacheKey = `espn-roster-${team.id}`;
            const TTL = 10 * 60 * 1000; // 10 minutes
            const cachedRoster = getCachedData(rosterCacheKey);
            if (cachedRoster) {
                return Promise.resolve({ athletes: cachedRoster });
            }
            return fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/roster`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.athletes) {
                        setCachedData(rosterCacheKey, data.athletes, TTL);
                    }
                    return data;
                })
                .catch(err => {
                    console.warn(`Failed to fetch roster for ${team.name}`, err);
                    return null;
                });
        });

        const allRosters = await Promise.all(allPlayersPromises);

        let masterPlayerPool = [];
        allRosters.forEach((rosterData, index) => {
            if (rosterData && rosterData.athletes) {
                const team = teams[index];
                masterPlayerPool.push(...rosterData.athletes.flatMap(group => group.items || []));
                masterPlayerPool.push({
                    id: `DEF-${team.id}`,
                    displayName: team.name,
                    position: { name: 'Defense', abbreviation: 'DEF' },
                    headshot: { href: team.logo }
                });
            }
        });

        shuffleArray(masterPlayerPool);

        for (const slotId of emptySlots) {
            for (let i = 0; i < masterPlayerPool.length; i++) {
                const player = masterPlayerPool[i];

                if (allDraftedIds.has(player.id)) {
                    continue;
                }

                let originalPosition = player.position?.abbreviation || player.position?.name;
                if (originalPosition === 'PK') originalPosition = 'K';

                const positionMap = {
                    'QB': ['QB'], 'RB': ['RB'], 'WR1': ['WR'], 'WR2': ['WR'], 'TE': ['TE'],
                    'K': ['K'], 'DEF': ['DEF'], 'Flex': ['RB', 'WR', 'TE']
                };

                if (positionMap[slotId] && positionMap[slotId].includes(originalPosition)) {
                    playerData[playerNum].rosterSlots[slotId] = {
                        id: player.id, displayName: player.displayName,
                        originalPosition: originalPosition, assignedSlot: slotId,
                        headshot: player.headshot || null, // Ensure headshot is not undefined
                        fantasyPoints: null, statsData: null
                    };
                    allDraftedIds.add(player.id);
                    break;
                }
            }
        }

        const finalAvatar = playerData[playerNum].avatar || 'https://www.svgrepo.com/download/3514/american-football.svg';
        showTeamAnimationOverlay('Roster Complete!', finalAvatar, true);

        playerData[playerNum].team = null;
        playerData[playerNum].draftedPlayers = [];
        localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum]));

        await delay(1500);
        hideTeamAnimationOverlay();
        updateLayout(true);

    } catch (error) {
        console.error('Error during auto-draft full roster:', error);
        showTeamAnimationOverlay('Auto-draft failed!');
        await delay(1500);
        hideTeamAnimationOverlay();
        updateLayout(false);
    }
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

    // This sanitization is good practice locally, but the main fix is in syncWithFirebase.
    if (playerData[playerNum].team && playerData[playerNum].team.rosterData) {
        delete playerData[playerNum].team.rosterData;
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
        id: playerObj.id, displayName: playerObj.displayName,
        originalPosition: playerObj.position?.abbreviation || playerObj.position?.name,
        assignedSlot: slotId, 
        headshot: playerObj.headshot || null, // Ensure headshot is not undefined
        fantasyPoints: null, statsData: null
    };

    playerData[playerNum].draftedPlayers.push({ id: playerObj.id, assignedSlot: slotId });

    localStorage.setItem(`fantasyTeam_${playerNum}`, JSON.stringify(playerData[playerNum]));

    hideSlotSelectionModal();

    // Update visuals immediately (don’t switch turn yet)
    updateLayout(true);
    
    // NEW: Immediately fetch fantasy points for the newly drafted player.
    // This will update the "Loading..." text in the UI after a short delay.
    (async () => {
        let playerNameForTank01 = playerObj.displayName;
        if (playerObj.position?.abbreviation === 'DEF') {
            const team = teams.find(t => t.id === playerObj.id.split('-')[1]);
            playerNameForTank01 = team ? `${team.name} Defense` : playerNameForTank01;
        }

        const tank01PlayerID = await getTank01PlayerID(playerNameForTank01);
        if (tank01PlayerID) {
            const result = await fetchLastGameStats(tank01PlayerID);
            const playerInRoster = playerData[playerNum].rosterSlots[slotId];
            if (playerInRoster && result && result.stats) {
                playerInRoster.statsData = result.stats;
                const fantasyPointsRaw = result.fantasyPoints;

                if (playerInRoster.originalPosition === 'DEF') {
                    playerInRoster.fantasyPoints = fantasyPointsRaw;
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
                    playerInRoster.fantasyPoints = (opponent !== teamOpp || gameDate !== teamGameDate) ? 0 : fantasyPointsRaw;
                }
            } else if (playerInRoster) {
                playerInRoster.fantasyPoints = 'N/A';
            }
            // After fetching, re-render the specific player's roster and sync if in multiplayer.
            updateLayout(false); // Re-render without switching turn
        }
    })();
}