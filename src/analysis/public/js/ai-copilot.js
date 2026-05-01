(function () {
  const questionEl = document.getElementById("ai-question");
  const askBtn = document.getElementById("ai-ask");
  const answerEl = document.getElementById("ai-answer");
  const quickWrap = document.getElementById("ai-copilot-quick");
  if (!questionEl || !askBtn || !answerEl || !quickWrap) return;

  function getSelectedEventFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("event");
  }

  function setAnswer(text, isError = false) {
    answerEl.textContent = text;
    answerEl.style.color = isError ? "#fca5a5" : "";
  }

  async function askCopilot() {
    const question = questionEl.value.trim();
    if (!question) {
      setAnswer("Type a question first.");
      return;
    }

    askBtn.disabled = true;
    askBtn.textContent = "Analyzing...";
    setAnswer("Crunching event data with Gemini...");

    try {
      const response = await fetch("/analysis/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          eventID: getSelectedEventFromUrl(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Gemini request failed");
      }
      setAnswer(data.answer || "No response.");
    } catch (e) {
      setAnswer(`AI search failed: ${e.message}`, true);
    } finally {
      askBtn.disabled = false;
      askBtn.textContent = "Ask Gemini";
    }
  }

  askBtn.addEventListener("click", askCopilot);
  questionEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      askCopilot();
    }
  });

  quickWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".ai-chip");
    if (!btn) return;
    questionEl.value = btn.textContent.trim();
    askCopilot();
  });
})();
