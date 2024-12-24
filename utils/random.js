// utils/random.js

// Generate a random username like "User123"
function randomUsername() {
    const randNum = Math.floor(Math.random() * 900 + 100); // e.g. 123
    console.log('Generated username:', 'User' + randNum);
    return 'User' + randNum;
  }
  
  // Generate a random hex color
  function randomColor() {
    const hex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    return '#' + hex;
  }
  
  module.exports = { randomUsername, randomColor };