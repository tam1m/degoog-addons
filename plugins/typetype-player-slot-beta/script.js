(function () {
  // Dedup: degoog may inject the same slot panel twice. If this card's
  // data-id matches an earlier card, remove the duplicate panel wrapper.
  var cards = document.querySelectorAll(".typetype-beta-card");
  if (cards.length > 1) {
    var last = cards[cards.length - 1];
    var lastPanel = last.closest(".typetype-beta");
    var lastId = lastPanel ? lastPanel.getAttribute("data-id") : null;
    for (var i = 0; i < cards.length - 1; i++) {
      var otherPanel = cards[i].closest(".typetype-beta");
      if (otherPanel && otherPanel.getAttribute("data-id") === lastId) {
        // Remove the wrapper div that degoog created for this slot panel
        var wrapper = lastPanel?.parentElement; // .results-slot-panel-body
        var panel = wrapper?.parentElement;      // .results-slot-panel
        if (panel) panel.remove();
        return;
      }
    }
  }

  document.addEventListener("click", function (e) {
    var card = e.target.closest(".typetype-beta-card");
    if (!card) return;

    var player = card.closest(".typetype-beta");
    if (!player) return;

    var iframe = player.querySelector(".typetype-beta-iframe");
    var wrap = player.querySelector(".typetype-beta-iframe-wrap");
    var wasExpanded = card.classList.contains("expanded");

    if (wasExpanded) {
      // Collapse
      card.classList.remove("expanded");
      wrap.style.display = "none";
      if (iframe && iframe.src && iframe.src !== "about:blank") {
        iframe.src = "";
        iframe.removeAttribute("src");
      }
    } else {
      // Expand: set src before showing to avoid NS_BINDING_ABORTED in Firefox
      if (iframe && iframe.dataset.src) {
        iframe.src = iframe.dataset.src;
      }
      card.classList.add("expanded");
      wrap.style.display = "block";
    }
  });
})();
