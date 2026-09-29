(function () {
  const btn = document.getElementById('buildStoryBtn');
  const text = document.getElementById('storyText');
  const style = document.getElementById('storyStyle');
  const count = document.getElementById('sceneCount');
  const status = document.getElementById('storyStatus');
  const scenesEl = document.getElementById('storyScenes');
  const bibleEl = document.getElementById('storyBible');
  let currentScenes = [];

  const SUBJECTS = [
    ['camel','camel'],['fox','fox'],['lion','lion'],['tiger','tiger'],['elephant','elephant'],
    ['deer','deer'],['rabbit','rabbit'],['wolf','wolf'],['bear','bear'],['horse','horse'],
    ['dog','dog'],['cat','cat'],['monkey','monkey'],['bird','bird'],['snake','snake'],
    ['goat','goat'],['cow','cow'],['ऊँट','camel'],['लोमड़ी','fox'],['शेर','lion'],
    ['बाघ','tiger'],['हाथी','elephant'],['हिरण','deer'],['खरगोश','rabbit'],['बंदर','monkey']
  ];

  function splitSentences(value) {
    return value.replace(/\s+/g, ' ').trim().match(/[^.!?।]+[.!?।]?/g) || [];
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[ch]));
  }

  function detectCharacters(story) {
    const lower = story.toLowerCase();
    const seen = new Set();
    return SUBJECTS.filter(([word]) => lower.includes(word.toLowerCase())).map(([word, species]) => {
      const key = species.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: 'character-' + seen.size,
        name: word,
        species,
        age: 'consistent throughout the story',
        appearance: 'Realistic ' + species + ' with consistent proportions, colors, face and distinctive markings in every scene.',
        clothing: 'None unless the story explicitly establishes clothing.',
        personality: 'Keep behavior consistent with the story.',
        continuity: 'Do not redesign, recolor, age or replace this character between scenes.'
      };
    }).filter(Boolean).slice(0, 10);
  }

  function localBible(story) {
    return {
      title: 'Story',
      summary: story.slice(0, 240),
      characters: detectCharacters(story),
      locations: [],
      world: {
        setting: 'Use the setting described by the story and preserve it between connected scenes.',
        timePeriod: 'Keep the same story-defined time period.',
        season: 'Keep the same season unless the narration changes it.',
        weather: 'Keep weather continuous unless the narration changes it.',
        visualRules: ['Maintain realistic cinematic continuity across all scenes.']
      },
      visualStyle: style.value,
      scenes: []
    };
  }

  function biblePrompt(bible) {
    const characterText = bible.characters.length
      ? bible.characters.map(c => c.name + ' (' + c.species + '): ' + c.appearance + ' ' + c.continuity).join(' | ')
      : 'Preserve every recurring person, animal or object consistently from scene to scene.';
    return [
      'CHARACTER AND WORLD BIBLE.',
      'Visual style: ' + bible.visualStyle + '.',
      'Characters: ' + characterText,
      'World: ' + bible.world.setting,
      'Continuity: ' + bible.world.visualRules.join(' '),
      'Keep identity, anatomy, environment and visual language consistent throughout.'
    ].join(' ');
  }

  function makeScenes(sentences, wanted, bible) {
    const n = wanted === 'auto'
      ? Math.max(3, Math.min(8, Math.ceil(sentences.length / 2)))
      : Number(wanted);
    const groups = Array.from({ length: Math.min(n, sentences.length) }, () => []);
    sentences.forEach((sentence, index) => {
      groups[Math.min(groups.length - 1, Math.floor(index * groups.length / sentences.length))].push(sentence.trim());
    });
    const continuity = biblePrompt(bible);
    return groups.filter(Boolean).filter(group => group.length).map((group, index) => {
      const narration = group.join(' ');
      const lower = narration.toLowerCase();
      const characters = bible.characters.filter(c =>
        lower.includes(c.name.toLowerCase()) || lower.includes(c.species.toLowerCase())
      ).map(c => c.name);
      return {
        number: index + 1,
        narration,
        characters,
        visual: [
          style.value + ' cinematic scene',
          narration,
          characters.length ? 'Characters present: ' + characters.join(', ') : '',
          continuity,
          'Photorealistic live-action look, natural lighting, believable anatomy and textures, clear subject action, cinematic composition, realistic environment. No text, captions, logos or cartoon illustration.'
        ].filter(Boolean).join('. ')
      };
    });
  }

  function setStatus(message, error) {
    status.textContent = message;
    status.classList.toggle('err', Boolean(error));
  }

  function renderBible(bible) {
    const characters = bible.characters.length
      ? bible.characters.map(c => '<div class="story-bible-character"><strong>' + escapeHtml(c.name) + '</strong><span>' + escapeHtml(c.appearance) + '</span></div>').join('')
      : '<p class="story-bible-empty">No known recurring animal was detected automatically. PixKit will still preserve the story text and continuity instructions in every scene prompt.</p>';
    bibleEl.innerHTML = '<div class="story-bible-head"><strong>Local character &amp; world bible</strong><span>' +
      bible.characters.length + ' recurring subject' + (bible.characters.length === 1 ? '' : 's') + '</span></div>' +
      '<div class="story-bible-list">' + characters + '</div>';
  }

  function renderScenes(scenes) {
    currentScenes = scenes;
    scenesEl.innerHTML = scenes.map(scene => `
      <article class="story-scene" data-scene="${scene.number}">
        <div class="story-scene-head">
          <span class="story-scene-num">Scene ${scene.number}</span>
          <span class="story-scene-time">Local browser mode</span>
        </div>
        <h3>Visual scene ${scene.number}</h3>
        <p>${escapeHtml(scene.narration)}</p>
        <div class="story-prompt"><strong>Image prompt:</strong> ${escapeHtml(scene.visual)}</div>
        <div class="story-image-wrap"><div class="story-image-placeholder">Image generation is intentionally disabled in free local mode. A local open-source model can be connected later.</div></div>
        <div class="story-scene-actions">
          <button class="secondary-action story-copy" type="button" data-number="${scene.number}">Copy prompt</button>
        </div>
      </article>
    `).join('');
  }

  btn.addEventListener('click', () => {
    const raw = text.value.trim();
    if (!raw) return setStatus('Please enter a story first.', true);
    const sentences = splitSentences(raw);
    if (sentences.length < 2) return setStatus('Please enter at least two sentences so the story can be divided into scenes.', true);
    const bible = localBible(raw);
    renderBible(bible);
    renderScenes(makeScenes(sentences, count.value, bible));
    setStatus(currentScenes.length + ' scenes created entirely in your browser. No AI API or paid service was called.');
  });

  scenesEl.addEventListener('click', async event => {
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
