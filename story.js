(function () {
  const btn = document.getElementById('buildStoryBtn');
  const text = document.getElementById('storyText');
  const style = document.getElementById('storyStyle');
  const count = document.getElementById('sceneCount');
  const status = document.getElementById('storyStatus');
  const scenesEl = document.getElementById('storyScenes');

  const IMAGE_API = window.PIXKIT_IMAGE_API || '/api/generate-image';
  let currentScenes = [];

  function splitSentences(value) {
    return value.replace(/\s+/g, ' ').trim().match(/[^.!?।]+[.!?।]?/g) || [];
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[ch]));
  }

  function makeScenes(sentences, wanted) {
    const n = wanted === 'auto'
      ? Math.max(3, Math.min(8, Math.ceil(sentences.length / 2)))
      : Number(wanted);

    const groups = Array.from({ length: n }, () => []);
    sentences.forEach((sentence, index) => {
      groups[Math.min(n - 1, Math.floor(index * n / sentences.length))].push(sentence.trim());
    });

    return groups.filter(group => group.length).map((group, index) => ({
      number: index + 1,
      narration: group.join(' '),
      visual: [
        style.value + ' cinematic scene',
        group.join(' '),
        'Photorealistic live-action look, natural lighting, believable anatomy and textures, clear subject action, cinematic composition, realistic environment, consistent characters and visual continuity with the other scenes. No text, captions, logos, or cartoon illustration.'
      ].join('. ')
    }));
  }

  function setStatus(message, error) {
    status.textContent = message;
    status.classList.toggle('err', Boolean(error));
  }

  function renderScenes(scenes) {
    currentScenes = scenes;
    scenesEl.innerHTML = scenes.map(scene => `
      <article class="story-scene" data-scene="${scene.number}">
        <div class="story-scene-head">
          <span class="story-scene-num">Scene ${scene.number}</span>
          <span class="story-scene-time">Narration segment</span>
        </div>
        <h3>Visual scene ${scene.number}</h3>
        <p>${escapeHtml(scene.narration)}</p>
        <div class="story-prompt"><strong>Image prompt:</strong> ${escapeHtml(scene.visual)}</div>
        <div class="story-image-wrap" data-image-wrap>
          <div class="story-image-placeholder">Image will appear here</div>
        </div>
        <div class="story-scene-actions">
          <button class="secondary-action story-generate" type="button" data-number="${scene.number}">Generate image</button>
          <button class="secondary-action story-copy" type="button" data-number="${scene.number}">Copy prompt</button>
        </div>
      </article>
    `).join('');
  }

  async function generateImage(button, scene) {
    const article = button.closest('.story-scene');
    const wrap = article.querySelector('[data-image-wrap]');
    button.disabled = true;
    button.textContent = 'Generating…';
    wrap.innerHTML = '<div class="story-image-placeholder">Creating the scene image…</div>';

    try {
      const response = await fetch(IMAGE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: scene.visual,
          quality: 'low',
          provider: 'auto'
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.image) {
        throw new Error(data.error || 'Image generation failed.');
      }

      const image = document.createElement('img');
      image.className = 'story-generated-image';
      image.alt = 'Generated visual for scene ' + scene.number;
      image.src = data.image;
      wrap.replaceChildren(image);

      button.textContent = 'Regenerate image';
    } catch (error) {
      wrap.innerHTML = '<div class="story-image-placeholder story-image-error">' +
        escapeHtml(error.message || 'Could not generate this image.') + '</div>';
      button.textContent = 'Try again';
    } finally {
      button.disabled = false;
    }
  }

  btn.addEventListener('click', () => {
    const raw = text.value.trim();
    if (!raw) {
      setStatus('Please enter a story first.', true);
      return;
    }

    const sentences = splitSentences(raw);
    if (sentences.length < 2) {
      setStatus('Please enter at least two sentences so the story can be divided into scenes.', true);
      return;
    }

    setStatus('');
    renderScenes(makeScenes(sentences, count.value));
    setStatus(currentScenes.length + ' scenes created. Generate an image for any scene.');
  });

  scenesEl.addEventListener('click', async event => {
    const generateButton = event.target.closest('.story-generate');
    if (generateButton) {
      const number = Number(generateButton.dataset.number);
      const scene = currentScenes.find(item => item.number === number);
      if (scene) await generateImage(generateButton, scene);
      return;
    }

    const copyButton = event.target.closest('.story-copy');
    if (!copyButton) return;

    const number = Number(copyButton.dataset.number);
    const scene = currentScenes.find(item => item.number === number);
    if (!scene) return;

    try {
      await navigator.clipboard.writeText(scene.visual);
      copyButton.textContent = 'Copied';
      setTimeout(() => copyButton.textContent = 'Copy prompt', 1000);
    } catch (_) {}
  });
})();