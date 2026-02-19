/**
 * ToolBox 图片工具箱 — 纯前端图片处理引擎
 * 格式转换（Canvas API + heic2any）、智能压缩、EXIF 读取/清除
 */
(function () {
    'use strict';

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

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(file);
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
        $(`#progress-${prefix}`).style.display = 'block';
        $(`#progress-fill-${prefix}`).style.width = pct + '%';
        const txt = $(`#progress-text-${prefix}`);
        if (txt) { txt.style.display = 'block'; txt.textContent = text || ''; }
    }

    function hideProgress(prefix) {
        $(`#progress-${prefix}`).style.display = 'none';
        const txt = $(`#progress-text-${prefix}`);
        if (txt) txt.style.display = 'none';
    }

    function getExtension(mime) {
        const map = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/bmp': '.bmp' };
        return map[mime] || '.bin';
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    // ========== Tab System ==========

    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.tab-btn').forEach(b => b.classList.remove('active'));
            $$('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            $(`#panel-${btn.dataset.tab}`).classList.add('active');
        });
    });

    // ========== File Manager (with thumbnails) ==========

    class ImageFileManager {
        constructor(prefix, opts = {}) {
            this.prefix = prefix;
            this.files = [];
            this.multiple = opts.multiple !== false;
            this.onUpdate = opts.onUpdate || (() => { });

            const dropZone = $(`#drop-${prefix}`);
            const fileInput = $(`#file-${prefix}`);

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
            const imgFiles = newFiles.filter(f =>
                f.type.startsWith('image/') ||
                f.name.toLowerCase().endsWith('.heic') ||
                f.name.toLowerCase().endsWith('.heif')
            );
            if (!imgFiles.length) { showToast('不支持此文件格式'); return; }
            if (this.multiple) this.files.push(...imgFiles);
            else this.files = [imgFiles[0]];
            this.renderList();
            this.onUpdate(this.files);
        }

        async renderList() {
            const listEl = $(`#list-${this.prefix}`);
            listEl.innerHTML = '';
            for (let i = 0; i < this.files.length; i++) {
                const f = this.files[i];
                const item = document.createElement('div');
                item.className = 'file-item';

                // Thumbnail
                let thumbSrc = '';
                try {
                    if (f.type.startsWith('image/') && !f.name.toLowerCase().endsWith('.heic')) {
                        thumbSrc = URL.createObjectURL(f);
                    }
                } catch (e) { /* skip */ }

                item.innerHTML = `
          ${thumbSrc ? `<img class="file-thumb" src="${thumbSrc}" alt="">` : '<span style="font-size:1.2rem">🖼️</span>'}
          <span class="file-name" title="${f.name}">${f.name}</span>
          <span class="file-size">${formatSize(f.size)}</span>
          <button class="file-remove" title="移除">✕</button>
        `;
                item.querySelector('.file-remove').addEventListener('click', () => {
                    this.files.splice(i, 1);
                    this.renderList();
                    this.onUpdate(this.files);
                });
                listEl.appendChild(item);
            }
        }
    }

    // ========== Format Conversion ==========

    const fmConvert = new ImageFileManager('convert', {
        onUpdate(files) {
            const show = files.length > 0;
            $('#opts-convert').style.display = show ? 'flex' : 'none';
            $('#action-convert').style.display = show ? 'flex' : 'none';
            $('#result-convert').style.display = 'none';
        }
    });

    // Show/hide quality based on format
    $('#convert-format').addEventListener('change', e => {
        const fmt = e.target.value;
        // PNG and BMP are lossless, no quality option
        $('#quality-group-convert').style.display = (fmt === 'image/png' || fmt === 'image/bmp') ? 'none' : 'flex';
    });

    $('#btn-convert').addEventListener('click', async () => {
        if (!fmConvert.files.length) return;
        const outMime = $('#convert-format').value;
        const quality = parseFloat($('#convert-quality').value);
        const ext = getExtension(outMime);
        const gallery = $('#gallery-convert');
        gallery.innerHTML = '';

        try {
            $('#btn-convert').disabled = true;
            const total = fmConvert.files.length;

            for (let i = 0; i < total; i++) {
                setProgress('convert', (i / total) * 90, `正在转换第 ${i + 1}/${total} 张...`);
                let file = fmConvert.files[i];
                const origName = file.name.replace(/\.[^.]+$/, '');

                // Handle HEIC
                if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
                    try {
                        const blob = await heic2any({ blob: file, toType: 'image/png', quality: 1 });
                        file = new File([blob], origName + '.png', { type: 'image/png' });
                    } catch (e) {
                        showToast(`HEIC 转换失败: ${origName}`);
                        continue;
                    }
                }

                // Load to canvas
                const dataUrl = await readFileAsDataURL(file);
                const img = await loadImage(dataUrl);
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                // Export
                const resultBlob = await new Promise(resolve => {
                    if (outMime === 'image/png' || outMime === 'image/bmp') {
                        canvas.toBlob(resolve, outMime);
                    } else {
                        canvas.toBlob(resolve, outMime, quality);
                    }
                });

                const thumbUrl = URL.createObjectURL(resultBlob);
                const outName = origName + ext;

                const card = document.createElement('div');
                card.className = 'result-item';
                card.innerHTML = `
          <img src="${thumbUrl}" alt="${outName}">
          <div class="info">${outName}<br><strong>${formatSize(resultBlob.size)}</strong></div>
          <button class="dl-btn">📥 下载</button>
        `;
                card.querySelector('.dl-btn').addEventListener('click', () => downloadBlob(resultBlob, outName));
                gallery.appendChild(card);
            }

            setProgress('convert', 100, '完成！');
            setTimeout(() => hideProgress('convert'), 500);
            $('#result-convert').style.display = 'block';
            showToast(`✅ 已转换 ${total} 张图片`);

        } catch (err) {
            console.error(err);
            showToast('❌ 转换失败: ' + err.message);
            hideProgress('convert');
        } finally {
            $('#btn-convert').disabled = false;
        }
    });

    // ========== Image Compression ==========

    const fmCompress = new ImageFileManager('compress', {
        onUpdate(files) {
            const show = files.length > 0;
            $('#opts-compress').style.display = show ? 'flex' : 'none';
            $('#action-compress').style.display = show ? 'flex' : 'none';
            $('#result-compress').style.display = 'none';
        }
    });

    $('#btn-compress').addEventListener('click', async () => {
        if (!fmCompress.files.length) return;
        const quality = parseFloat($('#compress-quality').value);
        const maxW = parseInt($('#compress-maxw').value) || 0;
        const gallery = $('#gallery-compress');
        gallery.innerHTML = '';

        try {
            $('#btn-compress').disabled = true;
            const total = fmCompress.files.length;
            let totalOriginal = 0, totalCompressed = 0;

            for (let i = 0; i < total; i++) {
                setProgress('compress', (i / total) * 90, `正在压缩第 ${i + 1}/${total} 张...`);
                const file = fmCompress.files[i];
                const origName = file.name.replace(/\.[^.]+$/, '');
                totalOriginal += file.size;

                const dataUrl = await readFileAsDataURL(file);
                const img = await loadImage(dataUrl);

                let w = img.naturalWidth, h = img.naturalHeight;
                if (maxW > 0 && w > maxW) {
                    h = Math.round(h * (maxW / w));
                    w = maxW;
                }

                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                // Determine output format: keep original if possible, default to JPEG for best compression
                let outMime = 'image/jpeg';
                if (file.type === 'image/webp') outMime = 'image/webp';
                if (file.type === 'image/png') outMime = 'image/jpeg'; // PNG → JPEG for compression

                const resultBlob = await new Promise(resolve => canvas.toBlob(resolve, outMime, quality));
                totalCompressed += resultBlob.size;

                const ext = outMime === 'image/webp' ? '.webp' : '.jpg';
                const outName = origName + '_compressed' + ext;
                const thumbUrl = URL.createObjectURL(resultBlob);
                const saved = ((1 - resultBlob.size / file.size) * 100).toFixed(0);

                const card = document.createElement('div');
                card.className = 'result-item';
                card.innerHTML = `
          <img src="${thumbUrl}" alt="${outName}">
          <div class="info">${origName}<br>${formatSize(file.size)} → <strong>${formatSize(resultBlob.size)}</strong> <span style="color:#34d399">(-${saved}%)</span></div>
          <button class="dl-btn">📥 下载</button>
        `;
                card.querySelector('.dl-btn').addEventListener('click', () => downloadBlob(resultBlob, outName));
                gallery.appendChild(card);
            }

            setProgress('compress', 100, '完成！');
            setTimeout(() => hideProgress('compress'), 500);
            $('#result-compress').style.display = 'block';
            const totalSaved = ((1 - totalCompressed / totalOriginal) * 100).toFixed(0);
            showToast(`✅ 已压缩 ${total} 张图片，总共节省 ${totalSaved}%`);

        } catch (err) {
            console.error(err);
            showToast('❌ 压缩失败: ' + err.message);
            hideProgress('compress');
        } finally {
            $('#btn-compress').disabled = false;
        }
    });

    // ========== EXIF Read / Clear ==========

    // Lightweight EXIF parser (JPEG only, reads key tags)
    function parseExif(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        const tags = {};

        if (view.getUint16(0) !== 0xFFD8) return tags; // Not JPEG

        let offset = 2;
        while (offset < view.byteLength) {
            if (view.getUint8(offset) !== 0xFF) break;
            const marker = view.getUint16(offset);
            if (marker === 0xFFE1) { // APP1 (EXIF)
                const length = view.getUint16(offset + 2);
                // Check for "Exif\0\0"
                if (
                    view.getUint8(offset + 4) === 0x45 && view.getUint8(offset + 5) === 0x78 &&
                    view.getUint8(offset + 6) === 0x69 && view.getUint8(offset + 7) === 0x66
                ) {
                    const tiffOffset = offset + 10;
                    const littleEndian = view.getUint16(tiffOffset) === 0x4949;

                    // Read IFD0
                    const ifdOffset = tiffOffset + view.getUint32(tiffOffset + 4, littleEndian);
                    const numEntries = view.getUint16(ifdOffset, littleEndian);

                    const tagNames = {
                        0x010F: '相机制造商', 0x0110: '相机型号', 0x0112: '方向',
                        0x011A: '水平分辨率', 0x011B: '垂直分辨率',
                        0x0131: '软件', 0x0132: '修改日期',
                        0x8769: 'ExifIFD', 0x8825: 'GPS IFD',
                        0xA002: '图片宽度', 0xA003: '图片高度',
                    };

                    for (let i = 0; i < numEntries && i < 50; i++) {
                        try {
                            const entryOffset = ifdOffset + 2 + i * 12;
                            const tag = view.getUint16(entryOffset, littleEndian);
                            const type = view.getUint16(entryOffset + 2, littleEndian);
                            const count = view.getUint32(entryOffset + 4, littleEndian);

                            if (tagNames[tag]) {
                                let value = '';
                                if (tag === 0x8825) {
                                    value = '⚠️ 包含 GPS 定位数据';
                                    tags['_hasGPS'] = true;
                                } else if (type === 2) { // ASCII
                                    const strLen = count;
                                    let strOffset = entryOffset + 8;
                                    if (strLen > 4) strOffset = tiffOffset + view.getUint32(entryOffset + 8, littleEndian);
                                    const chars = [];
                                    for (let j = 0; j < strLen - 1 && j < 100; j++) {
                                        chars.push(String.fromCharCode(view.getUint8(strOffset + j)));
                                    }
                                    value = chars.join('');
                                } else if (type === 3) { // SHORT
                                    value = view.getUint16(entryOffset + 8, littleEndian).toString();
                                } else if (type === 4) { // LONG
                                    value = view.getUint32(entryOffset + 8, littleEndian).toString();
                                } else {
                                    value = `[数据类型 ${type}]`;
                                }
                                if (value) tags[tagNames[tag]] = value;
                            }
                        } catch (e) { /* skip unreadable entry */ }
                    }
                }
                break;
            }
            // Skip to next marker
            const segLen = view.getUint16(offset + 2);
            offset += 2 + segLen;
        }

        return tags;
    }

    // Strip all EXIF by re-drawing through canvas
    async function stripExif(file) {
        const dataUrl = await readFileAsDataURL(file);
        const img = await loadImage(dataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Re-export as JPEG or PNG (without EXIF)
        const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        return new Promise(resolve => canvas.toBlob(resolve, outMime, 0.95));
    }

    const fmExif = new ImageFileManager('exif', {
        multiple: false,
        onUpdate: async function (files) {
            if (!files.length) {
                $('#exif-display').style.display = 'none';
                $('#action-exif').style.display = 'none';
                $('#result-exif').style.display = 'none';
                return;
            }

            try {
                const file = files[0];
                const buf = await readFileAsArrayBuffer(file);
                const tags = parseExif(buf);

                const displayEl = $('#exif-display');
                displayEl.style.display = 'block';
                $('#action-exif').style.display = 'flex';

                if (Object.keys(tags).length === 0) {
                    displayEl.innerHTML = `
            <div style="padding:1rem;background:rgba(16,185,129,0.08);border-radius:var(--radius-md);border:1px solid rgba(16,185,129,0.25);">
              <strong style="color:#34d399">✅ 此图片没有 EXIF 数据</strong>
              <p style="color:var(--text-secondary);font-size:0.85rem;margin-top:0.3rem">或者不是 JPEG 格式（PNG/WebP 通常不含 EXIF）。</p>
            </div>
          `;
                    return;
                }

                let rows = '';
                for (const [key, val] of Object.entries(tags)) {
                    if (key.startsWith('_')) continue;
                    const isSensitive = key === 'GPS IFD' || key.includes('GPS') || val.includes('GPS');
                    rows += `<tr><td>${key}</td><td class="${isSensitive ? 'sensitive' : ''}">${val}</td></tr>`;
                }

                displayEl.innerHTML = `
          <div style="padding:1rem;background:var(--bg-card);border-radius:var(--radius-md);border:1px solid ${tags._hasGPS ? 'rgba(248,113,113,0.4)' : 'var(--border-subtle)'};">
            ${tags._hasGPS ? '<p style="color:#f87171;font-weight:600;margin-bottom:0.5rem">⚠️ 此图片包含 GPS 定位数据！建议清除后再分享。</p>' : ''}
            <table class="exif-table">
              <thead><tr><th>属性</th><th>值</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
            } catch (err) {
                console.error(err);
                $('#exif-display').innerHTML = '<p style="color:var(--text-muted)">无法读取 EXIF 数据。</p>';
                $('#exif-display').style.display = 'block';
            }
        }
    });

    $('#btn-exif').addEventListener('click', async () => {
        if (!fmExif.files.length) return;

        try {
            $('#btn-exif').disabled = true;
            setProgress('exif', 30, '正在清除 EXIF 数据...');

            const total = fmExif.files.length;
            const gallery = $('#gallery-exif');
            gallery.innerHTML = '';

            for (let i = 0; i < total; i++) {
                setProgress('exif', (i / total) * 80, `正在处理...`);
                const file = fmExif.files[i];
                const cleanBlob = await stripExif(file);
                const origName = file.name.replace(/\.[^.]+$/, '');
                const ext = file.type === 'image/png' ? '.png' : '.jpg';
                const outName = origName + '_clean' + ext;
                const thumbUrl = URL.createObjectURL(cleanBlob);

                const card = document.createElement('div');
                card.className = 'result-item';
                card.innerHTML = `
          <img src="${thumbUrl}" alt="${outName}">
          <div class="info">${outName}<br><strong>${formatSize(cleanBlob.size)}</strong></div>
          <button class="dl-btn">📥 下载（已清除 EXIF）</button>
        `;
                card.querySelector('.dl-btn').addEventListener('click', () => downloadBlob(cleanBlob, outName));
                gallery.appendChild(card);
            }

            setProgress('exif', 100, '完成！');
            setTimeout(() => hideProgress('exif'), 500);
            $('#result-exif').style.display = 'block';
            showToast('✅ EXIF 数据已清除');

        } catch (err) {
            console.error(err);
            showToast('❌ 处理失败: ' + err.message);
            hideProgress('exif');
        } finally {
            $('#btn-exif').disabled = false;
        }
    });

})();
