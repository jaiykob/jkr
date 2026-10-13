/* The booking pages' copy of the guess review switch in js/site.js: guesses read like
   normal text (css/guess.css); ?guesses in the address shows them all in red for the
   rest of the visit, and ?guesses=0 turns that off. */
(function () {
  try {
    var gq = new URLSearchParams(location.search).get('guesses');
    if (gq !== null) sessionStorage.setItem('showGuesses', gq === '0' ? '' : '1');
    if (sessionStorage.getItem('showGuesses')) document.documentElement.classList.add('show-guesses');
  } catch (e) { /* private mode: guesses stay quiet */ }
})();
