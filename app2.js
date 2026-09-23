(function () {
// PixKit compression module
  const PRESETS = {
    upsc_photo: {
      w: 350, h: 350, minKB: 20, maxKB: 300,
      note: 'Commonly cited: JPG, 20–300 KB, roughly 350×350 px (min 300×300, max 1000×1000, square, face ~75% of frame, white background). Verify on your current DAF screen — some cycles differ.'
    },
    upsc_sign: {
      w: 350, h: 350, minKB: 20, maxKB: 100,
      note: 'Commonly cited: JPG, 20–100 KB, roughly 350×350 px, black ink on white paper, running hand. Verify on your current DAF screen.'
    },
    bpsc72_sign: {
      w: 185, h: 285, minKB: 1, maxKB: 20,
      note: 'Per the official BPSC 72nd CCE advertisement (OAMS profile): each signature under 20 KB, width 150–220 px, height 250–320 px. You upload two — English and Hindi. The photograph itself is captured live on your webcam inside OAMS, not uploaded as a file.'
    },
    custom: {
      w: 350, h: 350, minKB: 10, maxKB: 100,
      note: 'Set your own width, height and size range for any other exam or portal.'
    }
  };

  const dropC = document.getElementById('dropC');
  const fileInputC = document.getElementById('fileInputC');
  const presetSel = document.getElementById('presetSel');
  const presetNote = document.getElementById('presetNote');
  const targetW = document.getElementById('targetW');
  const targetH = document.getElementById('targetH');
  const minKBInput = document.getElementById('minKB');
  const maxKBInput = document.getElementById('maxKB');
  const compressPreview = document.getElementById('compressPreview');
  const compressBtn = document.getElementById('compressBtn');
  const statusC = document.getElementById('statusC');
  const resultBox = document.getElementById('resultBox');
  const resultImg = document.getElementById('resultImg');
  const resultInfo = document.getElementById('resultInfo');
  const downloadCompressed = document.getElementById('downloadCompressed');

  let compressImg = null;
  let compressResult = null;

  function applyPreset() {
    const p = PRESETS[presetSel.value];
    targetW.value = p.w;
    targetH.value = p.h;
    minKBInput.value = p.minKB;
    maxKBInput.value = p.maxKB;
    presetNote.textContent = p.note;
  }
  presetSel.addEventListener('change', applyPreset);
  applyPreset();

  dropC.addEventListener('dragover', e => { e.preventDefault(); dropC.classList.add('drag'); });
  dropC.addEventListener('dragleave', () => dropC.classList.remove('drag'));
  dropC.addEventListener('drop', e => {
    e.preventDefault();
    dropC.classList.remove('drag');
    if (e.dataTransfer.files[0]) loadCompressFile(e.dataTransfer.files[0]);
  });
  fileInputC.addEventListener('change', e => {
    if (e.target.files[0]) loadCompressFile(e.target.files[0]);
    fileInputC.value = '';
  });

  function loadCompressFile(file) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        compressImg = img;
        compressPreview.src = reader.result;
        compressPreview.style.display = 'block';
        compressBtn.disabled = false;
        compressBtn.textContent = 'Compress image';
        resultBox.style.display = 'none';
        setStatusC('');
      };
      img.onerror = () => setStatusC('Could not load this image. Please try JPG or PNG.', true);
      img.src = reader.result;
    };
    reader.onerror = () => setStatusC('Could not read this file.', true);
    reader.readAsDataURL(file);
  }

  function estimateKB(dataUrl) {
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const pad = b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0);
    return (b64.length * 3 / 4 - pad) / 1024;
  }

  function setStatusC(msg, isErr) {
    statusC.textContent = msg || '';
    statusC.classList.toggle('err', !!isErr);
  }

  compressBtn.addEventListener('click', () => {
    if (!compressImg) return;
    const w = Math.max(1, parseInt(targetW.value, 10) || compressImg.naturalWidth);
    const h = Math.max(1, parseInt(targetH.value, 10) || compressImg.naturalHeight);
    const minKB = parseFloat(minKBInput.value) || 0;
    const maxKB = parseFloat(maxKBInput.value) || 1e9;
    setStatusC('Compressing…');

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(compressImg, 0, 0, w, h);

    let lo = 0.03, hi = 0.97, best = null;
    for (let i = 0; i < 11; i++) {
      const q = (lo + hi) / 2;
      const durl = canvas.toDataURL('image/jpeg', q);
      const kb = estimateKB(durl);
      if (kb <= maxKB) { best = { durl, kb, q }; lo = q; } else { hi = q; }
    }
    if (!best) {
      const durl = canvas.toDataURL('image/jpeg', 0.03);
      best = { durl, kb: estimateKB(durl), q: 0.03 };
    }
    compressResult = best;

    resultImg.src = best.durl;
    let note = `${w}×${h}px · ${best.kb.toFixed(1)} KB`;
    if (best.kb > maxKB) note += ' — could not fit under the max at this quality; try smaller dimensions';
    else if (best.kb < minKB) note += ' — under the suggested minimum; usually fine, but check your portal';
    resultInfo.textContent = note;
    resultBox.style.display = 'block';
    setStatusC('');
  });

  downloadCompressed.addEventListener('click', async () => {
    if (!compressResult) return;
    const blob = await (await fetch(compressResult.durl)).blob();
    const name = presetSel.value === 'custom' ? 'compressed.jpg'
      : presetSel.value.includes('sign') ? 'signature.jpg' : 'photo.jpg';
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'pixkit-' + name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatusC('Image ready — check your downloads');
  });
})();