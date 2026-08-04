(function () {
  document.addEventListener("click", function (e) {
    var card = e.target.closest(".typetype-player-card");
    if (!card) return;

    var player = card.closest(".typetype-player");
    if (!player) return;

    var iframe = player.querySelector(".typetype-player-iframe");
    var wrap = player.querySelector(".typetype-player-iframe-wrap");
    var wasExpanded = card.classList.contains("expanded");

    if (wasExpanded) {
      // Collapse
      card.classList.remove("expanded");
      wrap.style.display = "none";
      if (iframe && iframe.src) {
        iframe.src = "";
        iframe.removeAttribute("src");
      }
    } else {
      // Expand
      card.classList.add("expanded");
      wrap.style.display = "block";
      if (iframe && iframe.dataset.src && (!iframe.src || iframe.src === "")) {
        iframe.src = iframe.dataset.src;
      }
    }
  });
})();
