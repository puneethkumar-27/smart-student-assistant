// JARVIS Student Assistant frontend
// Set this to your backend endpoint before connecting your AI.
const API_URL = "http://127.0.0.1:5000/chat";
// Keep the same LangGraph conversation thread while this browser session is used.
const THREAD_ID = (() => {
  const key = "jarvis_student_thread_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `thread-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    sessionStorage.setItem(key, id);
  }
  return id;
})();

const messages = document.getElementById("messages");
const input = document.getElementById("prompt-input");
const sendButton = document.getElementById("send-button");
const micButton = document.getElementById("mic-button");
const typing = document.getElementById("typing-indicator");
const coreStatus = document.getElementById("core-status");

function setState(state, label) {
  document.body.classList.remove("listening", "thinking", "speaking");
  if (state) document.body.classList.add(state);
  coreStatus.innerHTML = `<span class="tiny-dot"></span> ${label}`;
}

function addMessage(text, role = "assistant") {
  const row = document.createElement("div");
  row.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "S" : "J";

  const content = document.createElement("div");
  content.className = "message-content";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const name = document.createElement("span");
  name.textContent = role === "user" ? "YOU" : "JARVIS";
  const time = document.createElement("span");
  time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  meta.append(name, time);

  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  content.append(meta, paragraph);
  row.append(avatar, content);
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
  return paragraph;
}

async function sendMessage(message) {
  const text = (message ?? input.value).trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";
  input.style.height = "auto";
  typing.classList.add("visible");
  setState("thinking", "PROCESSING REQUEST");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, thread_id: THREAD_ID })
    });

    if (!response.ok) throw new Error(`Backend returned ${response.status}`);
    const data = await response.json();
    const answer = data.reply ?? data.response ?? data.message ?? "The assistant returned an empty response.";
    typing.classList.remove("visible");
    addMessage(String(answer), "assistant");
    setState("speaking", "RESPONSE RECEIVED");
    speakIfEnabled(String(answer));
  } catch (error) {
    typing.classList.remove("visible");
    addMessage(
      "I can't reach the AI backend yet. Start your backend and check API_URL in app.js. " +
      "For local testing, the frontend expects POST " + API_URL +
      " with { \"message\": \"...\" } and a JSON response containing { \"reply\": \"...\" }.",
      "assistant"
    );
    setState("", "AWAITING CONNECTION");
    console.error("Assistant connection error:", error);
  }
}

sendButton.addEventListener("click", () => sendMessage());
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 110) + "px";
});

document.querySelectorAll(".quick-card").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const mode = button.dataset.mode;
    const labels = {
      chat: ["Good evening.", "How can I help?"],
      study: ["Study mode.", "Let's master a topic."],
      notes: ["Knowledge upload.", "Ready for your notes."],
      quiz: ["Training protocol.", "Shall we test your knowledge?"],
      planner: ["Planning system.", "Let's organise your time."]
    };
    const [first, second] = labels[mode] || labels.chat;
    document.getElementById("page-title").innerHTML = `${first} <span>${second}</span>`;
    if (mode !== "chat") {
      addMessage(`You've selected ${button.textContent.trim()}. This is a frontend navigation prototype; connect this mode to a matching backend feature to enable it.`, "assistant");
    }
  });
});

document.getElementById("clear-chat").addEventListener("click", () => {
  messages.replaceChildren();
  addMessage("Conversation cleared. I'm ready for your next request.", "assistant");
  setState("", "AWAITING INPUT");
});

// Optional browser speech recognition (Chrome/Edge support varies by device).
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micButton.addEventListener("click", () => {
    try {
      recognition.start();
      micButton.classList.add("listening");
      setState("listening", "LISTENING");
    } catch (error) {
      console.warn("Speech recognition could not start:", error);
    }
  });

  recognition.onresult = (event) => {
    input.value = event.results[0][0].transcript;
    micButton.classList.remove("listening");
    setState("", "VOICE INPUT RECEIVED");
    sendMessage();
  };
  recognition.onerror = () => {
    micButton.classList.remove("listening");
    setState("", "VOICE INPUT UNAVAILABLE");
  };
  recognition.onend = () => micButton.classList.remove("listening");
} else {
  micButton.title = "Voice input is not supported in this browser";
  document.getElementById("voice-support").textContent = "VOICE INPUT NOT SUPPORTED IN THIS BROWSER";
  micButton.addEventListener("click", () => {
    addMessage("Voice input is not supported by this browser. Try a recent version of Chrome or Edge.", "assistant");
  });
}

// Voice output is optional. Set SPEAK_RESPONSES to false to disable.
const SPEAK_RESPONSES = false;
function speakIfEnabled(text) {
  if (!SPEAK_RESPONSES || !("speechSynthesis" in window)) {
    setTimeout(() => setState("", "AWAITING INPUT"), 1200);
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => setState("", "AWAITING INPUT");
  window.speechSynthesis.speak(utterance);
}
