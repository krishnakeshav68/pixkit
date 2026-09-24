(function () {
  const tabBtn = document.getElementById('tabBtnPdfCompress');
  const tabPdf = document.getElementById('tab-pdf');
  const tabCompress = document.getElementById('tab-compress');
  const tabPdfCompress = document.getElementById('tab-pdf-compress');
  const drop = document.getElementById('dropPdfC');
  const fileInput = document.getElementById('fileInputPdfC');
  const qualitySel = document.getElementById('pdfQuality');
  const qualityNote = document.getElementById('pdfQualityNote');
  const fileInfo = document.getElementById('pdfFileInfo');
  const compressBtn = document.getElementById('compressPdfBtn');
  const status = document.getElementById('statusPdfC');
  const resultBox = document.getElementById('pdfCompressResult');
  const resultInfo = document.getElementById('pdfCompressInfo');
  const downloadBtn = document.getElementById('downloadPdfCompressed');
  const progressBox = document.getElementById('pdfProgress');
  const progressBar = document.getElementById('pdfProgressBar');
  const progressText = document.getElementById('pdfProgressText');
  const cancelBtn = document.getElementById('cancelPdfCompress');
  const resetBtn = document.getElementById('resetPdfCompress');
  let cancelled = false;

  let pdfFile = null;
  let compressedBlob = null;

  const PRESETS = {
    high: { scale: 1.5, quality: 0.82, label: 'High quality — better detail, larger file.' },
    balanced: { scale: 1.15, quality: 0.68, label: 'Balanced — a practical compromise between quality and file size.' },
    maximum: { scale: 0.85, quality: 0.48, label: 'Maximum compression — smallest file, with more visible quality loss.' }
  };

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function setStatus(msg, err) {
    status.textContent = msg || '';
    status.classList.toggle('err', !!err);
  }

  function applyQuality() {
    qualityNote.textContent = PRESETS[qualitySel.value].label;
  }
  qualitySel.addEventListener('change', applyQuality);
  applyQuality();

  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
    fileInput.value = '';
  });

  function loadFile(file) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setStatus('Please choose a PDF file.', true);
      return;
    }
    pdfFile = file;
    compressedBlob = null;
    cancelled = false;
    progressBox.style.display = 'none';
    progressBar.style.width = '0%';
    fileInfo.textContent = 'Selected: ' + file.name + ' · ' + formatSize(file.size);
    compressBtn.disabled = false;
    compressBtn.textContent = 'Compress PDF';
    resultBox.style.display = 'none';
    setStatus('');
  }

  compressBtn.addEventListener('click', async () => {
    if (!pdfFile) return;

    compressBtn.disabled = true;
    cancelBtn.style.display = '';
    resultBox.style.display = 'none';
    progressBox.style.display = 'block';
    progressBar.style.width = '0%';
    compressedBlob = null;
    setStatus('Reading PDF…');

    try {
      const pdfjs = window.pdfjsLib;
      if (!pdfjs) throw new Error('PDF engine could not be loaded.');
      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const bytes = await pdfFile.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      const preset = PRESETS[qualitySel.value];
      const jsPDF = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDF) throw new Error('PDF creation engine could not be loaded.');

      let out = null;

      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        if (cancelled) throw new Error('CANCELLED');
        const pct = Math.round(((pageNo - 1) / pdf.numPages) * 100);
        progressBar.style.width = pct + '%';
        progressText.textContent = 'Compressing page ' + pageNo + ' of ' + pdf.numPages + '…';
        setStatus('Compressing page ' + pageNo + ' of ' + pdf.numPages + '…');
        const page = await pdf.getPage(pageNo);
        const originalViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: preset.scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        const imageData = canvas.toDataURL('image/jpeg', preset.quality);
        const pageW = originalViewport.width;
        const pageH = originalViewport.height;

        if (pageNo === 1) {
          out = new jsPDF({
            orientation: pageW > pageH ? 'landscape' : 'portrait',
            unit: 'pt',
            format: [pageW, pageH],
            compress: true
          });
        } else {
          out.addPage([pageW, pageH], pageW > pageH ? 'landscape' : 'portrait');
        }

        out.addImage(imageData, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
      }

      if (cancelled) throw new Error('CANCELLED');
      compressedBlob = out.output('blob');
      progressBar.style.width = '100%';
      progressText.textContent = 'Finished — ready to download.';
      const reduction = ((pdfFile.size - compressedBlob.size) / pdfFile.size) * 100;
      const reductionText = reduction >= 0
        ? 'Reduced by ' + reduction.toFixed(1) + '%'
        : 'Increased by ' + Math.abs(reduction).toFixed(1) + '%';

      resultInfo.textContent =
        'Original: ' + formatSize(pdfFile.size) +
        ' · Compressed: ' + formatSize(compressedBlob.size) +
        ' · ' + reductionText +
        ' · ' + pdf.numPages + ' page' + (pdf.numPages === 1 ? '' : 's');

      resultBox.style.display = 'block';
      setStatus('PDF compressed — ready to download');
    } catch (err) {
      if (err && err.message === 'CANCELLED') {
        setStatus('Compression cancelled.');
        progressText.textContent = 'Cancelled.';
      } else {
        console.error(err);
        setStatus('Could not compress this PDF. Try a smaller PDF or another compression level.', true);
        progressText.textContent = 'Compression failed. A smaller PDF may work better.';
      }
    } finally {
      compressBtn.disabled = !pdfFile;
      cancelBtn.style.display = pdfFile ? '' : 'none';
    }
  });

  downloadBtn.addEventListener('click', () => {
    if (!compressedBlob) return;
    const url = URL.createObjectURL(compressedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pixkit-compressed.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();


  cancelBtn.addEventListener('click', () => {
    cancelled = true;
    cancelBtn.disabled = true;
    setStatus('Stopping after the current page…');
  });

  resetBtn.addEventListener('click', () => {
    cancelled = true;
    pdfFile = null;
    compressedBlob = null;
    fileInput.value = '';
    fileInfo.textContent = '';
    resultBox.style.display = 'none';
    progressBox.style.display = 'none';
    progressBar.style.width = '0%';
    progressText.textContent = '';
    cancelBtn.style.display = 'none';
    cancelBtn.disabled = false;
    compressBtn.disabled = true;
    compressBtn.textContent = 'Add a PDF to continue';
    setStatus('');
  });
