(function () {
  // Dedup: degoog may inject the same slot panel twice.
  // Use MutationObserver — fires whenever panels are added to the DOM.
  var slotAbove = document.getElementById("slot-above-results");
  if (slotAbove && !slotAbove.__ttBetaObserved) {
    slotAbove.__ttBetaObserved = true;
    new MutationObserver(function () {
      var cards = document.querySelectorAll(".typetype-beta-card");
      var seen = {};
      for (var i = cards.length - 1; i >= 0; i--) {
        var panel = cards[i].closest(".typetype-beta");
        var id = panel ? panel.getAttribute("data-id") : null;
        if (!id) continue;
        if (seen[id]) {
          var body = panel.parentElement;
          var wrapper = body ? body.parentElement : null;
          if (wrapper) wrapper.remove();
        } else {
          seen[id] = true;
        }
      }
    }).observe(slotAbove, { childList: true, subtree: true });
  }

  // Single click handler: route to card expand or debug toggle
  document.addEventListener("click", function (e) {
    // Debug toggle — check first since debug bar is outside .typetype-beta-card
    var debug = e.target.closest(".typetype-beta-debug");
    if (debug) {
      var detail = debug.querySelector(".typetype-beta-debug-detail");
      if (detail) {
        detail.style.display = detail.style.display === "none" ? "block" : "none";
      }
      return;
    }

    // Card expand/collapse — only if an embed URL is present
    var card = e.target.closest(".typetype-beta-card");
    if (!card) return;

    var player = card.closest(".typetype-beta");
    if (!player) return;

    var iframe = player.querySelector(".typetype-beta-iframe");
    var wrap = player.querySelector(".typetype-beta-iframe-wrap");

    // Don't expand if there's no embed URL (debug-only / suppressed card)
    if (!iframe || !iframe.dataset.src) return;

    var wasExpanded = card.classList.contains("expanded");

    if (wasExpanded) {
      card.classList.remove("expanded");
      wrap.style.display = "none";
      if (iframe.src && iframe.src !== "about:blank") {
        iframe.src = "";
        iframe.removeAttribute("src");
      }
    } else {
      iframe.src = iframe.dataset.src;
      card.classList.add("expanded");
      wrap.style.display = "block";
    }
  });
})();
