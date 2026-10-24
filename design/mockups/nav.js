/* Mockup scaffolding only (not product code): lets a reviewer click through
   the set with the keys the real demo uses. Each screen lists its targets in
   <body data-keys='{"ArrowRight":"demo-loading.html"}'>. */
(function () {
  var map = {};
  try { map = JSON.parse(document.body.getAttribute("data-keys") || "{}"); } catch (e) { return; }
  document.addEventListener("keydown", function (ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var target = map[ev.key] || map[ev.key.toLowerCase()];
    if (target) { ev.preventDefault(); window.location.href = target; }
  });
})();
