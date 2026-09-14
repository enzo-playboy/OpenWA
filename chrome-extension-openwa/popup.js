document.addEventListener('DOMContentLoaded', () => {
  const minRatingInput = document.getElementById('minRating');
  const ratingValSpan = document.getElementById('ratingVal');
  const minReviewsInput = document.getElementById('minReviews');
  const filterWebsiteSelect = document.getElementById('filterWebsite');
  const apiUrlInput = document.getElementById('apiUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const btnSave = document.getElementById('btnSave');
  const statusMsg = document.getElementById('statusMsg');

  // Update slider display
  minRatingInput.addEventListener('input', (e) => {
    ratingValSpan.textContent = e.target.value;
  });

  // Load saved settings from storage
  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(
      {
        minRating: 4.5,
        minReviews: 25,
        filterWebsite: 'without',
        apiUrl: 'http://localhost:2785',
        apiKey: '',
      },
      (items) => {
        minRatingInput.value = items.minRating;
        ratingValSpan.textContent = items.minRating;
        minReviewsInput.value = items.minReviews;
        filterWebsiteSelect.value = items.filterWebsite;
        apiUrlInput.value = items.apiUrl;
        apiKeyInput.value = items.apiKey;
      }
    );
  }

  // Save settings
  btnSave.addEventListener('click', () => {
    const settings = {
      minRating: parseFloat(minRatingInput.value),
      minReviews: parseInt(minReviewsInput.value, 10) || 0,
      filterWebsite: filterWebsiteSelect.value,
      apiUrl: apiUrlInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
    };

    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(settings, () => {
        statusMsg.textContent = 'Configurações salvas com sucesso!';
        setTimeout(() => {
          statusMsg.textContent = '';
        }, 2500);
      });
    } else {
      localStorage.setItem('openwa_hunter_settings', JSON.stringify(settings));
      statusMsg.textContent = 'Configurações salvas!';
    }
  });
});
