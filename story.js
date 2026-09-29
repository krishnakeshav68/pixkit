(function () {
  const btn = document.getElementById('buildStoryBtn');
  const text = document.getElementById('storyText');
  const style = document.getElementById('storyStyle');
  const count = document.getElementById('sceneCount');
  const status = document.getElementById('storyStatus');
  const scenesEl = document.getElementById('storyScenes');
  const bibleEl = document.getElementById('storyBible');
  const IMAGE_API = window.PIXKIT_IMAGE_API || '/api/generate-image';
  let currentScenes = [];
  let currentBible = null;

  function splitSentences(value) {
    return value.replace(/\s+/g, ' ').trim().match(/[^.!?।]+[.!?।]?/g) || [];
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[ch]));
  }

  function localBible(story) {
    const names = [];
    const animalHints = ['camel','fox','lion','tiger','elephant','deer','rabbit','wolf','bear','horse','dog','cat','monkey','bird','snake','goat','cow'];
    animalHints.forEach(animal => {
      if (new RegExp('\\\\b' + animal + '\\\\b', 'i').test(story)) names.push(animal);
    });
    return {
      title: 'Story',
      summary: story.slice(0, 240),
      characters: names.slice(0, 10).map((name, index) => ({
        id: 'character-' + (index + 1),
        name,
        species: name,
        age: 'consistent age throughout the story',
        appearance: 'Keep this character visually identical across every scene; preserve realistic anatomy, proportions, colors and distinctive markings.',
        clothing: 'None unless established by the story.',
        personality: 'As established by the story.',
        continuity: 'Do not redesign, recolor, age, or replace this character between scenes.'
      })),
      locations: [],
      world: {
        setting: 'As established by the story.',
        timePeriod: 'As established by the story.',
        season: 'As established by the story.',
        weather: 'As established by the story.',
        visualRules: ['Maintain realistic cinematic continuity across all scenes.']
      },
      scenes: []
    };
  }

  async function analyzeStory(story) {
    const response = await fetch('/api/analyze-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        story,
        style: style.value,
        sceneCount: count.value
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.analysis) throw new Error(data.error || 'Story analysis failed.');
    return data.analysis;
  }

  function biblePrompt(bible) {
    const characterText = bible.characters.length
      ? bible.characters.map(c => [
          c.name + ' (' + c.species + ', ' + c.age + ')',
          'appearance: ' + c.appearance,
          'clothing: ' + c.clothing,
          'personality: ' + c.personality,
          'continuity: ' + c.continuity
        ].join('; ')).join(' | ')
      : 'No recurring character was identified; preserve recurring subjects consistently from scene to scene.';
    const locationText = (bible.locations || []).map(l =>
      l.name + ': ' + l.description + '. Continuity: ' + l.continuity
    ).join(' | ');
    const world = bible.world || {};
    return [
      'CHARACTER AND WORLD BIBLE.',
      'Visual style: ' + bible.visualStyle + '.',
      'Characters: ' + characterText,
      locationText ? 'Locations: ' + locationText : '',
      'World setting: ' + (world.setting || 'story-defined') + '.',
      'Time period: ' + (world.timePeriod || 'story-defined') + '.',
      'Season: ' + (world.season || 'story-defined') + '.',
      'Weather: ' + (world.weather || 'story-defined') + '.',
      'Visual rules: ' + (world.visualRules || []).join(' '),
      'Keep character identity, anatomy, wardrobe, environment and visual language consistent throughout.'
    ].filter(Boolean).join(' ');
  }

  function makeScenes(sentences, wanted, bible) {
    const analyzed = Array.isArray(bible.scenes) ? bible.scenes.filter(s => s && s.narration) : [];
    if (analyzed.length) {
      return analyzed.map((scene, index) => ({
        number: scene.number || index + 1,
        narration: scene.narration,
        visual: [
          style.value + ' cinematic scene',
          scene.visualDirection || scene.action || scene.narration,
          'Characters present: ' + (scene.characters || []).join(', ') + '.',
          scene.location ? 'Location: ' + scene.location + '.' : '',
          biblePrompt(bible),
          'Photorealistic live-action look, natural lighting, believable anatomy and textures, clear subject action, cinematic composition, realistic environment. No text, captions, logos, or cartoon illustration.'
        ].filter(Boolean).join(' ')
      }));
    }

    const n = wanted === 'auto'
      ? Math.max(3, Math.min(8, Math.ceil(sentences.length / 2)))
      : Number(wanted);
    const groups = Array.from({ length: n }, () => []);
    sentences.forEach((sentence, index) => {
      groups[Math.min(n - 1, Math.floor(index * n / sentences.length))].push(sentence.trim());
    });
    const continuity = biblePrompt(bible);
    return groups.filter(group => group.length).map((group, index) => ({
      number: index + 1,
      narration: group.join(' '),
      visual: [style.value + ' cinematic scene', group.join(' '), continuity,
        'Photorealistic live-action look, natural lighting, believable anatomy and textures, clear subject action, cinematic composition, realistic environment. No text, captions, logos, or cartoon illustration.'].join('. ')
    }));
  }

  function setStatus(message, error) {
    status.textContent = message;
    status.classList.toggle('err', Boolean(error));
  }

  function renderBible(bible) {
    const characters = bible.characters.length
      ? bible.characters.map(c => '<div class="story-bible-character"><strong>' + escapeHtml(c.name) + '</strong><span>' + escapeHtml(c.appearance) + '</span></div>').join('')
      : '<p class="story-bible-empty">No recurring character was detected automatically. Scene prompts will still preserve the story world.</p>';

    bibleEl.innerHTML = '<div class="story-bible-head"><strong>Character &amp; world bible</strong><span>' +
      bible.characters.length + ' recurring subject' + (bible.characters.length === 1 ? '' : 's') + '</span></div>' +
      '<div class="story-bible-list">' + characters + '</div>';
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
        <div class="story-image-wrap" data-image-wrap><div class="story-image-placeholder">Image will appear here</div></div>
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
        body: JSON.stringify({ prompt: scene.visual, quality: 'low', provider: 'auto' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.image) throw new Error(data.error || 'Image generation failed.');
      const image = document.createElement('img');
      image.className = 'story-generated-image';
      image.alt = 'Generated visual for scene ' + scene.number;
      image.src = data.image;
      wrap.replaceChildren(image);
      button.textContent = 'Regenerate image';
    } catch (error) {
      wrap.innerHTML = '<div class="story-image-placeholder story-image-error">' + escapeHtml(error.message || 'Could not generate this image.') + '</div>';
      button.textContent = 'Try again';
    } finally {
      button.disabled = false;
    }
  }

  btn.addEventListener('click', () => {
    const raw = text.value.trim();
    if (!raw) return setStatus('Please enter a story first.', true);
    const sentences = splitSentences(raw);
    if (sentences.length < 2) return setStatus('Please enter at least two sentences so the story can be divided into scenes.', true);
    setStatus('Analyzing story and building the visual bible…');
    btn.disabled = true;
    try {
      currentBible = await analyzeStory(raw);
      currentBible.visualStyle = style.value;
      renderBible(currentBible);
      renderScenes(makeScenes(sentences, count.value, currentBible));
      setStatus(currentScenes.length + ' scenes created with an AI character/world bible. Generate an image for any scene.');
    } catch (error) {
      currentBible = localBible(raw);
      currentBible.visualStyle = style.value;
      renderBible(currentBible);
      renderScenes(makeScenes(sentences, count.value, currentBible));
      setStatus('AI analysis was unavailable, so PixKit used local continuity rules. ' + (error.message || ''));
    } finally {
      btn.disabled = false;
    }
  });

  scenesEl.addEventListener('click', async event => {
    const generateButton = event.target.closest('.story-generate');
    if (generateButton) {
      const scene = currentScenes.find(item => item.number === Number(generateButton.dataset.number));
      if (scene) await generateImage(generateButton, scene);
      return;
    }
    const copyButton = event.target.closest('.story-copy');
    if (!copyButton) return;
    const scene = currentScenes.find(item => item.number === Number(copyButton.dataset.number));
    if (!scene) return;
    try {
      await navigator.clipboard.writeText(scene.visual);
      copyButton.textContent = 'Copied';
      setTimeout(() => copyButton.textContent = 'Copy prompt', 1000);
    } catch (_) {}
  });
})();