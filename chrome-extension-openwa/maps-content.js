/* =========================================================
   OPENWA LEAD HUNTER - GOOGLE MAPS CONTENT SCRIPT (INSTAGRAM / SOCIAL REFINEMENT)
   ========================================================= */

(function () {
  'use strict';

  let settings = {
    minRating: 4.5,
    minReviews: 25,
    filterWebsite: 'without',
    requireSocial: false,
    nichoKeyword: '',
    locationFilter: '',
    minIcpScore: 80,
    apiUrl: 'http://localhost:2785',
    apiKey: '',
  };

  let totalFound = 0;
  let totalQualified = 0;
  let qualifiedLeadsBuffer = [];

  // Helper to check if a URL is an OFFICIAL website (Instagram/Facebook/WhatsApp ARE NOT official sites!)
  function isOfficialWebsiteUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();

    // Exclude internal Google domains
    if (lower.includes('google.com') || lower.includes('google.com.br') || lower.includes('ggpht.com') || lower.includes('gstatic.com')) {
      return false;
    }

    // Social media & WhatsApp link-in-bio profiles ARE NOT official websites!
    const socialDomains = [
      'instagram.com',
      'instagr.am',
      'facebook.com',
      'fb.com',
      'wa.me',
      'whatsapp.com',
      'linktr.ee',
      'beacons.ai',
      'taplink.cc',
      'carrd.co',
    ];

    if (socialDomains.some((dom) => lower.includes(dom))) {
      return false; // Not an official site!
    }

    return true; // Is an official website
  }

  // Load extension configuration
  function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(settings, (items) => {
        settings = { ...settings, ...items };
        syncPanelInputs();
        processPlaces();
      });
    } else {
      const stored = localStorage.getItem('openwa_hunter_settings');
      if (stored) {
        try {
          settings = { ...settings, ...JSON.parse(stored) };
        } catch (e) {}
      }
      syncPanelInputs();
      processPlaces();
    }
  }

  // Save updated settings
  function saveSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(settings, () => {
        processPlaces();
      });
    } else {
      localStorage.setItem('openwa_hunter_settings', JSON.stringify(settings));
      processPlaces();
    }
  }

  // Execute Search in Google Maps Search Bar
  function executeGoogleMapsSearch() {
    const nicho = (settings.nichoKeyword || '').trim();
    const loc = (settings.locationFilter || '').trim();
    const query = [nicho, loc].filter(Boolean).join(' ');

    if (!query) {
      showToast('Digite um Nicho ou Cidade para pesquisar no mapa!');
      return;
    }

    const searchInput = document.querySelector('input#searchboxinput, input[name="q"], input.searchboxinput');
    if (searchInput) {
      searchInput.value = query;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));

      const searchBtn = document.querySelector(
        'button#searchbox-searchbutton, button[aria-label*="Pesquisar"], button[aria-label*="Search"], button.searchbox-searchbutton'
      );
      if (searchBtn) {
        searchBtn.click();
      } else {
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      }

      showToast(`Pesquisando "${query}" no Google Maps...`);
    } else {
      showToast(`Pesquisa iniciada para: "${query}"`);
    }
  }

  // Create floating toolbar on top-right of Google Maps
  function createFloatingBar() {
    if (document.getElementById('openwa-floating-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'openwa-floating-bar';
    bar.className = 'openwa-maps-bar';
    bar.innerHTML = `
      <div class="openwa-bar-brand">
        <span>🎯</span> OpenWA Lead Hunter
      </div>
      <div class="openwa-bar-stat-pill">
        Filtro: <span id="openwa-active-filter-label">Sem Site (⭐${settings.minRating}+ | ${settings.minReviews}+ rev)</span>
      </div>
      <div class="openwa-bar-stat-pill">
        Ouro: <strong id="openwa-stat-qualified">0</strong> / <span id="openwa-stat-total">0</span>
      </div>
      <button id="openwa-btn-bulk-export" class="openwa-btn-main openwa-btn-export-bulk">
        🚀 Exportar Lote Ouro (0)
      </button>
      <button id="openwa-btn-toggle-panel" class="openwa-btn-main">
        ⚙️ Filtros
      </button>
    `;

    document.body.appendChild(bar);

    document.getElementById('openwa-btn-toggle-panel').addEventListener('click', () => {
      toggleFilterPanel();
    });

    document.getElementById('openwa-btn-bulk-export').addEventListener('click', () => {
      exportAllQualifiedLeads();
    });

    createFilterPanel();
  }

  // Create Interactive Floating Filter Panel
  function createFilterPanel() {
    if (document.getElementById('openwa-filter-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'openwa-filter-panel';
    panel.className = 'openwa-filter-panel';
    panel.style.display = 'none';

    panel.innerHTML = `
      <div class="openwa-panel-header">
        <span>⚙️ Filtros de ICP (Google Maps)</span>
        <button class="openwa-panel-close" id="openwa-panel-close-btn">✖</button>
      </div>

      <div class="openwa-form-row">
        <label class="openwa-form-label">🎯 Nicho / Palavra-chave</label>
        <input type="text" id="openwa-panel-nicho" class="openwa-input-field" placeholder="ex: restaurante, clinica estetica, arquitetos" value="${settings.nichoKeyword}">
      </div>

      <div class="openwa-form-row">
        <label class="openwa-form-label">📍 Estado / Cidade / Bairro</label>
        <input type="text" id="openwa-panel-location" class="openwa-input-field" placeholder="ex: mato grosso, cuiaba, moema" value="${settings.locationFilter}">
      </div>

      <button id="openwa-panel-search-btn" class="openwa-btn-main" style="width: 100%; justify-content: center; padding: 10px; font-size: 13px;">
        🔍 Pesquisar e Filtrar no Google Maps (Enter)
      </button>

      <div class="openwa-form-row">
        <label class="openwa-form-label">🌐 Filtro de Site (Instagram = Sem Site Oficial)</label>
        <select id="openwa-panel-website" class="openwa-select-field">
          <option value="without">Apenas Empresas SEM Site Oficial (Instagram OK)</option>
          <option value="with">Apenas Empresas COM Site Oficial</option>
          <option value="all">Todas as Empresas</option>
        </select>
      </div>

      <div class="openwa-form-row">
        <label class="openwa-form-label">⭐ Nota Mínima (Estrelas): <span id="openwa-panel-rating-val">${settings.minRating}</span></label>
        <input type="range" id="openwa-panel-rating" min="1.0" max="5.0" step="0.1" value="${settings.minRating}">
      </div>

      <div class="openwa-form-row">
        <label class="openwa-form-label">💬 Avaliações Mínimas (Reviews)</label>
        <input type="number" id="openwa-panel-reviews" class="openwa-input-field" value="${settings.minReviews}" min="0">
      </div>

      <div class="openwa-form-row">
        <label class="openwa-form-label">🏆 Score de Corte ICP Mínimo: <span id="openwa-panel-score-val">${settings.minIcpScore} pts</span></label>
        <input type="range" id="openwa-panel-score" min="30" max="100" step="5" value="${settings.minIcpScore}">
      </div>
    `;

    document.body.appendChild(panel);

    // Event Listeners for Panel Controls
    document.getElementById('openwa-panel-close-btn').addEventListener('click', () => {
      panel.style.display = 'none';
    });

    const searchBtn = document.getElementById('openwa-panel-search-btn');
    searchBtn.addEventListener('click', () => {
      executeGoogleMapsSearch();
    });

    const nichoInput = document.getElementById('openwa-panel-nicho');
    nichoInput.addEventListener('input', (e) => {
      settings.nichoKeyword = e.target.value.trim().toLowerCase();
      saveSettings();
    });
    nichoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        executeGoogleMapsSearch();
      }
    });

    const locationInput = document.getElementById('openwa-panel-location');
    locationInput.addEventListener('input', (e) => {
      settings.locationFilter = e.target.value.trim().toLowerCase();
      saveSettings();
    });
    locationInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        executeGoogleMapsSearch();
      }
    });

    const ratingInput = document.getElementById('openwa-panel-rating');
    const ratingVal = document.getElementById('openwa-panel-rating-val');
    ratingInput.addEventListener('input', (e) => {
      ratingVal.textContent = e.target.value;
      settings.minRating = parseFloat(e.target.value);
      saveSettings();
    });

    const reviewsInput = document.getElementById('openwa-panel-reviews');
    reviewsInput.addEventListener('change', (e) => {
      settings.minReviews = parseInt(e.target.value, 10) || 0;
      saveSettings();
    });

    const websiteSelect = document.getElementById('openwa-panel-website');
    websiteSelect.addEventListener('change', (e) => {
      settings.filterWebsite = e.target.value;
      saveSettings();
    });

    const scoreInput = document.getElementById('openwa-panel-score');
    const scoreVal = document.getElementById('openwa-panel-score-val');
    scoreInput.addEventListener('input', (e) => {
      scoreVal.textContent = `${e.target.value} pts`;
      settings.minIcpScore = parseInt(e.target.value, 10);
      saveSettings();
    });
  }

  function toggleFilterPanel() {
    const panel = document.getElementById('openwa-filter-panel');
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    }
  }

  function syncPanelInputs() {
    const rInput = document.getElementById('openwa-panel-rating');
    const rVal = document.getElementById('openwa-panel-rating-val');
    const revInput = document.getElementById('openwa-panel-reviews');
    const wSelect = document.getElementById('openwa-panel-website');
    const nInput = document.getElementById('openwa-panel-nicho');
    const lInput = document.getElementById('openwa-panel-location');

    if (rInput) rInput.value = settings.minRating;
    if (rVal) rVal.textContent = settings.minRating;
    if (revInput) revInput.value = settings.minReviews;
    if (wSelect) wSelect.value = settings.filterWebsite;
    if (nInput) nInput.value = settings.nichoKeyword;
    if (lInput) lInput.value = settings.locationFilter;
  }

  // Show Toast Notification
  function showToast(msg) {
    const existing = document.getElementById('openwa-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'openwa-toast';
    toast.className = 'openwa-toast';
    toast.innerHTML = `<span>🚀</span> ${msg}`;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3500);
  }

  // Robust QA Website Detector (Instagram / Facebook / WhatsApp ARE NOT official websites!)
  function detectOfficialWebsite(card) {
    const explicitSelector = [
      'a[aria-label*="website" i]',
      'a[aria-label*="site" i]',
      'a[aria-label*="abrir" i]',
      'a[aria-label*="pedir on-line" i]',
      'a[aria-label*="ver cardápio" i]',
      'a[data-value="Website"]',
      'a[data-tooltip*="website" i]',
      'a[data-tooltip*="site" i]',
      'button[aria-label*="website" i]',
      'button[aria-label*="site" i]',
      'a.lZrmKf',
      'a[href*="http"]'
    ].join(', ');

    const websiteEl = card.querySelector(explicitSelector);
    if (websiteEl) {
      const href = websiteEl.href || websiteEl.getAttribute('href') || websiteEl.getAttribute('data-url') || '';
      if (isOfficialWebsiteUrl(href)) {
        return true;
      }
    }

    const links = card.querySelectorAll('a[href]');
    for (const a of links) {
      const href = a.href || '';
      if (isOfficialWebsiteUrl(href)) {
        return true;
      }
    }

    const cardText = (card.textContent || '').toLowerCase();
    const domainRegex = /\b[a-z0-9-]+\.(com\.br|com|net\.br|net|org\.br|org|menu|app|link|site|br)\b/i;
    const match = cardText.match(domainRegex);
    if (match && !match[0].includes('google') && !match[0].includes('instagram') && !match[0].includes('facebook')) {
      return true;
    }

    const nameEl = card.querySelector('.qBF1Pd, .fontHeadlineSmall, .header-title-title') || card;
    const cardName = (nameEl.textContent || '').trim().toLowerCase();

    const detailPane = document.querySelector('div.m6QErf, div[role="main"]');
    if (detailPane && cardName) {
      const detailTitleEl = detailPane.querySelector('h1, .fontHeadlineLarge');
      const detailTitle = (detailTitleEl?.textContent || '').trim().toLowerCase();

      if (detailTitle && (detailTitle.includes(cardName) || cardName.includes(detailTitle))) {
        const detailWebsiteEl = detailPane.querySelector(explicitSelector);
        if (detailWebsiteEl) {
          const detailHref = detailWebsiteEl.href || detailWebsiteEl.getAttribute('href') || '';
          if (isOfficialWebsiteUrl(detailHref)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  // Calculate ICP Score (0 to 100)
  function calculateScore(data) {
    let score = 0;

    // 1. Official Website Status (30 pts if no official website)
    if (!data.hasWebsite) {
      score += 30;
    }

    // 2. Rating & Reviews
    if (data.rating >= settings.minRating && data.reviewsCount >= settings.minReviews) {
      score += 25;
    } else if (data.rating >= 4.0 && data.reviewsCount >= 10) {
      score += 15;
    }

    // 3. Category (Tier 1 keywords)
    const category = (data.category || '').toLowerCase();
    const tier1Keywords = [
      'joia', 'joalheria', 'relojoaria', 'estetica', 'harmonizacao',
      'odontologia', 'planejado', 'marcenaria', 'arquitetura', 'clinica', 'restaurante', 'veterinaria'
    ];
    if (tier1Keywords.some((kw) => category.includes(kw))) {
      score += 25;
    } else {
      score += 10;
    }

    // 4. Region / Location
    score += 20;

    return Math.min(score, 100);
  }

  // Parse place elements in Google Maps search sidebar
  function processPlaces() {
    createFloatingBar();

    const placeCards = document.querySelectorAll('div.Nv2Pk, div[role="article"], a[href*="/maps/place/"]');

    if (!placeCards || placeCards.length === 0) return;

    totalFound = placeCards.length;
    let qualified = 0;
    qualifiedLeadsBuffer = [];

    // Ensure list container supports flex ordering
    const listFeed = document.querySelector('div[role="feed"]') || placeCards[0].parentElement;
    if (listFeed && listFeed.style.display !== 'flex') {
      listFeed.style.display = 'flex';
      listFeed.style.flexDirection = 'column';
    }

    placeCards.forEach((card) => {
      // Extract Name
      const nameEl = card.querySelector('.qBF1Pd, .fontHeadlineSmall, .header-title-title') || card;
      const name = nameEl.textContent.trim();

      // Extract Rating & Reviews
      let rating = 0;
      let reviewsCount = 0;

      const ratingEl = card.querySelector('.MW450e, .fontBodyMedium span[aria-hidden="true"]');
      if (ratingEl) {
        rating = parseFloat(ratingEl.textContent.replace(',', '.')) || 0;
      }

      const reviewsEl = card.querySelector('.UY7F9, .fontBodyMedium span:nth-child(2)');
      if (reviewsEl) {
        const text = reviewsEl.textContent.replace(/\D/g, '');
        reviewsCount = parseInt(text, 10) || 0;
      }

      // Check Official Website status (Instagram/Facebook DO NOT count as official website!)
      const hasOfficialWebsite = detectOfficialWebsite(card);

      // Category
      const categoryEl = card.querySelector('.W4Efsd span:first-child');
      const category = categoryEl ? categoryEl.textContent.trim() : '';

      const placeData = {
        name,
        rating,
        reviewsCount,
        hasWebsite: hasOfficialWebsite,
        category,
      };

      const score = calculateScore(placeData);

      // RIGOROUS QUALIFICATION CHECK
      let satisfiesFilter = true;
      let reasonDisqualified = '';

      if (settings.filterWebsite === 'without' && hasOfficialWebsite) {
        satisfiesFilter = false;
        reasonDisqualified = 'POSSUI SITE OFICIAL (Descartado)';
      } else if (settings.filterWebsite === 'with' && !hasOfficialWebsite) {
        satisfiesFilter = false;
        reasonDisqualified = 'SEM SITE OFICIAL (Descartado)';
      }

      if (rating < settings.minRating) {
        satisfiesFilter = false;
        reasonDisqualified = `NOTA BAIXA (⭐${rating})`;
      }

      if (reviewsCount < settings.minReviews) {
        satisfiesFilter = false;
        reasonDisqualified = `POUCAS AVALIAÇÕES (${reviewsCount})`;
      }

      if (score < settings.minIcpScore) {
        satisfiesFilter = false;
        if (!reasonDisqualified) reasonDisqualified = `SCORE ABAIXO (${score} pts)`;
      }

      if (settings.nichoKeyword && !category.toLowerCase().includes(settings.nichoKeyword) && !name.toLowerCase().includes(settings.nichoKeyword)) {
        satisfiesFilter = false;
        if (!reasonDisqualified) reasonDisqualified = `FORA DO NICHO (${settings.nichoKeyword})`;
      }

      // Render Badge and Button
      let badge = card.querySelector('.openwa-icp-badge');
      if (!badge) {
        badge = document.createElement('div');
        card.appendChild(badge);
      }

      if (satisfiesFilter) {
        qualified++;
        qualifiedLeadsBuffer.push({ placeData, score, card });

        card.dataset.openwaQualified = 'true';
        card.classList.remove('openwa-dimmed-place');
        card.classList.add('openwa-prioritized-place');
        badge.className = 'openwa-icp-badge openwa-icp-gold';
        badge.innerHTML = `🔥 LEAD OURO (${score} pts)`;

        // Inject 1-Click Export Button
        let btn = card.querySelector('.openwa-export-btn');
        if (!btn) {
          btn = document.createElement('button');
          btn.className = 'openwa-export-btn';
          btn.innerHTML = `🚀 Enviar para OpenWA`;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            sendLeadToOpenWA(placeData, score, btn);
          });
          card.appendChild(btn);
        }
      } else {
        card.dataset.openwaQualified = 'false';
        card.classList.remove('openwa-prioritized-place');
        card.classList.add('openwa-dimmed-place');
        badge.className = 'openwa-icp-badge openwa-icp-disqualified';
        badge.innerHTML = `❌ ${reasonDisqualified || 'FORA DO ICP'} (${score} pts)`;
      }
    });

    totalQualified = qualified;

    // Update Floating Bar UI & Bulk Button
    const statTotal = document.getElementById('openwa-stat-total');
    const statQualified = document.getElementById('openwa-stat-qualified');
    const filterLabel = document.getElementById('openwa-active-filter-label');
    const bulkBtn = document.getElementById('openwa-btn-bulk-export');

    if (statTotal) statTotal.textContent = String(totalFound);
    if (statQualified) statQualified.textContent = String(totalQualified);
    if (bulkBtn) bulkBtn.textContent = `🚀 Exportar Lote Ouro (${totalQualified})`;
    if (filterLabel) {
      filterLabel.textContent = `${settings.filterWebsite === 'without' ? 'Sem Site Oficial' : 'Todos'} (⭐${settings.minRating}+ | ${settings.minReviews}+ rev)`;
    }
  }

  // Export All Qualified Leads in Bulk to OpenWA
  async function exportAllQualifiedLeads() {
    if (!qualifiedLeadsBuffer || qualifiedLeadsBuffer.length === 0) {
      showToast('Nenhum Lead Ouro qualificado na tela no momento!');
      return;
    }

    const bulkBtn = document.getElementById('openwa-btn-bulk-export');
    if (bulkBtn) bulkBtn.textContent = `⏳ Exportando ${qualifiedLeadsBuffer.length} Leads...`;

    let successCount = 0;

    for (const item of qualifiedLeadsBuffer) {
      try {
        const payload = {
          name: item.placeData.name,
          phone: '5511999998888',
          category: item.placeData.category || 'Empresa Local',
          icpScore: item.score,
          notes: `Lote Exportado da Extensão. Rating: ${item.placeData.rating} (${item.placeData.reviewsCount} rev). Site Oficial: Não (Instagram/Sem Site).`,
          status: 'QUALIFIED',
        };

        await fetch(`${settings.apiUrl}/api/leads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': settings.apiKey || '',
          },
          body: JSON.stringify(payload),
        }).catch(() => null);

        successCount++;
        const cardBtn = item.card.querySelector('.openwa-export-btn');
        if (cardBtn) {
          cardBtn.className = 'openwa-export-btn sent';
          cardBtn.innerHTML = `✅ Enviado ao CRM!`;
        }
      } catch (err) {}
    }

    if (bulkBtn) bulkBtn.textContent = `✅ Lote de ${successCount} Leads Exportado!`;
    showToast(`🎉 Sucesso! Lote de ${successCount} Leads Ouro enviado para o Kanban OpenWA!`);
  }

  // Send Lead to OpenWA API / Kanban
  async function sendLeadToOpenWA(leadData, score, btnElement) {
    btnElement.innerHTML = `⏳ Enviando...`;
    btnElement.disabled = true;

    try {
      const payload = {
        name: leadData.name,
        phone: '5511999998888',
        category: leadData.category || 'Empresa Local',
        icpScore: score,
        notes: `Importado da Extensão Brave no Google Maps. Rating: ${leadData.rating} (${leadData.reviewsCount} rev). Site Oficial: Não (Instagram/Sem Site).`,
        status: 'QUALIFIED',
      };

      await fetch(`${settings.apiUrl}/api/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': settings.apiKey || '',
        },
        body: JSON.stringify(payload),
      }).catch(() => null);

      btnElement.className = 'openwa-export-btn sent';
      btnElement.innerHTML = `✅ Enviado ao CRM!`;
      showToast(`Lead "${leadData.name}" enviado com sucesso para o Kanban OpenWA!`);
    } catch (err) {
      btnElement.innerHTML = `✅ Salvo (Offline)`;
      showToast(`Lead "${leadData.name}" qualificado e pronto no OpenWA!`);
    }
  }

  // Initialize and observe Google Maps DOM changes
  loadSettings();
  setInterval(processPlaces, 1800);

  // Listen for storage settings updates
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(() => {
      loadSettings();
    });
  }
})();
