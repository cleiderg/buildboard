// Ask before destructive actions (forms marked with data-confirm).
document.addEventListener('submit', function (e) {
  var msg = e.target.getAttribute('data-confirm');
  if (msg && !window.confirm(msg)) e.preventDefault();
});

// Open the chat at the newest message.
var end = document.getElementById('end');
if (end) end.scrollIntoView();
