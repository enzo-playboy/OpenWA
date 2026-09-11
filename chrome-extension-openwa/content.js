(function () {
  console.log('🤖 OpenWA Sofia IA Extension carregada.');

  const API_BASE = 'http://localhost:2785/api/ai-agent';
  const API_KEY = 'dev-admin-key';
  let currentChatId = null;

  function getCurrentChatIdentifier() {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return null;

    const titleEl = mainHeader.querySelector('span[title], div[title]');
    const titleText = titleEl ? (titleEl.getAttribute('title') || titleEl.innerText) : '';
    const allText = mainHeader.innerText || '';
    const phoneMatch = allText.match(/\+?55\s?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/) || titleText.match(/\+?\d{10,13}/);

    if (phoneMatch) {
      return phoneMatch[0].replace(/\D/g, '') + '@c.us';
    }
    if (titleText && titleText.trim().length > 0) {
      return titleText.trim();
    }
    return null;
  }

  async function checkChatStatus(chatId) {
    try {
      const res = await fetch(`${API_BASE}/chats/status?chatId=${encodeURIComponent(chatId)}`, {
        headers: { 'x-api-key': API_KEY }
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.paused || false;
    } catch (e) {
      return false;
    }
  }

  async function toggleChatPause(chatId, newPauseState) {
    try {
      const res = await fetch(`${API_BASE}/chats/toggle-pause`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chatId, pause: newPauseState })
      });
      if (!res.ok) return newPauseState;
      const data = await res.json();
      return data.paused;
    } catch (e) {
      return newPauseState;
    }
  }

  function updateButtonState(btn, isPaused) {
    if (isPaused) {
      btn.className = 'sofia-ia-toggle-btn paused';
      btn.innerHTML = '<span class="sofia-ia-dot"></span> 🔴 Sofia: PAUSADA';
    } else {
      btn.className = 'sofia-ia-toggle-btn active';
      btn.innerHTML = '<span class="sofia-ia-dot"></span> 🟢 Sofia: ATIVA';
    }
  }

  async function syncButton() {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) {
      const existing = document.getElementById('sofia-ia-toggle-btn');
      if (existing) existing.remove();
      currentChatId = null;
      return;
    }

    const chatId = getCurrentChatIdentifier();
    if (!chatId) return;

    let btn = document.getElementById('sofia-ia-toggle-btn');

    // Se mudou o chat ou o botão sumiu do DOM
    if (!btn || currentChatId !== chatId) {
      // Remove botões duplicados antigos se existirem
      document.querySelectorAll('#sofia-ia-toggle-btn').forEach(b => b.remove());

      currentChatId = chatId;
      const isPaused = await checkChatStatus(chatId);

      btn = document.createElement('button');
      btn.id = 'sofia-ia-toggle-btn';
      updateButtonState(btn, isPaused);

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const currentlyPaused = btn.classList.contains('paused');
        btn.style.opacity = '0.5';
        const updatedState = await toggleChatPause(chatId, !currentlyPaused);
        updateButtonState(btn, updatedState);
        btn.style.opacity = '1';
      });

      // Injeta o botão diretamente no cabeçalho principal (evita cortes de overflow: hidden)
      mainHeader.appendChild(btn);
    }
  }

  // Intervalo controlado para manter o botão único e sem sobreposição
  setInterval(syncButton, 1000);
})();
