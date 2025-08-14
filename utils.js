/**
 * utils.js
 * Contains generic utility functions.
 */

// Fisher-Yates shuffle algorithm
export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Selects a random element from an array.
 * @param {Array} array - The array to select from.
 * @returns {*} A random element from the array.
 */
export function getRandomElement(array) {
    if (!array || array.length === 0) {
        return undefined;
    }
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}