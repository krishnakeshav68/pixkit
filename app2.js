(function () {
  // Reworked image compression workflow
  const EXAM_PRESETS = {"upsc_photo":{"w":350,"h":350,"minKB":20,"maxKB":300,"note":"Commonly cited: JPG, 20–300 KB, roughly 350×350 px. Verify your current application requirements."},"upsc_sign":{"w":350,"h":350,"minKB":20,"maxKB":100,"note":"Commonly cited: JPG, 20–100 KB, roughly 350×350 px. Verify your current application requirements."},"bpsc72_sign":{"w":185,"h":285,"minKB":1,"maxKB":20,"note":"BPSC 72nd CCE signature guidance: under 20 KB, width 150–220 px, height 250–320 px. Verify your current application requirements."}};

  const PRESETS = {
    photo:{w:1200,h:1200,minKB:10,maxKB:1000,note:"General photo settings. Preserve proportions unless your portal requires fixed dimensions."},
    signature:{w:600,h:300,minKB:5,maxKB:500,note:"General signature settings. Preserve proportions unless your portal requires fixed dimensions."},
    custom:{w:350,h:350,minKB:10,maxKB:100,note:"Set your own dimensions and size range."}
  };

  const dropC=document.getElementById('dropC');
  const fileInputC=document.getElementById('fileInputC');
  const presetSel=document.getElementById('presetSel');
  const presetNote=document.getElementById('presetNote');
  const examRow=document.getElementById('examRow');
  const examSel=document.getElementById('examSel');
  const fitModeSel=document.getElementById('fitMode');
  const targetW=document.getElementById('targetW');
  const targetH=document.getElementById('targetH');
  const minKBInput=document.getElementById('minKB');
  const maxKBInput=document.getElementById('maxKB');
  const compressPreview=document.getElementById('compressPreview');
  const comparePreview=document.getElementById('comparePreview');
  const beforeImg=document.getElementById('beforeImg');
  const afterImg=document.getElementById('afterImg');
  const compressBtn=document.getElementById('compressBtn');
  const statusC=document.getElementById('statusC');
  const resultBox=document.getElementById('resultBox');
  const resultInfo=document.getElementById('resultInfo');
  const resultImg=document.getElementById('resultImg');
  const downloadCompressed=document.getElementById('downloadCompressed');
  const resetCompress=document.getElementById('resetCompress');

  let compressImg=null, compressOriginalFile=null, compressResult=null;

  function currentPreset(){
    const purpose=presetSel.value;
    if(purpose!=='custom' && examSel.value!=='none') return EXAM_PRESETS[examSel.value];
    return PRESETS[purpose];
  }
  function applyPreset(){
    const p=currentPreset();
    targetW.value=p.w; targetH.value=p.h; minKBInput.value=p.minKB; maxKBInput.value=p.maxKB;
    presetNote.textContent=p.note;
    examRow.style.display=purposeNeedsExam(presetSel.value)?'':'none';
  }
  function purposeNeedsExam(p){return p==='photo'||p==='signature';}
  presetSel.addEventListener('change',()=>{if(!purposeNeedsExam(presetSel.value))examSel.value='none';applyPreset();});
  examSel.addEventListener('change',applyPreset);
  applyPreset();

  dropC.addEventListener('dragover',e=>{e.preventDefault();dropC.classList.add('drag');});
  dropC.addEventListener('dragleave',()=>dropC.classList.remove('drag'));
  dropC.addEventListener('drop',e=>{e.preventDefault();dropC.classList.remove('drag');if(e.dataTransfer.files[0])loadCompressFile(e.dataTransfer.files[0]);});
  fileInputC.addEventListener('change',e=>{if(e.target.files[0])loadCompressFile(e.target.files[0]);fileInputC.value='';});

  function loadCompressFile(file){
    if(!file.type.startsWith('image/')){setStatusC('Please choose an image file.',true);return;}
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        compressImg=img; compressOriginalFile=file;
        compressPreview.src=reader.result; compressPreview.style.display='block';
        beforeImg.src=reader.result; comparePreview.style.display='grid';
        resultBox.style.display='none'; compressResult=null;
        compressBtn.disabled=false; compressBtn.textContent='Compress image'; setStatusC('');
      };
      img.onerror=()=>setStatusC('Could not load this image. Please try JPG, PNG or WebP.',true);
      img.src=reader.result;
    };
    reader.onerror=()=>setStatusC('Could not read this file.',true); reader.readAsDataURL(file);
  }

  function estimateKB(dataUrl){
    const b64=dataUrl.slice(dataUrl.indexOf(',')+1); const pad=b64.endsWith('==')?2:(b64.endsWith('=')?1:0);
    return (b64.length*3/4-pad)/1024;
  }
  function setStatusC(msg,err){statusC.textContent=msg||'';statusC.classList.toggle('err',!!err);}

  function renderSource(img,w,h){
    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
    const sw=img.naturalWidth||img.width, sh=img.naturalHeight||img.height;
    const mode=fitModeSel.value;
    if(mode==='stretch'){ctx.drawImage(img,0,0,w,h);}
    else {
      const scale=mode==='crop'?Math.max(w/sw,h/sh):Math.min(w/sw,h/sh);
      const dw=sw*scale, dh=sh*scale;
      ctx.drawImage(img,(w-dw)/2,(h-dh)/2,dw,dh);
    }
    return canvas;
  }

  function fitQuality(canvas,maxKB){
    let lo=.03,hi=.97,best=null;
    for(let i=0;i<12;i++){const q=(lo+hi)/2,d=canvas.toDataURL('image/jpeg',q),kb=estimateKB(d);
      if(kb<=maxKB){best={durl:d,kb,q};lo=q;}else hi=q;}
    if(!best){const d=canvas.toDataURL('image/jpeg',.03);best={durl:d,kb:estimateKB(d),q:.03};}
    return best;
  }

  compressBtn.addEventListener('click',()=>{
    if(!compressImg)return;
    const w=Math.max(1,parseInt(targetW.value,10)||compressImg.naturalWidth);
    const h=Math.max(1,parseInt(targetH.value,10)||compressImg.naturalHeight);
    const minKB=Math.max(0,parseFloat(minKBInput.value)||0), maxKB=Math.max(minKB,parseFloat(maxKBInput.value)||1e9);
    setStatusC('Compressing…'); comparePreview.style.display='grid'; 
    const canvas=renderSource(compressImg,w,h);
    const best=fitQuality(canvas,maxKB); compressResult=best;
    afterImg.src=best.durl; resultImg.src=best.durl;
    const originalKB=compressOriginalFile.size/1024;
    const reduction=originalKB?((originalKB-best.kb)/originalKB)*100:0;
    let note=`${w}×${h}px · ${best.kb.toFixed(1)} KB · ${reduction>=0?'Reduced by '+reduction.toFixed(1)+'%':'Increased by '+Math.abs(reduction).toFixed(1)+'%'} (from ${originalKB.toFixed(1)} KB)`;
    if(best.kb>maxKB)note+=' — could not reach the requested maximum; try smaller dimensions.';
    if(best.kb<minKB)note+=' — below the suggested minimum; check your portal.';
    resultInfo.textContent=note; resultBox.style.display='block'; setStatusC('');
  });

  fitModeSel.addEventListener('change',()=>{if(compressImg)setStatusC('Resize behavior changed — compress again to apply.');});
  downloadCompressed.addEventListener('click',async()=>{
    if(!compressResult)return;
    const blob=await (await fetch(compressResult.durl)).blob();
    const base=presetSel.value==='custom'?'compressed':presetSel.value==='signature'?'signature':'photo';
    const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='pixkit-'+base+'.jpg';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatusC('Image ready — check your downloads');
  });

  resetCompress.addEventListener('click',()=>{
    compressImg=null;compressOriginalFile=null;compressResult=null;
    compressPreview.removeAttribute('src');compressPreview.style.display='none';
    beforeImg.removeAttribute('src');afterImg.removeAttribute('src');comparePreview.style.display='none';
    resultImg.removeAttribute('src');resultBox.style.display='none';
    setStatusC('');compressBtn.disabled=true;compressBtn.textContent='Add an image to continue';fileInputC.value='';applyPreset();
  });
})();