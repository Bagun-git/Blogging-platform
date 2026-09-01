
const themeToggle = document.getElementById("themeToggle");

// Load saved theme
if (localStorage.getItem("siteTheme") === "light") {
    document.body.classList.add("light-mode");
}

// Toggle theme
if (themeToggle) {
    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("light-mode");

        if (document.body.classList.contains("light-mode")) {
            localStorage.setItem("siteTheme", "light");
        } else {
            localStorage.setItem("siteTheme", "dark");
        }
    });
}
const msgBox = document.querySelector('.chat-messages');
if (msgBox) {
  msgBox.scrollTop = msgBox.scrollHeight;
}

document.getElementById('chatForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const toUserId = form.toUserId.value;
  const text = form.text.value.trim();

  if (!text) return;

  const res = await fetch('/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ toUserId, text })
  });

  if (res.ok) {
    form.text.value = '';
    location.reload();
  } else {
    alert("Failed to send message.");
  }
});

// ✅ Auto-send file immediately after selected
const fileInput = document.getElementById('fileInput');
if (fileInput) {
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    const toUserId = document.querySelector('input[name="toUserId"]').value;

    if (!file || !toUserId) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('toUserId', toUserId);

    try {
      const res = await fetch('/messages', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        fileInput.value = '';  // reset file input
        location.reload();
      } else {
        alert("Failed to send file.");
      }
    } catch (err) {
      console.error("Upload error:", err);
    }
  });
}

