/**
 * uiAnimations.js
 * Manages UI elements related to animations and overlays.
 */

// NEW: Animation state
let animationInterval = null;
let activeImage = 1;

/**
 * NEW: Starts a logo cycling animation using a cross-fade effect.
 * @param {Array<object>} logos - Array of logo objects, e.g., [{ src: 'url', isAvatar: false }]
 * @param {number} interval - The time in ms between fades.
 * @param {function} [onEmptyCallback] - Optional callback to run when the logo array is running low.
 */
export function startLogoCyclingAnimation(logos, interval, onEmptyCallback = null) {
    if (animationInterval) {
        clearInterval(animationInterval);
    }
    
    const logoImg1 = document.getElementById('cycling-logo-1');
    const logoImg2 = document.getElementById('cycling-logo-2');
    if (!logoImg1 || !logoImg2) return;
    
    let currentIndex = 0;
    activeImage = 1;

    // Set initial image
    const firstLogo = logos[currentIndex % logos.length];
    logoImg1.src = firstLogo.src;
    logoImg1.className = firstLogo.isAvatar ? 'cycling-logo is-avatar' : 'cycling-logo';
    logoImg2.className = 'cycling-logo fade-out';

    animationInterval = setInterval(() => {
        currentIndex++;
        if (!logos[currentIndex]) {
            // Handle cases where the array might be empty or index is out of bounds
            if (onEmptyCallback) onEmptyCallback();
            if (logos.length === 0) return; // Prevent errors if logos array is still empty
        }

        const nextLogo = logos[currentIndex % logos.length];
        
        const currentImg = activeImage === 1 ? logoImg1 : logoImg2;
        const nextImg = activeImage === 1 ? logoImg2 : logoImg1;

        // Preload next image
        nextImg.src = nextLogo.src;
        nextImg.className = nextLogo.isAvatar ? 'cycling-logo is-avatar' : 'cycling-logo';

        // Fade out current, fade in next
        currentImg.classList.add('fade-out');
        nextImg.classList.remove('fade-out');

        activeImage = activeImage === 1 ? 2 : 1;
        
        // If the logo array is running low, call the callback to fetch more
        if (onEmptyCallback && logos.length - currentIndex < 10) {
            onEmptyCallback();
        }
    }, interval);
}

/**
 * NEW: Stops the logo cycling animation.
 */
export function stopLogoCyclingAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
}


// UI Function: Show/Hide the team animation overlay
export function showTeamAnimationOverlay(text, logoSrc = '', isAvatar = false) {
    const animationOverlay = document.getElementById('team-animation');
    const animationText = document.getElementById('animation-text');
    const logoImg1 = document.getElementById('cycling-logo-1');
    const logoImg2 = document.getElementById('cycling-logo-2');

    if (!logoImg1 || !logoImg2) return;

    animationText.textContent = text;
    
    // Stop any running animation
    stopLogoCyclingAnimation();

    if (logoSrc) {
        logoImg1.src = logoSrc;
        logoImg1.className = isAvatar ? 'cycling-logo is-avatar' : 'cycling-logo';
        logoImg2.className = 'cycling-logo fade-out'; // Ensure second image is hidden
        activeImage = 1;
    } else {
        // If no logo, hide both
        logoImg1.className = 'cycling-logo fade-out';
        logoImg2.className = 'cycling-logo fade-out';
    }
    
    animationOverlay.style.display = 'flex';
}

export function hideTeamAnimationOverlay() {
    stopLogoCyclingAnimation();
    const logoImg1 = document.getElementById('cycling-logo-1');
    const logoImg2 = document.getElementById('cycling-logo-2');
    if (logoImg1) logoImg1.classList.remove('is-avatar');
    if (logoImg2) logoImg2.classList.remove('is-avatar');
    document.getElementById('team-animation').style.display = 'none';
}