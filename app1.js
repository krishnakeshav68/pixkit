(function () {
  const drop = document.getElementById('drop');
  const fileInput = document.getElementById('fileInput');
  const stack = document.getElementById('stack');
  const makeBtn = document.getElementById('makeBtn');
  const statusEl = document.getElementById('status');
  const pageSizeSel = document.getElementById('pageSize');
  const pdfResultBox = document.getElementById('pdfResultBox');
  const pdfResultInfo = document.getElementById('pdfResultInfo');
  const downloadPdf = document.getElementById('downloadPdf');
  let pdfBlob = null;

  let images = []; // {id, file, url, w, h}
  let idSeq = 0;

  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', e => {
    handleFiles(e.target.files);
    fileInput.value = '';
  });

  function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    files.forEach(file => {
      const entry = { id: idSeq++, file, url: '', w: 0, h: 0 };
      entry.ready = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            entry.url = reader.result;
            entry.w = img.naturalWidth || 1000;
            entry.h = img.naturalHeight || 1000;
            entry.img = img;
            resolve();
            render();
          };
          img.onerror = () => {
            entry.url = reader.result || '';
            entry.w = 1000;
            entry.h = 1000;
            entry.img = img;
            resolve();
            render();
          };
          img.src = reader.result;
        };
        reader.onerror = () => {
          entry.w = 1000;
          entry.h = 1000;
          resolve();
          render();
        };
        reader.readAsDataURL(file);
      });
      images.push(entry);
    });
    render();
  }

  function removeImage(id) {
    images = images.filter(i => i.id !== id);
    render();
  }

  function move(id, dir) {
    const idx = images.findIndex(i => i.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= images.length) return;
    [images[idx], images[newIdx]] = [images[newIdx], images[idx]];
    render();
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function render() {
    stack.innerHTML = '';
    images.forEach((entry, i) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <img src="${entry.url}" alt="">
        <div class="meta">
          <div class="name">${entry.file.name}</div>
          <div class="size">${formatSize(entry.file.size)}</div>
        </div>
        <div class="order">
          <button class="icon-btn up" ${i === 0 ? 'disabled' : ''}>&#8593;</button>
          <button class="icon-btn down" ${i === images.length - 1 ? 'disabled' : ''}>&#8595;</button>
        </div>
        <button class="icon-btn rotate" title="Rotate">&#10227;</button>
        <button class="icon-btn crop" title="Crop">&#9986;</button>
        <button class="icon-btn remove">&#10005;</button>
      `;
      item.querySelector('.up').addEventListener('click', () => move(entry.id, -1));
      item.querySelector('.down').addEventListener('click', () => move(entry.id, 1));
      item.querySelector('.rotate').addEventListener('click', () => rotateImage(entry));
      item.querySelector('.crop').addEventListener('click', () => openCropper(entry));
      item.querySelector('.remove').addEventListener('click', () => removeImage(entry.id));
      stack.appendChild(item);
    });
    makeBtn.disabled = images.length === 0;
    makeBtn.textContent = images.length === 0
      ? 'Add images to continue'
      : `Make PDF from ${images.length} image${images.length > 1 ? 's' : ''}`;
  }

  function rotateImage(entry) {
    const newW = entry.h;
    const newH = entry.w;
    const canvas = document.createElement('canvas');
    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext('2d');
    ctx.translate(newW / 2, newH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(entry.img, -entry.w / 2, -entry.h / 2);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const newImg = new Image();
    newImg.onload = () => {
      entry.img = newImg;
      entry.w = newW;
      entry.h = newH;
      entry.url = dataUrl;
      entry.ready = Promise.resolve();
      render();
    };
    newImg.src = dataUrl;
  }

  const cropModal = document.getElementById('cropModal');
  const cropStage = document.getElementById('cropStage');
  const cropImgEl = document.getElementById('cropImg');
  const cropBox = document.getElementById('cropBox');
  const cropCancel = document.getElementById('cropCancel');
  const cropApply = document.getElementById('cropApply');

  let cropEntry = null;
  let cropSourceImg = null;
  let cropRotation = 0;
  let box = { x: 0, y: 0, w: 0, h: 0 };
  let stageRect = { w: 0, h: 0 };
  let drag = null;

  function setupBoxFromImage() {
    requestAnimationFrame(() => {
      const iw = cropImgEl.clientWidth;
      const ih = cropImgEl.clientHeight;
      stageRect = { w: iw, h: ih };
      box = { x: 0, y: 0, w: iw, h: ih };
      drawBox();
    });
  }

  function loadIntoStage(img) {
    cropSourceImg = img;
    cropImgEl.onload = setupBoxFromImage;
    cropImgEl.src = img.src;
    if (cropImgEl.complete) setupBoxFromImage();
  }

  function openCropper(entry) {
    cropEntry = entry;
    cropRotation = 0;
    cropModal.classList.add('open');
    loadIntoStage(entry.img);
  }

  function closeCropper() {
    cropModal.classList.remove('open');
    cropEntry = null;
  }

  function drawBox() {
    cropBox.style.left = box.x + 'px';
    cropBox.style.top = box.y + 'px';
    cropBox.style.width = box.w + 'px';
    cropBox.style.height = box.h + 'px';
  }

  function clampBox() {
    box.w = Math.max(30, Math.min(box.w, stageRect.w));
    box.h = Math.max(30, Math.min(box.h, stageRect.h));
    box.x = Math.max(0, Math.min(box.x, stageRect.w - box.w));
    box.y = Math.max(0, Math.min(box.y, stageRect.h - box.h));
  }

  function startDrag(mode) {
    return e => {
      e.preventDefault();
      e.stopPropagation();
      const pt = e.touches ? e.touches[0] : e;
      drag = { mode, startX: pt.clientX, startY: pt.clientY, startBox: { ...box } };
      e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
    };
  }

  function onMove(e) {
    if (!drag) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - drag.startX;
    const dy = pt.clientY - drag.startY;
    const sb = drag.startBox;

    if (drag.mode === 'move') {
      box.x = sb.x + dx;
      box.y = sb.y + dy;
    } else {
      let { x, y, w, h } = sb;
      if (drag.mode.includes('l')) { x = sb.x + dx; w = sb.w - dx; }
      if (drag.mode.includes('r')) { w = sb.w + dx; }
      if (drag.mode.includes('t')) { y = sb.y + dy; h = sb.h - dy; }
      if (drag.mode.includes('b')) { h = sb.h + dy; }
      if (w >= 30) { box.x = x; box.w = w; }
      if (h >= 30) { box.y = y; box.h = h; }
    }
    clampBox();
    drawBox();
  }

  function endDrag() { drag = null; }

  cropBox.addEventListener('pointerdown', startDrag('move'));
  cropBox.querySelectorAll('.handle').forEach(h => {
    h.addEventListener('pointerdown', startDrag(h.dataset.h));
  });
  window.addEventListener('pointermove', onMove);  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  cropCancel.addEventListener('click', closeCropper);

  document.getElementById('cropRotateBtn').addEventListener('click', () => {
    if (!cropEntry) return;
    cropRotation = (cropRotation + 90) % 360;
    const ow = cropEntry.img.naturalWidth;
    const oh = cropEntry.img.naturalHeight;
    const swap = cropRotation === 90 || cropRotation === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? oh : ow;
    canvas.height = swap ? ow : oh;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(cropRotation * Math.PI / 180);
    ctx.drawImage(cropEntry.img, -ow / 2, -oh / 2);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const img = new Image();
    img.onload = () => loadIntoStage(img);
    img.src = dataUrl;
  });

  cropApply.addEventListener('click', () => {
    if (!cropEntry) return;
    const targetEntry = cropEntry;
    const scaleX = cropSourceImg.naturalWidth / stageRect.w;
    const scaleY = cropSourceImg.naturalHeight / stageRect.h;
    const sx = box.x * scaleX;
    const sy = box.y * scaleY;
    const sw = box.w * scaleX;
    const sh = box.h * scaleY;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cropSourceImg, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const newImg = new Image();
    newImg.onload = () => {
      targetEntry.img = newImg;
      targetEntry.w = canvas.width;
      targetEntry.h = canvas.height;
      targetEntry.url = dataUrl;
      targetEntry.ready = Promise.resolve();
      render();
    };
    newImg.src = dataUrl;
    closeCropper();
  });

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('err', !!isErr);
  }

  downloadPdf.addEventListener('click', () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pixkit-images.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  makeBtn.addEventListener('click', async () => {
    if (images.length === 0) return;
    makeBtn.disabled = true;
    pdfResultBox.style.display = 'none';
    pdfBlob = null;
    setStatus('Building PDF…');
    try {
      const { jsPDF } = window.jspdf;
      const mode = pageSizeSel.value;
      let doc = null;

      for (let i = 0; i < images.length; i++) {
        const entry = images[i];
        await entry.ready;
        const w = entry.w || 1000;
        const h = entry.h || 1000;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(entry.img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const format = 'JPEG';
        const orientation = w > h ? 'l' : 'p';

        if (i === 0) {
          if (mode === 'fit') {
            doc = new jsPDF({ orientation, unit: 'px', format: [w, h] });
          } else {
            doc = new jsPDF({ orientation, unit: 'mm', format: mode });
          }
        } else {
          if (mode === 'fit') {
            doc.addPage([w, h], orientation);
          } else {
            doc.addPage(mode, orientation);
          }
        }

        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        let drawW, drawH;
        if (mode === 'fit') {
          drawW = pageW; drawH = pageH;
        } else {
          const margin = 10;
          const availW = pageW - margin * 2;
          const availH = pageH - margin * 2;
          const scale = Math.min(availW / w, availH / h);
          drawW = w * scale;
          drawH = h * scale;
        }
        const x = (pageW - drawW) / 2;
        const y = (pageH - drawH) / 2;

        doc.addImage(dataUrl, format, x, y, drawW, drawH, undefined, 'MEDIUM');
        setStatus(`Building PDF… page ${i + 1} of ${images.length}`);
      }

      const blob = doc.output('blob');
      pdfBlob = blob;
      const inputBytes = images.reduce((sum, entry) => sum + (entry.file?.size || 0), 0);
      const pdfBytes = blob.size;
      const reduction = inputBytes > 0 ? ((inputBytes - pdfBytes) / inputBytes) * 100 : 0;
      const reductionText = reduction >= 0
        ? `Reduced by ${reduction.toFixed(1)}%`
        : `PDF is ${Math.abs(reduction).toFixed(1)}% larger than the selected images`;
      pdfResultInfo.textContent = `PDF size: ${formatSize(pdfBytes)} · ${reductionText}`;
      pdfResultBox.style.display = 'block';
      setStatus('PDF created — ready to download');
    } catch (err) {
      console.error(err);
      setStatus('Something went wrong building the PDF. Try again.', true);
    } finally {
      makeBtn.disabled = images.length === 0;
    }
  });

  const tabBtnPdf = document.getElementById('tabBtnPdf');
  const tabBtnCompress = document.getElementById('tabBtnCompress');
  const tabPdf = document.getElementById('tab-pdf');
  const tabCompress = document.getElementById('tab-compress');
  const tabPdfCompress = document.getElementById('tab-pdf-compress');
  const tabBtnPdfCompress = document.getElementById('tabBtnPdfCompress');
  tabBtnPdf.addEventListener('click', () => {
    tabBtnPdf.classList.add('active');
    tabBtnCompress.classList.remove('active');
    tabBtnPdfCompress.classList.remove('active');
    tabPdf.style.display = '';
    tabCompress.style.display = 'none';
    tabPdfCompress.style.display = 'none';
  });
  tabBtnCompress.addEventListener('click', () => {
    tabBtnCompress.classList.add('active');
    tabBtnPdf.classList.remove('active');
    tabBtnPdfCompress.classList.remove('active');
    tabCompress.style.display = '';
    tabPdf.style.display = 'none';
    tabPdfCompress.style.display = 'none';
  });
})();
