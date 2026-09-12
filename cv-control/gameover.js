// Non-blocking replacement for the game's alert()-based game over.
// Classic script (not a module) so main.js can call gameOver() directly.
// Loading the page with ?nodie=1 disables death entirely (used by tests).

var __gameOverShown = /[?&]nodie=1/.test(window.location.search);

function gameOver(title, score, coins) {
    if (__gameOverShown) return;
    __gameOverShown = true;

    var overlay = document.createElement("div");
    overlay.id = "cv-gameover";
    overlay.style.cssText =
        "position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;background:rgba(10,12,16,.85);" +
        "color:#fff;font-family:system-ui,-apple-system,sans-serif;text-align:center;";
    overlay.innerHTML =
        '<div style="font-size:56px;font-weight:800;margin-bottom:8px;">' + title + "</div>" +
        '<div style="font-size:24px;color:#c5cad3;">Score: ' + Math.round(score) +
        " &nbsp;•&nbsp; Coins: " + coins + "</div>" +
        '<div id="cv-restart" style="font-size:18px;color:#8ab4f8;margin-top:18px;"></div>';
    document.body.appendChild(overlay);

    var secs = 3;
    var label = document.getElementById("cv-restart");
    label.textContent = "Restarting in " + secs + "…";
    var timer = setInterval(function () {
        secs--;
        if (secs <= 0) {
            clearInterval(timer);
            window.location.reload();
        } else {
            label.textContent = "Restarting in " + secs + "…";
        }
    }, 1000);
}
