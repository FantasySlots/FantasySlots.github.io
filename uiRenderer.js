/**
 * uiRenderer.js
 * Handles all DOM manipulation for rendering general player sections,
 * including the draft interface and fantasy roster display.
 */

// UI Helper: Get or create a child element with a specific class
export function getOrCreateChild(parent, className, tagName = 'div') {
    let element = parent.querySelector(`.${className}`);
    if (!element) {
        element = document.createElement(tagName);
        element.className = className;
        parent.appendChild(element);
    }
    return element;
}

// NEW: UI Function: Render the player's avatar and name in the title
export function renderPlayerAvatar(playerNum, playerName, avatarUrl) {
    const playerTitleEl = document.querySelector(`#player${playerNum}-section .player-title`);
    playerTitleEl.innerHTML = ''; // Clear existing content

    if (avatarUrl) {
        const avatarImg = document.createElement('img');
        avatarImg.classList.add('player-avatar-img');
        avatarImg.src = avatarUrl;
        avatarImg.alt = `${playerName}'s avatar`;
        playerTitleEl.appendChild(avatarImg);
    }

    const nameSpan = document.createElement('span');
    nameSpan.textContent = playerName;
    playerTitleEl.appendChild(nameSpan);
}

// NEW: UI Function: Render the avatar selection options into a given container
// This function no longer manages the preview element itself.
export function renderAvatarSelectionOptions(playerNum, currentAvatar, avatarList, selectAvatarCallback, optionsContainer) {
    optionsContainer.innerHTML = ''; // Clear previous options

    avatarList.forEach(avatarUrl => {
        const avatarOption = document.createElement('div');
        avatarOption.classList.add('avatar-option');
        if (avatarUrl === currentAvatar) {
            avatarOption.classList.add('selected');
        }
        avatarOption.innerHTML = `<img src="${avatarUrl}" alt="Avatar">`;
        avatarOption.addEventListener('click', () => {
            selectAvatarCallback(playerNum, avatarUrl);
        });
        optionsContainer.appendChild(avatarOption);
    });
}

// UI Function: Update visibility of inline roster vs. fantasy roster within player section
export function updatePlayerContentDisplay(playerNum, playerDataForPlayer, isFantasyRosterFullFn) {
    const playerContentArea = document.getElementById(`player${playerNum}-content-area`);
    // Ensure these elements exist using getOrCreateChild, even if they'll be hidden
    const inlineRosterEl = getOrCreateChild(playerContentArea, 'inline-roster');
    const fantasyRosterEl = getOrCreateChild(playerContentArea, 'fantasy-roster');

    // Get references to the team info and team selection elements
    const teamDisplayEl = document.getElementById(`player${playerNum}-display`);
    const teamInfoEl = teamDisplayEl.querySelector('.team-info');
    const teamSelectionEl = teamDisplayEl.querySelector('.team-selection');

    if (!teamInfoEl || !teamSelectionEl) { // Only check for static elements
        console.warn('Team info or team selection elements not found, cannot update display.');
        return;
    }

    // Always ensure team info is visible if player-display is active
    // The visibility of teamDisplayEl is managed by game.js (confirmName, updateLayout)
    teamInfoEl.style.display = 'block'; // Make sure team info is visible

    // NEW: Logic to show/hide team selection buttons
    // The buttons should be hidden if a team is selected AND no player has been drafted from it yet.
    // This forces the user to draft from the currently displayed team roster.
    const rosterIsFull = isFantasyRosterFullFn(playerNum);
    const teamIsSelected = playerDataForPlayer.team !== null && playerDataForPlayer.team.rosterData;
    const hasDraftedFromCurrentTeam = playerDataForPlayer.draftedPlayers.length > 0;
    
    // Hide buttons if roster is full OR if a team is selected and waiting for a draft pick.
    if (rosterIsFull || (teamIsSelected && !hasDraftedFromCurrentTeam)) {
        teamSelectionEl.style.display = 'none';
    } else {
        // Show buttons if the roster is NOT full AND (either no team is selected yet, or a player has been drafted).
        teamSelectionEl.style.display = 'flex';
    }

    // Logic to toggle between inline NFL roster and fantasy roster display
    const hasTeamSelected = playerDataForPlayer.team !== null;
    const hasAnyDraftedPlayer = Object.values(playerDataForPlayer.rosterSlots).some(slot => slot !== null);

    if (hasTeamSelected && !hasDraftedFromCurrentTeam) {
        // Show inline roster (draft interface) if a team is selected and no player drafted from it yet.
        inlineRosterEl.style.display = 'block';
        fantasyRosterEl.style.display = 'none';
    } else if (hasAnyDraftedPlayer) {
        // If any player has been drafted (either manually or via auto-draft), show the fantasy roster.
        inlineRosterEl.style.display = 'none';
        fantasyRosterEl.style.display = 'block';
    } else {
        // If no team is selected yet, and no players drafted, hide both roster views.
        // The "Roll Team" buttons will be visible in this state.
        inlineRosterEl.style.display = 'none';
        fantasyRosterEl.style.display = 'none';
    }
}

// UI Function: Display draft interface (NFL Roster of a chosen team)
export function displayDraftInterface(playerNum, teamAthletes, playerDataForPlayer, opponentData, isFantasyRosterFullFn, isPlayerPositionUndraftableFn, draftPlayerCallback) {
    const playerContentArea = document.getElementById(`player${playerNum}-content-area`);
    const draftContainer = getOrCreateChild(playerContentArea, 'inline-roster');
    draftContainer.innerHTML = ''; // Clear previous content before rendering new

    const allPlayers = teamAthletes.flatMap(positionGroup => positionGroup.items || []);
    
    // NEW: Add message if no players are found for this team
    if (allPlayers.length === 0) {
        const noPlayersMessage = document.createElement('p');
        noPlayersMessage.textContent = 'No active roster players found for this team. Please try rolling a new team!';
        noPlayersMessage.style.color = '#ef4444'; // Red color for error/warning
        noPlayersMessage.style.textAlign = 'center';
        noPlayersMessage.style.marginTop = '2rem';
        noPlayersMessage.style.fontSize = '1.1rem';
        noPlayersMessage.style.fontWeight = '600'; // Make it bold for visibility
        draftContainer.appendChild(noPlayersMessage);
        return; // Exit the function as there are no players to display
    }

    const positionGroups = {};
    allPlayers.forEach(player => {
        let position = player.position?.abbreviation || player.position?.name || 'Unknown';
        if (position === 'PK') position = 'K';
        
        const allowedPositions = ['QB', 'RB', 'WR', 'TE', 'K'];
        if (allowedPositions.includes(position)) {
            if (!positionGroups[position]) {
                positionGroups[position] = [];
            }
            positionGroups[position].push(player);
        }
    });
    
    // NEW: Create a set of opponent's drafted player IDs for quick lookup.
    const opponentDraftedIds = new Set(Object.values(opponentData.rosterSlots).filter(p => p).map(p => p.id));
    const canDraftFromCurrentTeam = playerDataForPlayer.draftedPlayers.length === 0;
    const rosterIsFull = isFantasyRosterFullFn(playerNum);

    const positionOrder = ['QB', 'RB', 'WR', 'TE', 'K'];
    positionOrder.forEach(position => {
        if (positionGroups[position] && positionGroups[position].length > 0) {
            const positionDiv = document.createElement('div');
            positionDiv.style.marginBottom = '1.5rem';
            
            const title = document.createElement('h4');
            title.textContent = `${position}s`;
            title.style.color = '#3b82f6';
            title.style.fontSize = '1.125rem';
            title.style.fontWeight = '600';
            title.style.marginBottom = '0.75rem';
            
            positionDiv.appendChild(title);
            
            const playersList = document.createElement('div');
            playersList.style.display = 'grid';
            playersList.style.gap = '0.5rem';
            
            positionGroups[position].forEach(player => {
                const playerDiv = document.createElement('div');
                playerDiv.classList.add('player-draft-card');
                
                playerDiv.innerHTML = `
                    <div class="player-card-header">
                        ${player.headshot && player.headshot.href ? `<img class="player-photo" src="${player.headshot.href}" alt="${player.displayName}">` : ''}
                        <div class="player-name-text">${player.displayName}</div>
                    </div>
                    <div class="player-meta-text">
                        <span>${player.position?.name || ''}</span>
                        <span class="draft-action-text">Draft</span>
                    </div>
                `;
                
                const draftActionText = playerDiv.querySelector('.draft-action-text');

                const isAlreadyInFantasyRoster = Object.values(playerDataForPlayer.rosterSlots).some(slotPlayer => slotPlayer && slotPlayer.id === player.id);
                const isDraftedByOpponent = opponentDraftedIds.has(player.id);
                const noAvailableSlotForPosition = isPlayerPositionUndraftableFn(playerNum, position);

                if (rosterIsFull || noAvailableSlotForPosition) {
                    playerDiv.classList.add('player-draft-card--disabled');
                    draftActionText.textContent = rosterIsFull ? 'Roster Full' : 'Slot Full';
                } else if (isDraftedByOpponent) {
                    playerDiv.classList.add('player-draft-card--disabled');
                    draftActionText.textContent = `Drafted by ${opponentData.name}`;
                } else if (!canDraftFromCurrentTeam || isAlreadyInFantasyRoster) {
                    playerDiv.classList.add('player-draft-card--drafted');
                    draftActionText.textContent = isAlreadyInFantasyRoster ? 'Drafted' : 'Drafted (1/turn)';
                    // No event listener for drafted cards
                } else {
                    playerDiv.classList.add('player-draft-card--available');
                    // Attach event listener only to the "Draft" text element
                    draftActionText.addEventListener('click', (event) => {
                        event.stopPropagation(); // Prevent the card's (non-existent) click handler from firing
                        draftPlayerCallback(playerNum, player, position);
                    });
                    draftActionText.textContent = 'Draft';
                }
                
                playersList.appendChild(playerDiv);
            });
            
            positionDiv.appendChild(playersList);
            draftContainer.appendChild(positionDiv);
        }
    });
    
    const defDiv = document.createElement('div');
    defDiv.style.marginBottom = '1.5rem';
    
    const defTitle = document.createElement('h4');
    defTitle.textContent = 'DEF';
    defTitle.style.color = '#3b82f6';
    defTitle.style.fontSize = '1.125rem';
    defTitle.style.fontWeight = '600';
    defTitle.style.marginBottom = '0.75rem';
    
    defDiv.appendChild(defTitle);
    
    const defPlayer = {
        id: `DEF-${playerDataForPlayer.team.id}`,
        displayName: playerDataForPlayer.team.name,
        position: { name: 'Defense', abbreviation: 'DEF' },
        headshot: { href: playerDataForPlayer.team.logo }
    };
    
    const defOption = document.createElement('div');
    defOption.classList.add('player-draft-card');
    
    defOption.innerHTML = `
        <div class="player-card-header">
            ${defPlayer.headshot && defPlayer.headshot.href ? `<img class="player-photo" src="${defPlayer.headshot.href}" alt="${defPlayer.displayName}">` : ''}
            <div class="player-name-text">${defPlayer.displayName}</div>
        </div>
        <div class="player-meta-text">
            <span>Defense</span>
            <span class="draft-action-text">Draft</span>
        </div>
    `;

    const draftActionTextDef = defOption.querySelector('.draft-action-text');
    
    const isDefAlreadyInFantasyRoster = Object.values(playerDataForPlayer.rosterSlots).some(slotPlayer => slotPlayer && slotPlayer.id === defPlayer.id);
    const isDefDraftedByOpponent = opponentDraftedIds.has(defPlayer.id);
    const noAvailableSlotForDef = isPlayerPositionUndraftableFn(playerNum, 'DEF');

    if (rosterIsFull || noAvailableSlotForDef) {
        defOption.classList.add('player-draft-card--disabled');
        draftActionTextDef.textContent = rosterIsFull ? 'Roster Full' : 'Slot Full';
    } else if (isDefDraftedByOpponent) {
        defOption.classList.add('player-draft-card--disabled');
        draftActionTextDef.textContent = `Drafted by ${opponentData.name}`;
    } else if (!canDraftFromCurrentTeam || isDefAlreadyInFantasyRoster) {
        defOption.classList.add('player-draft-card--drafted');
        draftActionTextDef.textContent = isDefAlreadyInFantasyRoster ? 'Drafted' : 'Drafted (1/turn)';
        // No event listener for drafted cards
    } else {
        defOption.classList.add('player-draft-card--available');
        // Attach event listener only to the "Draft" text element
        draftActionTextDef.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent the card's (non-existent) click handler from firing
            draftPlayerCallback(playerNum, defPlayer, 'DEF');
        });
        draftActionTextDef.textContent = 'Draft';
    }
    
    defDiv.appendChild(defOption);
    draftContainer.appendChild(defDiv);
}

// UI Function: Display fantasy roster
export function displayFantasyRoster(playerNum, playerDataForPlayer, allTeams, isPlayerRosterFull, openPlayerStatsModalCallback) {
    const playerContentArea = document.getElementById(`player${playerNum}-content-area`);
    const fantasyRoster = getOrCreateChild(playerContentArea, 'fantasy-roster');
    fantasyRoster.innerHTML = '';
    
    const title = document.createElement('h3');
    title.textContent = 'Fantasy Roster';
    title.style.color = '#3b82f6';
    title.style.marginBottom = '1.5rem';
    title.style.fontSize = '1.5rem';
    title.style.fontWeight = '700';
    
    fantasyRoster.appendChild(title);
    
    const rosterSlotsOrder = ['QB', 'RB', 'WR1', 'WR2', 'TE', 'Flex', 'DEF', 'K'];
    const playerRosterSlots = playerDataForPlayer.rosterSlots;
    
    let totalFantasyPoints = 0;

    rosterSlotsOrder.forEach(slot => {
        const playerInSlot = playerRosterSlots[slot]; 
        const div = document.createElement('div');
        div.classList.add('fantasy-roster-slot');

        const leftContent = document.createElement('div');
        leftContent.classList.add('slot-left-content');

        const slotSpan = document.createElement('span');
        slotSpan.classList.add('slot-label');
        slotSpan.textContent = `${slot}:`;
        leftContent.appendChild(slotSpan);

        if (playerInSlot && playerInSlot.headshot && playerInSlot.headshot.href) {
            const img = document.createElement('img');
            img.className = 'player-photo-fantasy';
            img.src = playerInSlot.headshot.href;
            img.alt = playerInSlot.displayName;
            leftContent.appendChild(img);
        }
        
        const playerSpan = document.createElement('span');
        playerSpan.classList.add('player-name-fantasy');
        playerSpan.textContent = playerInSlot ? playerInSlot.displayName : 'Empty';
        leftContent.appendChild(playerSpan);

        div.appendChild(leftContent);

        const rightContent = document.createElement('div');
        rightContent.classList.add('slot-right-content');
        const pointsSpan = document.createElement('span');
        pointsSpan.classList.add('points-display');
        if (playerInSlot) {
            if (playerInSlot.fantasyPoints === null) {
                pointsSpan.textContent = 'Loading FPTS...';
                pointsSpan.style.color = '#f59e0b';
            } else if (typeof playerInSlot.fantasyPoints === 'number') {
                pointsSpan.textContent = `${playerInSlot.fantasyPoints.toFixed(2)} FPTS`;
                pointsSpan.style.color = '#10b981';
                totalFantasyPoints += playerInSlot.fantasyPoints;
            } else {
                pointsSpan.textContent = 'N/A';
                pointsSpan.style.color = '#ef4444';
            }
        } else {
            pointsSpan.textContent = '';
        }
        rightContent.appendChild(pointsSpan);
        div.appendChild(rightContent);

        if (playerInSlot && isPlayerRosterFull) {
            div.style.cursor = 'pointer';
            div.classList.add('player-card--clickable-stats'); 
            div.addEventListener('click', () => openPlayerStatsModalCallback(playerInSlot));
        }

        fantasyRoster.appendChild(div);
    });

    const totalPointsDiv = document.createElement('div');
    totalPointsDiv.className = 'total-fantasy-points';
    totalPointsDiv.innerHTML = `Total Fantasy Points: <span>${totalFantasyPoints.toFixed(2)} FPTS</span>`;
    fantasyRoster.appendChild(totalPointsDiv);
}