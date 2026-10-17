/* Classic script (not a module), loaded by index.html only. */
/* file-protocol-hint: browsers block ES modules on file://, so main.js never runs when index.html is double-clicked. */
if (location.protocol === "file:") {
  document.getElementById("banner").textContent =
    "Diese Datei braucht einen Webserver. Zum direkten Öffnen bitte dist/flottenmanifest.html verwenden. · " +
    "This file needs a web server. To open the page directly, use dist/flottenmanifest.html.";
}
