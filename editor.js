(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const fileInput = $('editorFile');
  if (!fileInput || !window.pdfjsLib || !window.PDFLib) return;

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const { PDFDocument, degrees, rgb, StandardFonts } = PDFLib;

  const status = $('editorStatus');
  const workspace = $('editorWorkspace');
  const toolbar = $('editorToolbar');
  const thumbs = $('editorThumbnails');
  const pageCanvas = $('editorPageCanvas');
  const overlayCanvas = $('editorOverlayCanvas');
  const ctx = pageCanvas.getContext('2d');
  const octx = overlayCanvas.getContext('2d');

  let pdfJsDoc = null;
  let originalBytes = null;
  let fileName = 'document.pdf';
  let pages = [];
  let selected = 0;
  let nextAnnotationId = 1;
  let activePointer = null;
  let drawingAnnotation = null;
  let isDirty = false;
  const history = [];

  function setStatus(message, error) {
    status.textContent = message;
    status.classList.toggle('editor-status-error', Boolean(error));
  }

  function currentPage() { return pages[selected]; }
  function markDirty() { isDirty = true; }

  async function renderPdfPage(pdfDoc, pageNumber, canvas, maxWidth, maxHeight, extraRotation) {
    const page = await pdfDoc.getPage(pageNumber);
    const rotation = ((page.rotate || 0) + (extraRotation || 0) + 360) % 360;
    const viewport0 = page.getViewport({ scale: 1, rotation });
    const scale = Math.min(maxWidth / viewport0.width, maxHeight / viewport0.height, 1.55);
    const viewport = page.getViewport({ scale: Math.max(0.25, scale), rotation });
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    const canvasContext = canvas.getContext('2d');
    await page.render({ canvasContext, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    return { width: viewport.width, height: viewport.height, rotation: page.rotate || 0 };
  }

  function snapshotPage() {
    return { selected, pages: pages.map(page => ({...page, annotations: page.annotations.map(a => ({...a, points: a.points ? a.points.map(p => ({...p})) : undefined }))})) };
  }
  function pushHistory() {
    history.push(snapshotPage());
    if (history.length > 40) history.shift();
  }
  function restoreHistory(snapshot) {
    selected = Math.max(0, Math.min(snapshot.selected, snapshot.pages.length - 1));
    pages = snapshot.pages;
    isDirty = true;
    renderAll().catch(err => setStatus(err.message || 'Could not restore previous edit.', true));
  }

  async function renderAll() {
    if (!pdfJsDoc || !pages.length) return;
    selected = Math.max(0, Math.min(selected, pages.length - 1));
    workspace.style.display = '';
    toolbar.style.display = '';
    $('editorPageCount').textContent = pages.length;
    $('editorCurrentPage').textContent = 'Page ' + (selected + 1) + ' of ' + pages.length;
        $('editorPrev').disabled = selected === 0;
    $('editorNext').disabled = selected === pages.length - 1;
    $('editorDeletePage').disabled = pages.length <= 1;
    $('editorExtractPage').disabled = false;
    $('editorUndo').disabled = history.length === 0;
    thumbs.replaceChildren();

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'editor-thumb' + (i === selected ? ' active' : '');
      button.draggable = true;
      button.dataset.index = String(i);
      const mini = document.createElement('canvas');
      button.appendChild(mini);
      const label = document.createElement('span');
      label.textContent = 'Page ' + (i + 1);
      button.appendChild(label);
      button.addEventListener('click', () => { selected = Number(button.dataset.index); renderAll().catch(handleError); });
      button.addEventListener('dragstart', event => {
        event.dataTransfer.setData('text/plain', button.dataset.index);
        event.dataTransfer.effectAllowed = 'move';
      });
      button.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; });
      button.addEventListener('drop', event => {
        event.preventDefault();
        const from = Number(event.dataTransfer.getData('text/plain'));
        const to = Number(button.dataset.index);
        if (!Number.isInteger(from) || from === to || from < 0 || from >= pages.length) return;
        pushHistory();
        const [moved] = pages.splice(from, 1);
        pages.splice(to, 0, moved);
        selected = to;
        markDirty();
        renderAll().catch(handleError);
      });
      thumbs.appendChild(button);
      try {
        await renderPdfPage(pdfJsDoc, page.sourceIndex + 1, mini, 170, 220, page.rotation);
  
      } catch (_) {
        const fallback = document.createElement('span');
        fallback.textContent = 'Preview unavailable';
        button.appendChild(fallback);
      }
    }

    const selectedPage = currentPage();
    await renderPdfPage(pdfJsDoc, selectedPage.sourceIndex + 1, pageCanvas, 950, 1100, selectedPage.rotation);

    overlayCanvas.width = pageCanvas.width;
    overlayCanvas.height = pageCanvas.height;
    overlayCanvas.style.width = pageCanvas.style.width;
    overlayCanvas.style.height = pageCanvas.style.height;
    overlayCanvas.style.marginTop = '0';
    redrawAnnotations();
    $('editorZoomInfo').textContent = Math.round(parseFloat(pageCanvas.style.width) || 0) + ' px preview';
  }

  function hexRgb(hex) {
    const value = String(hex || '#d62828').replace('#', '');
    return {
      r: parseInt(value.slice(0, 2), 16) / 255,
      g: parseInt(value.slice(2, 4), 16) / 255,
      b: parseInt(value.slice(4, 6), 16) / 255
    };
  }
  function annotationColor(hex, alpha) {
    const value = hex || '#d62828';
    return { color: value, alpha: alpha == null ? 1 : alpha };
  }
  function drawAnnotation(ctx2, ann, width, height) {
    const x = ann.x * width, y = ann.y * height;
    ctx2.save();
    ctx2.strokeStyle = ann.color || '#d62828';
    ctx2.fillStyle = ann.color || '#d62828';
    ctx2.lineWidth = Math.max(1, Number(ann.size || 3)) * (width / 700);
    ctx2.lineCap = 'round';
    ctx2.lineJoin = 'round';
    if (ann.type === 'text' || ann.type === 'signature') {
      ctx2.font = (ann.type === 'signature' ? 'italic ' : '') + Math.max(8, Number(ann.size || 18)) * (width / 700) + 'px Arial, sans-serif';
      ctx2.fillText(ann.text || '', x, y);
    } else if (ann.type === 'highlight') {
      ctx2.strokeStyle = ann.color || '#ffeb3b';
      ctx2.globalAlpha = 0.35;
      ctx2.lineWidth = Math.max(10, Number(ann.size || 20)) * (width / 700);
      ctx2.beginPath();
      (ann.points || []).forEach((point, index) => index ? ctx2.lineTo(point.x * width, point.y * height) : ctx2.moveTo(point.x * width, point.y * height));
      ctx2.stroke();
    } else if (ann.type === 'pen') {
      ctx2.beginPath();
      (ann.points || []).forEach((point, index) => index ? ctx2.lineTo(point.x * width, point.y * height) : ctx2.moveTo(point.x * width, point.y * height));
      ctx2.stroke();
    }
    ctx2.restore();
  }

  function redrawAnnotations() {
    if (!currentPage() || !overlayCanvas.width || !overlayCanvas.height) return;
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    for (const ann of currentPage().annotations) drawAnnotation(octx, ann, overlayCanvas.width, overlayCanvas.height);
  }
  function pointerPosition(event) {
    const rect = overlayCanvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
  }

  overlayCanvas.addEventListener('pointerdown', event => {
    if (!currentPage()) return;
    const tool = $('editorTool').value;
    const point = pointerPosition(event);
    if (tool === 'select') return;
    event.preventDefault();
    overlayCanvas.setPointerCapture(event.pointerId);
    pushHistory();
    const color = $('editorColor').value;
    const size = Math.max(8, Math.min(72, Number($('editorTextSize').value) || 18));
    if (tool === 'text' || tool === 'signature') {
      const value = $('editorTextInput').value.trim();
      if (!value) { history.pop(); setStatus('Enter text in the Text / signature field first.', true); return; }
      currentPage().annotations.push({id: nextAnnotationId++, type: tool, x: point.x, y: point.y, text: value, color, size});
      markDirty();
      redrawAnnotations();
    } else if (tool === 'pen' || tool === 'highlight') {
      drawingAnnotation = {id: nextAnnotationId++, type: tool, x: point.x, y: point.y, points: [point], color: tool === 'highlight' && color === '#d62828' ? '#ffeb3b' : color, size: tool === 'highlight' ? Math.max(18, size) : Math.max(2, size / 6)};
      currentPage().annotations.push(drawingAnnotation);
      activePointer = event.pointerId;
      redrawAnnotations();
    } else if (tool === 'erase') {
      const anns = currentPage().annotations;
      let best = -1, bestDist = Infinity;
      anns.forEach((ann, index) => {
        const d = Math.hypot(ann.x - point.x, ann.y - point.y);
        if (d < bestDist) {bestDist=d;best=index;}
      });
      if (best >= 0 && bestDist < 0.08) { anns.splice(best, 1); markDirty(); redrawAnnotations(); }
      else history.pop();
    }
  });
  overlayCanvas.addEventListener('pointermove', event => {
    if (activePointer !== event.pointerId || !drawingAnnotation) return;
    const point = pointerPosition(event);
    drawingAnnotation.points.push(point);
    redrawAnnotations();
  });
  function endDrawing(event) {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    drawingAnnotation = null;
    markDirty();
    setStatus('Annotation added. Download the PDF to save your changes.');
  }
  overlayCanvas.addEventListener('pointerup', endDrawing);
  overlayCanvas.addEventListener('pointercancel', endDrawing);

  $('editorAddText').addEventListener('click', () => {
    if (!currentPage()) return;
    const value = $('editorTextInput').value.trim();
    if (!value) return setStatus('Enter text or a signature first.', true);
    pushHistory();
    currentPage().annotations.push({id: nextAnnotationId++, type: 'text', x: 0.08, y: 0.12, text: value, color: $('editorColor').value, size: Math.max(8, Number($('editorTextSize').value) || 18)});
    markDirty();
    redrawAnnotations();
    setStatus('Text added near the top-left. Choose Select / move (coming in a later step) or use the tool again to add more.');
  });
  $('editorUndo').addEventListener('click', () => {
    if (!history.length) return;
    restoreHistory(history.pop());
  });
  $('editorClearPage').addEventListener('click', () => {
    if (!currentPage() || !currentPage().annotations.length) return;
    pushHistory(); currentPage().annotations = []; markDirty(); redrawAnnotations();
    setStatus('Annotations cleared from this page.');
  });
  $('editorRotateLeft').addEventListener('click', () => rotatePage(-90));
  $('editorRotateRight').addEventListener('click', () => rotatePage(90));
  function rotatePage(delta) {
    if (!currentPage()) return;
    pushHistory(); currentPage().rotation = (currentPage().rotation + delta + 360) % 360; markDirty();
    renderAll().then(() => setStatus('Page rotation updated.')).catch(handleError);
  }
  $('editorDeletePage').addEventListener('click', () => {
    if (pages.length <= 1) return setStatus('A PDF must contain at least one page.', true);
    if (!confirm('Delete page ' + (selected + 1) + '?')) return;
    pushHistory(); pages.splice(selected, 1); selected = Math.min(selected, pages.length - 1); markDirty();
    renderAll().then(() => setStatus('Page deleted.')).catch(handleError);
  });
  $('editorDuplicatePage').addEventListener('click', () => {
    if (!currentPage()) return;
    pushHistory(); pages.splice(selected + 1, 0, {...currentPage(), annotations: currentPage().annotations.map(a => ({...a, points: a.points ? a.points.map(p => ({...p})) : undefined }))}); selected++; markDirty();
    renderAll().then(() => setStatus('Page added to the working copy. Export will duplicate this page.')).catch(handleError);
  });
  $('editorPrev').addEventListener('click', () => { if (selected > 0) { selected--; renderAll().catch(handleError); } });
  $('editorNext').addEventListener('click', () => { if (selected < pages.length - 1) { selected++; renderAll().catch(handleError); } });

  async function exportPageSubset(indexes, downloadName) {
    const bytes = originalBytes.slice(0);
    const pdf = await PDFDocument.load(bytes);
    const target = await PDFDocument.create();
    const indices = indexes.map(i => pages[i].sourceIndex);
    const copied = await target.copyPages(pdf, indices);
    copied.forEach((p, i) => { target.addPage(p); const pg = pages[indexes[i]]; if (pg.rotation) p.setRotation(degrees((p.getRotation().angle + pg.rotation + 360) % 360)); });
    downloadBytes(await target.save(), downloadName);
  }
  $('editorExtractPage').addEventListener('click', async () => {
    try { await exportPageSubset([selected], stem() + '-page-' + (selected + 1) + '.pdf'); setStatus('Selected page downloaded.'); }
    catch (err) { handleError(err); }
  });

  async function exportEditedPdf() {
    if (!pages.length) return;
    const source = await PDFDocument.load(originalBytes.slice(0));
    const result = await PDFDocument.create();
    const copied = await result.copyPages(source, pages.map(p => p.sourceIndex));
    for (let i = 0; i < copied.length; i++) {
      const pdfPage = copied[i];
      const sourcePage = pages[i];
      result.addPage(pdfPage);
      if (sourcePage.rotation) pdfPage.setRotation(degrees((pdfPage.getRotation().angle + sourcePage.rotation + 360) % 360));
    }
    const font = await result.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < pages.length; i++) {
      const page = result.getPages()[i];
      const size = page.getSize();
      for (const ann of pages[i].annotations) {
        const color = hexRgb(ann.color);
        const x = ann.x * size.width;
        const y = size.height - ann.y * size.height;
        if (ann.type === 'text' || ann.type === 'signature') {
          const safeText = String(ann.text || '').replace(/[^\x20-\x7E]/g, '?');
          page.drawText(safeText, {x, y, size: Math.max(8, Number(ann.size) || 18), font, color: rgb(color.r, color.g, color.b), opacity: 1});
        } else if (ann.type === 'pen' || ann.type === 'highlight') {
          const points = ann.points || [];
          for (let p = 1; p < points.length; p++) {
            const a = points[p - 1], b = points[p];
            page.drawLine({
              start: {x: a.x * size.width, y: size.height - a.y * size.height},
              end: {x: b.x * size.width, y: size.height - b.y * size.height},
              thickness: ann.type === 'highlight' ? Math.max(8, Number(ann.size) || 20) : Math.max(1, Number(ann.size) || 2),
              color: ann.type === 'highlight' ? rgb(1, 0.9, 0.05) : rgb(color.r, color.g, color.b),
              opacity: ann.type === 'highlight' ? 0.28 : 1
            });
          }
        }
      }
    }
    const bytes = await result.save();
    downloadBytes(bytes, stem() + '-edited.pdf');
    isDirty = false;
    setStatus('Edited PDF downloaded. Existing text has not been rewritten; page changes and annotations were exported.');
  }
  $('editorSave').addEventListener('click', async () => {
    try { setStatus('Preparing edited PDF…'); $('editorSave').disabled = true; await exportEditedPdf(); }
    catch (err) { handleError(err); }
    finally { $('editorSave').disabled = false; }
  });

  function downloadBytes(bytes, name) {
    const blob = new Blob([bytes], {type: 'application/pdf'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function stem() { return fileName.replace(/\.pdf$/i, '') || 'document'; }
  function handleError(err) {
    console.error(err);
    setStatus((err && err.message ? err.message : 'PDF editor failed') + '. Try a different or smaller, unencrypted PDF.', true);
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (file.size > 150 * 1024 * 1024) return setStatus('This file is over 150 MB. Please use a smaller PDF to avoid exhausting browser memory.', true);
    try {
      setStatus('Loading PDF locally…');
      fileName = file.name || 'document.pdf';
      originalBytes = await file.arrayBuffer();
      pdfJsDoc = await pdfjsLib.getDocument({data: originalBytes.slice(0)}).promise;
      const count = pdfJsDoc.numPages;
      pages = Array.from({length: count}, (_, index) => ({sourceIndex: index, rotation: 0, annotations: []}));
      selected = 0; history.length = 0; nextAnnotationId = 1; isDirty = false;
      await renderAll();
      setStatus('PDF loaded locally. ' + count + ' page' + (count === 1 ? '' : 's') + ' ready to edit.');
    } catch (err) { handleError(err); }
  });

  window.addEventListener('beforeunload', event => {
    if (isDirty) { event.preventDefault(); event.returnValue = ''; }
  });
})();