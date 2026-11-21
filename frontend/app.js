// JARVIS Student Assistant frontend
// Set this to your backend endpoint before connecting your AI.
const API_URL = "http://127.0.0.1:5000/chat";
const UPLOAD_URL = "http://127.0.0.1:5000/upload";
// Current mode: chat, study, notes, quiz or planner. Sent to the backend with every message.
let currentMode = "chat";
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
const attachButton = document.getElementById("attach-button");
const fileInput = document.getElementById("file-input");
const voiceToggle = document.getElementById("voice-toggle");

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
  if (role === "user") paragraph.textContent = text;
  else renderRich(paragraph, text);
  content.append(meta, paragraph);
  row.append(avatar, content);
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
  return paragraph;
}

// ---------- Rich replies: timetable tables and flowcharts ----------
// The assistant can include ```table ... ``` (rows separated by " | ")
// and ```mermaid ... ``` (flowchart) blocks. Everything else is plain text.
const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";
let mermaidPromise = null;
let diagramCount = 0;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import(MERMAID_URL).then((mod) => {
      const m = mod.default;
      m.initialize({
        startOnLoad: false,
        theme: "base",
        securityLevel: "strict",
        themeVariables: {
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: "14px",
          primaryColor: "#12334a",
          primaryBorderColor: "#3dbbe0",
          primaryTextColor: "#e5f7ff",
          secondaryColor: "#12334a",
          tertiaryColor: "#0b1b2d",
          lineColor: "#7ee3ff",
          textColor: "#e5f7ff",
          edgeLabelBackground: "#0b1b2d"
        }
      });
      return m;
    });
  }
  return mermaidPromise;
}

function buildTable(code) {
  const rows = code.trim().split("\n").map((line) => line.split("|").map((c) => c.trim())).filter((r) => r.some(Boolean));
  if (rows.length < 2) return null;
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  table.className = "plan-table";
  const thead = table.createTHead().insertRow();
  rows[0].forEach((h) => { const th = document.createElement("th"); th.textContent = h; thead.appendChild(th); });
  const tbody = table.createTBody();
  rows.slice(1).forEach((r) => {
    const tr = tbody.insertRow();
    rows[0].forEach((_, i) => { tr.insertCell().textContent = r[i] || ""; });
  });
  wrap.appendChild(table);
  return wrap;
}

function buildDiagram(code) {
  const box = document.createElement("div");
  box.className = "diagram-box";
  box.textContent = "Drawing flowchart...";
  loadMermaid()
    .then((m) => m.render(`jarvis-diagram-${++diagramCount}`, code.trim()))
    .then(({ svg }) => { box.innerHTML = svg; messages.scrollTop = messages.scrollHeight; })
    .catch((err) => {
      console.warn("Flowchart could not be drawn:", err);
      box.className = "diagram-box diagram-failed";
      box.textContent = "I could not draw this flowchart, here is its text form:\n" + code.trim();
    });
  return box;
}

function renderRich(container, text) {
  const pattern = /```(mermaid|table)\s*\n([\s\S]*?)```/g;
  let last = 0;
  let match;
  const addText = (chunk) => {
    const t = chunk.replace(/^\s+|\s+$/g, "");
    if (!t) return;
    const span = document.createElement("div");
    span.className = "reply-text";
    span.textContent = t;
    container.appendChild(span);
  };
  while ((match = pattern.exec(text)) !== null) {
    addText(text.slice(last, match.index));
    const node = match[1] === "table" ? buildTable(match[2]) : buildDiagram(match[2]);
    if (node) container.appendChild(node);
    else addText(match[2]);
    last = pattern.lastIndex;
  }
  addText(text.slice(last));
  if (!container.childNodes.length) container.textContent = text;
}

// Text that should be read aloud: drop the table/flowchart blocks.
function speakableText(text) {
  const plain = text.replace(/```(mermaid|table)[\s\S]*?```/g, " ");
  const had = plain.length !== text.length;
  const out = plain.trim();
  if (had) return (out ? out + " " : "") + "I have put it on screen for you.";
  return out;
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
      body: JSON.stringify({ message: text, thread_id: THREAD_ID, mode: currentMode })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Backend returned ${response.status}`);
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

const MODE_INFO = {
  chat: {
    title: ["Good evening.", "How can I help?"],
    intro: "Assistant mode. Ask me about exam dates, attendance or marks."
  },
  study: {
    title: ["Study mode.", "Let's master a topic."],
    intro: "Study mode is on. Tell me a topic, for example: Explain stacks and queues. I will teach it step by step. You can also say: draw a flowchart of how a stack works."
  },
  notes: {
    title: ["Knowledge upload.", "Ready for your notes."],
    intro: "Notes mode is on. Click the paperclip to attach a PDF or text file and I will summarise it. You can then ask questions about it."
  },
  quiz: {
    title: ["Training protocol.", "Shall we test your knowledge?"],
    intro: "Quiz mode is on. Tell me a topic, or attach a file, and I will create 5 questions for you."
  },
  planner: {
    title: ["Planning system.", "Let's organise your time."],
    intro: "Planner mode is on. Tell me your subjects and exam dates, for example: Maths on 2026-12-10, Physics on 2026-12-15, and I will build a timetable."
  }
};

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    currentMode = MODE_INFO[button.dataset.mode] ? button.dataset.mode : "chat";
    const info = MODE_INFO[currentMode];
    const [first, second] = info.title;
    document.getElementById("page-title").innerHTML = `${first} <span>${second}</span>`;
    addMessage(info.intro, "assistant");
    speakIfEnabled(info.intro);
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

// ---------- Voice replies (text to speech) ----------
// The speaker button in the top bar turns voice replies on or off.
let speakOn = true;
try { speakOn = localStorage.getItem("jarvis_voice") !== "off"; } catch (e) {}

function refreshVoiceButton() {
  voiceToggle.textContent = speakOn ? "🔊" : "🔇";
  voiceToggle.title = speakOn ? "Voice replies ON (click to mute)" : "Voice replies OFF (click to turn on)";
}
refreshVoiceButton();

voiceToggle.addEventListener("click", () => {
  speakOn = !speakOn;
  try { localStorage.setItem("jarvis_voice", speakOn ? "on" : "off"); } catch (e) {}
  refreshVoiceButton();
  if (!speakOn && "speechSynthesis" in window) window.speechSynthesis.cancel();
  if (speakOn) speakIfEnabled("Voice replies are on.");
});

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /en-(IN|GB)/i.test(v.lang) && /male|ravi|george|daniel|google uk english male/i.test(v.name)) ||
    voices.find((v) => /en-(IN|GB|US)/i.test(v.lang)) ||
    null
  );
}

function speakIfEnabled(text) {
  if (!speakOn || !("speechSynthesis" in window)) {
    setTimeout(() => setState("", "AWAITING INPUT"), 1200);
    return;
  }
  window.speechSynthesis.cancel();
  // Remove symbols that sound odd when read aloud, and keep it a sensible length.
  const spoken = speakableText(text).replace(/[*#_`>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1500);
  const utterance = new SpeechSynthesisUtterance(spoken);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1;
  utterance.pitch = 0.9;
  utterance.onstart = () => setState("speaking", "SPEAKING");
  utterance.onend = () => setState("", "AWAITING INPUT");
  utterance.onerror = () => setState("", "AWAITING INPUT");
  window.speechSynthesis.speak(utterance);
}
// Some browsers load their voice list late.
if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = () => {};

// ---------- Attach a PDF / text file and get a summary ----------
attachButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  await uploadFile(file);
});

async function uploadFile(file) {
  // Uploaded files are summarised in notes mode.
  document.querySelectorAll(".nav-item").forEach((item) =>
    item.classList.toggle("active", item.dataset.mode === "notes"));
  currentMode = "notes";
  document.getElementById("page-title").innerHTML =
    `${MODE_INFO.notes.title[0]} <span>${MODE_INFO.notes.title[1]}</span>`;

  addMessage(`📎 ${file.name}`, "user");
  typing.classList.add("visible");
  setState("thinking", "READING FILE");

  const form = new FormData();
  form.append("file", file);
  form.append("thread_id", THREAD_ID);

  try {
    const response = await fetch(UPLOAD_URL, { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    typing.classList.remove("visible");
    if (!response.ok) throw new Error(data.error || `Backend returned ${response.status}`);
    addMessage(String(data.reply || "I could not produce a summary."), "assistant");
    setState("speaking", "SUMMARY READY");
    speakIfEnabled(String(data.reply || ""));
  } catch (error) {
    typing.classList.remove("visible");
    const reason = error && error.message && !/Failed to fetch/i.test(error.message)
      ? error.message
      : "I can't reach the AI backend. Make sure python server.py is running.";
    addMessage(reason, "assistant");
    setState("", "AWAITING INPUT");
    console.error("Upload error:", error);
  }
}
