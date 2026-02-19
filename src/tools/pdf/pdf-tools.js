/**
 * ToolBox PDF 工具箱 — 纯前端 PDF 处理引擎
 * 基于 pdf-lib（操作 PDF）和 pdf.js（渲染 PDF）
 * 所有数据处理 100% 在浏览器端完成
 */
(function () {
    'use strict';

    const { PDFDocument } = PDFLib;

    // ========== Utilities ==========

    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return document.querySelectorAll(sel); }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function showToast(msg) {
        const t = $('#toast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2500);
    }

    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsArrayBuffer(file);
        });
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    function setProgress(prefix, pct, text) {
        const bar = $(`#progress-${prefix}`);
        const fill = $(`#progress-fill-${prefix}`);
        const txt = $(`#progress-text-${prefix}`);
        bar.style.display = 'block';
        fill.style.width = pct + '%';
        if (txt) { txt.style.display = 'block'; txt.textContent = text || ''; }
    }

    function hideProgress(prefix) {
        $(`#progress-${prefix}`).style.display = 'none';
        const txt = $(`#progress-text-${prefix}`);
        if (txt) txt.style.display = 'none';
    }

    function showResult(prefix) { $(`#result-${prefix}`).style.display = 'block'; }
    function hideResult(prefix) { $(`#result-${prefix}`).style.display = 'none'; }

    // ========== Tab System ==========

    const tabBtns = $$('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            $$('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            $(`#panel-${btn.dataset.tab}`).classList.add('active');
        });
    });

    // ========== File Management ==========

    class FileManager {
        constructor(prefix, opts = {}) {
            this.prefix = prefix;
            this.files = [];
            this.accept = opts.accept || '.pdf';
            this.multiple = opts.multiple || false;
            this.onUpdate = opts.onUpdate || (() => { });

            const dropZone = $(`#drop-${prefix}`);
            const fileInput = $(`#file-${prefix}`);

            // Drag & drop
            ['dragenter', 'dragover'].forEach(ev =>
                dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); })
            );
            ['dragleave', 'drop'].forEach(ev =>
                dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover'))
            );
            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                this.addFiles(Array.from(e.dataTransfer.files));
            });

            fileInput.addEventListener('change', e => {
                this.addFiles(Array.from(e.target.files));
                e.target.value = '';
            });
        }

        addFiles(newFiles) {
            const validExt = this.accept.split(',').map(s => s.trim().toLowerCase());
            const filtered = newFiles.filter(f => {
                const ext = '.' + f.name.split('.').pop().toLowerCase();
                if (this.accept === 'image/*') return f.type.startsWith('image/');
                return validExt.some(v => v === ext || v === '.*');
            });

            if (!filtered.length) {
                showToast('不支持此文件格式');
                return;
            }

            if (this.multiple) {
                this.files.push(...filtered);
            } else {
                this.files = [filtered[0]];
            }

            this.renderList();
            this.onUpdate(this.files);
        }

        renderList() {
            const listEl = $(`#list-${this.prefix}`);
            listEl.innerHTML = '';
            this.files.forEach((f, i) => {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.draggable = this.multiple;
                item.dataset.index = i;
                item.innerHTML = `
          <span class="file-icon">${this.accept === 'image/*' ? '🖼️' : '📄'}</span>
          <span class="file-name" title="${f.name}">${f.name}</span>
          <span class="file-size">${formatSize(f.size)}</span>
          <button class="file-remove" title="移除">✕</button>
        `;
                item.querySelector('.file-remove').addEventListener('click', () => {
                    this.files.splice(i, 1);
                    this.renderList();
                    this.onUpdate(this.files);
                });

                // Drag reorder
                if (this.multiple) {
                    item.addEventListener('dragstart', e => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', i);
                        item.classList.add('dragging');
                    });
                    item.addEventListener('dragend', () => item.classList.remove('dragging'));
                    item.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
                    item.addEventListener('drop', e => {
                        e.preventDefault();
                        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                        const toIdx = i;
                        if (fromIdx !== toIdx) {
                            const [moved] = this.files.splice(fromIdx, 1);
                            this.files.splice(toIdx, 0, moved);
                            this.renderList();
                            this.onUpdate(this.files);
                        }
                    });
                }

                listEl.appendChild(item);
            });
        }
    }

    // ========== PDF Compress (pdf.js render → canvas → pdf-lib rebuild) ==========

    let compressResult = null;

    const fmCompress = new FileManager('compress', {
        onUpdate(files) {
            const show = files.length > 0;
            $('#opts-compress').style.display = show ? 'flex' : 'none';
            $('#action-compress').style.display = show ? 'flex' : 'none';
            hideResult('compress');
        }
    });

    $('#btn-compress').addEventListener('click', async () => {
        if (!fmCompress.files.length) return;
        const file = fmCompress.files[0];
        const quality = parseFloat($('#compress-quality').value);
        const dpi = parseInt($('#compress-dpi').value);
        const origSize = file.size;

        try {
            $('#btn-compress').disabled = true;
            setProgress('compress', 0, '正在读取 PDF...');

            const arrayBuf = await readFileAsArrayBuffer(file);

            // Use pdf.js to render pages
            setProgress('compress', 10, '正在加载 PDF...');
            const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

            const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise;
            const numPages = pdfDoc.numPages;

            // Create new PDF
            const newPdf = await PDFDocument.create();
            const scale = dpi / 72;

            for (let i = 1; i <= numPages; i++) {
                setProgress('compress', 10 + (i / numPages) * 80, `正在处理第 ${i}/${numPages} 页...`);

                const page = await pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale });

                // Render to canvas
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;

                // Canvas → JPEG blob
                const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
                const jpegBytes = Uint8Array.from(atob(jpegDataUrl.split(',')[1]), c => c.charCodeAt(0));

                // Embed in new PDF
                const jpegImage = await newPdf.embedJpg(jpegBytes);
                const newPage = newPdf.addPage([viewport.width / scale, viewport.height / scale]);
                newPage.drawImage(jpegImage, {
                    x: 0, y: 0,
                    width: viewport.width / scale,
                    height: viewport.height / scale,
                });
            }

            setProgress('compress', 95, '正在生成文件...');
            const pdfBytes = await newPdf.save();
            compressResult = new Blob([pdfBytes], { type: 'application/pdf' });

            const newSize = compressResult.size;
            const ratio = ((1 - newSize / origSize) * 100).toFixed(1);

            setProgress('compress', 100, '完成！');
            setTimeout(() => hideProgress('compress'), 500);

            $('#result-stats-compress').innerHTML = `
        <span class="result-stat">原始大小: <strong>${formatSize(origSize)}</strong></span>
        <span class="result-stat">压缩后: <strong>${formatSize(newSize)}</strong></span>
        <span class="result-stat">缩小: <strong>${ratio}%</strong></span>
      `;
            showResult('compress');
            showToast(`✅ 压缩完成，缩小了 ${ratio}%`);

        } catch (err) {
            console.error(err);
            showToast('❌ 压缩失败: ' + err.message);
            hideProgress('compress');
        } finally {
            $('#btn-compress').disabled = false;
        }
    });

    $('#btn-download-compress').addEventListener('click', () => {
        if (compressResult) {
            const name = fmCompress.files[0]?.name?.replace('.pdf', '') || 'compressed';
            downloadBlob(compressResult, `${name}_compressed.pdf`);
        }
    });

    // ========== PDF Merge ==========

    let mergeResult = null;

    const fmMerge = new FileManager('merge', {
        multiple: true,
        onUpdate(files) {
            $('#action-merge').style.display = files.length >= 2 ? 'flex' : 'none';
            hideResult('merge');
        }
    });

    $('#btn-merge').addEventListener('click', async () => {
        if (fmMerge.files.length < 2) { showToast('至少需要 2 个 PDF'); return; }

        try {
            $('#btn-merge').disabled = true;
            const merged = await PDFDocument.create();
            const total = fmMerge.files.length;

            for (let i = 0; i < total; i++) {
                setProgress('merge', (i / total) * 90, `正在合并第 ${i + 1}/${total} 个文件...`);
                const buf = await readFileAsArrayBuffer(fmMerge.files[i]);
                const src = await PDFDocument.load(buf);
                const pages = await merged.copyPages(src, src.getPageIndices());
                pages.forEach(p => merged.addPage(p));
            }

            setProgress('merge', 95, '正在生成文件...');
            const bytes = await merged.save();
            mergeResult = new Blob([bytes], { type: 'application/pdf' });

            setProgress('merge', 100, '完成！');
            setTimeout(() => hideProgress('merge'), 500);

            const totalPages = merged.getPageCount();
            $('#result-stats-merge').innerHTML = `
        <span class="result-stat">合并文件数: <strong>${total}</strong></span>
        <span class="result-stat">总页数: <strong>${totalPages}</strong></span>
        <span class="result-stat">文件大小: <strong>${formatSize(mergeResult.size)}</strong></span>
      `;
            showResult('merge');
            showToast(`✅ 已合并 ${total} 个文件 (${totalPages} 页)`);

        } catch (err) {
            console.error(err);
            showToast('❌ 合并失败: ' + err.message);
            hideProgress('merge');
        } finally {
            $('#btn-merge').disabled = false;
        }
    });

    $('#btn-download-merge').addEventListener('click', () => {
        if (mergeResult) downloadBlob(mergeResult, 'merged.pdf');
    });

    // ========== PDF Split ==========

    let splitResults = [];

    const fmSplit = new FileManager('split', {
        onUpdate(files) {
            const show = files.length > 0;
            $('#opts-split').style.display = show ? 'flex' : 'none';
            $('#action-split').style.display = show ? 'flex' : 'none';
            hideResult('split');
        }
    });

    $('#split-mode').addEventListener('change', e => {
        $('#split-range-group').style.display = e.target.value === 'range' ? 'flex' : 'none';
    });

    function parsePageRanges(str, maxPage) {
        const pages = new Set();
        str.split(',').forEach(part => {
            part = part.trim();
            if (!part) return;
            if (part.includes('-')) {
                const [a, b] = part.split('-').map(Number);
                for (let i = Math.max(1, a); i <= Math.min(maxPage, b); i++) pages.add(i - 1);
            } else {
                const n = parseInt(part);
                if (n >= 1 && n <= maxPage) pages.add(n - 1);
            }
        });
        return Array.from(pages).sort((a, b) => a - b);
    }

    $('#btn-split').addEventListener('click', async () => {
        if (!fmSplit.files.length) return;
        const file = fmSplit.files[0];

        try {
            $('#btn-split').disabled = true;
            setProgress('split', 0, '正在读取 PDF...');

            const buf = await readFileAsArrayBuffer(file);
            const src = await PDFDocument.load(buf);
            const numPages = src.getPageCount();
            const mode = $('#split-mode').value;

            splitResults = [];

            if (mode === 'each') {
                for (let i = 0; i < numPages; i++) {
                    setProgress('split', (i / numPages) * 90, `正在拆分第 ${i + 1}/${numPages} 页...`);
                    const newDoc = await PDFDocument.create();
                    const [page] = await newDoc.copyPages(src, [i]);
                    newDoc.addPage(page);
                    const bytes = await newDoc.save();
                    splitResults.push({
                        blob: new Blob([bytes], { type: 'application/pdf' }),
                        name: `${file.name.replace('.pdf', '')}_page_${i + 1}.pdf`
                    });
                }
            } else {
                const rangeStr = $('#split-range').value;
                if (!rangeStr.trim()) { showToast('请输入页码范围'); return; }
                const indices = parsePageRanges(rangeStr, numPages);
                if (!indices.length) { showToast('无效的页码范围'); return; }

                setProgress('split', 50, '正在提取页面...');
                const newDoc = await PDFDocument.create();
                const pages = await newDoc.copyPages(src, indices);
                pages.forEach(p => newDoc.addPage(p));
                const bytes = await newDoc.save();
                splitResults.push({
                    blob: new Blob([bytes], { type: 'application/pdf' }),
                    name: `${file.name.replace('.pdf', '')}_pages_${rangeStr.replace(/\s/g, '')}.pdf`
                });
            }

            setProgress('split', 100, '完成！');
            setTimeout(() => hideProgress('split'), 500);

            $('#result-stats-split').innerHTML = `
        <span class="result-stat">原始页数: <strong>${numPages}</strong></span>
        <span class="result-stat">生成文件: <strong>${splitResults.length}</strong></span>
      `;

            const dlContainer = $('#split-downloads');
            dlContainer.innerHTML = '';
            if (splitResults.length <= 10) {
                splitResults.forEach(r => {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-secondary';
                    btn.style.margin = '0.25rem';
                    btn.textContent = `📥 ${r.name}`;
                    btn.addEventListener('click', () => downloadBlob(r.blob, r.name));
                    dlContainer.appendChild(btn);
                });
            } else {
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary';
                btn.textContent = `📥 逐个下载全部 ${splitResults.length} 个文件`;
                btn.addEventListener('click', async () => {
                    for (const r of splitResults) {
                        downloadBlob(r.blob, r.name);
                        await new Promise(res => setTimeout(res, 300));
                    }
                });
                dlContainer.appendChild(btn);
            }

            showResult('split');
            showToast(`✅ 拆分完成，生成 ${splitResults.length} 个文件`);

        } catch (err) {
            console.error(err);
            showToast('❌ 拆分失败: ' + err.message);
            hideProgress('split');
        } finally {
            $('#btn-split').disabled = false;
        }
    });

    // ========== Image to PDF ==========

    let img2pdfResult = null;

    const fmImg2pdf = new FileManager('img2pdf', {
        accept: 'image/*',
        multiple: true,
        onUpdate(files) {
            $('#action-img2pdf').style.display = files.length > 0 ? 'flex' : 'none';
            hideResult('img2pdf');
        }
    });

    $('#btn-img2pdf').addEventListener('click', async () => {
        if (!fmImg2pdf.files.length) return;

        try {
            $('#btn-img2pdf').disabled = true;
            const pdf = await PDFDocument.create();
            const total = fmImg2pdf.files.length;

            for (let i = 0; i < total; i++) {
                setProgress('img2pdf', (i / total) * 90, `正在处理第 ${i + 1}/${total} 张图片...`);

                const file = fmImg2pdf.files[i];
                const buf = await readFileAsArrayBuffer(file);
                const uint8 = new Uint8Array(buf);

                let image;
                const type = file.type.toLowerCase();
                if (type === 'image/jpeg' || type === 'image/jpg') {
                    image = await pdf.embedJpg(uint8);
                } else if (type === 'image/png') {
                    image = await pdf.embedPng(uint8);
                } else {
                    // Convert other formats to PNG via canvas
                    const imgEl = await createImageBitmap(file);
                    const canvas = document.createElement('canvas');
                    canvas.width = imgEl.width;
                    canvas.height = imgEl.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(imgEl, 0, 0);
                    const dataUrl = canvas.toDataURL('image/png');
                    const pngBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
                    image = await pdf.embedPng(pngBytes);
                }

                const page = pdf.addPage([image.width, image.height]);
                page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
            }

            setProgress('img2pdf', 95, '正在生成 PDF...');
            const bytes = await pdf.save();
            img2pdfResult = new Blob([bytes], { type: 'application/pdf' });

            setProgress('img2pdf', 100, '完成！');
            setTimeout(() => hideProgress('img2pdf'), 500);

            $('#result-stats-img2pdf').innerHTML = `
        <span class="result-stat">图片数: <strong>${total}</strong></span>
        <span class="result-stat">PDF 大小: <strong>${formatSize(img2pdfResult.size)}</strong></span>
      `;
            showResult('img2pdf');
            showToast(`✅ 已将 ${total} 张图片转为 PDF`);

        } catch (err) {
            console.error(err);
            showToast('❌ 转换失败: ' + err.message);
            hideProgress('img2pdf');
        } finally {
            $('#btn-img2pdf').disabled = false;
        }
    });

    $('#btn-download-img2pdf').addEventListener('click', () => {
        if (img2pdfResult) downloadBlob(img2pdfResult, 'images.pdf');
    });

    // ========== PDF to Image ==========

    let pdf2imgResults = [];

    const fmPdf2img = new FileManager('pdf2img', {
        onUpdate(files) {
            const show = files.length > 0;
            $('#opts-pdf2img').style.display = show ? 'flex' : 'none';
            $('#action-pdf2img').style.display = show ? 'flex' : 'none';
            hideResult('pdf2img');
        }
    });

    $('#btn-pdf2img').addEventListener('click', async () => {
        if (!fmPdf2img.files.length) return;

        try {
            $('#btn-pdf2img').disabled = true;
            const file = fmPdf2img.files[0];
            const format = $('#pdf2img-format').value;
            const scale = parseFloat($('#pdf2img-scale').value);

            setProgress('pdf2img', 0, '正在加载 PDF...');

            const arrayBuf = await readFileAsArrayBuffer(file);
            const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

            const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise;
            const numPages = pdfDoc.numPages;
            pdf2imgResults = [];

            for (let i = 1; i <= numPages; i++) {
                setProgress('pdf2img', (i / numPages) * 90, `正在渲染第 ${i}/${numPages} 页...`);

                const page = await pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;

                const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
                const dataUrl = canvas.toDataURL(mimeType, 0.92);
                const byteStr = atob(dataUrl.split(',')[1]);
                const bytes = new Uint8Array(byteStr.length);
                for (let j = 0; j < byteStr.length; j++) bytes[j] = byteStr.charCodeAt(j);

                const ext = format === 'jpeg' ? 'jpg' : 'png';
                pdf2imgResults.push({
                    blob: new Blob([bytes], { type: mimeType }),
                    name: `${file.name.replace('.pdf', '')}_page_${i}.${ext}`
                });
            }

            setProgress('pdf2img', 100, '完成！');
            setTimeout(() => hideProgress('pdf2img'), 500);

            $('#result-stats-pdf2img').innerHTML = `
        <span class="result-stat">页数: <strong>${numPages}</strong></span>
        <span class="result-stat">格式: <strong>${format.toUpperCase()}</strong></span>
        <span class="result-stat">缩放: <strong>${scale}x</strong></span>
      `;

            const dlContainer = $('#pdf2img-downloads');
            dlContainer.innerHTML = '';

            if (numPages <= 10) {
                pdf2imgResults.forEach(r => {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-secondary';
                    btn.style.margin = '0.25rem';
                    btn.textContent = `📥 ${r.name}`;
                    btn.addEventListener('click', () => downloadBlob(r.blob, r.name));
                    dlContainer.appendChild(btn);
                });
            } else {
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary';
                btn.textContent = `📥 逐个下载全部 ${numPages} 张图片`;
                btn.addEventListener('click', async () => {
                    for (const r of pdf2imgResults) {
                        downloadBlob(r.blob, r.name);
                        await new Promise(res => setTimeout(res, 300));
                    }
                });
                dlContainer.appendChild(btn);
            }

            showResult('pdf2img');
            showToast(`✅ 已将 ${numPages} 页转为 ${format.toUpperCase()} 图片`);

        } catch (err) {
            console.error(err);
            showToast('❌ 转换失败: ' + err.message);
            hideProgress('pdf2img');
        } finally {
            $('#btn-pdf2img').disabled = false;
        }
    });

})();
