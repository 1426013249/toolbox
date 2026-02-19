/* ============================================
   CodeShot — Canvas Rendering Engine
   ============================================ */

(function () {
  'use strict';

  // ---- Gradient Presets ----
  const GRADIENTS = [
    { name: '星空紫', colors: ['#6366f1', '#8b5cf6', '#a855f7'] },
    { name: '日落橙', colors: ['#f97316', '#ef4444', '#ec4899'] },
    { name: '极光绿', colors: ['#10b981', '#06b6d4', '#3b82f6'] },
    { name: '深海蓝', colors: ['#1e3a5f', '#3b82f6', '#6366f1'] },
    { name: '玫瑰金', colors: ['#f43f5e', '#e879f9', '#fbbf24'] },
    { name: '薄荷', colors: ['#34d399', '#a3e635', '#fbbf24'] },
    { name: '暗夜', colors: ['#1e1e2e', '#313244', '#45475a'] },
    { name: '彩虹', colors: ['#f43f5e', '#fbbf24', '#10b981', '#3b82f6'] },
    { name: '火山', colors: ['#dc2626', '#f97316', '#facc15'] },
    { name: '冰川', colors: ['#e0f2fe', '#7dd3fc', '#0ea5e9'] },
    { name: '午夜', colors: ['#0f172a', '#1e293b', '#334155'] },
    { name: '糖果', colors: ['#c084fc', '#f472b6', '#fb923c'] },
  ];

  // ---- Light theme colors ----
  const LIGHT_THEME = {
    bg: '#ffffff',
    text: '#1e293b',
    comment: '#6b7280',
    keyword: '#7c3aed',
    string: '#059669',
    number: '#d97706',
    function: '#2563eb',
    operator: '#d946ef',
    lineNum: '#94a3b8',
    titleBg: '#f1f5f9',
    titleText: '#475569',
    titleDots: ['#ef4444', '#fbbf24', '#22c55e'],
  };

  const DARK_THEME = {
    bg: '#1e1e2e',
    text: '#cdd6f4',
    comment: '#6c7086',
    keyword: '#cba6f7',
    string: '#a6e3a1',
    number: '#fab387',
    function: '#89b4fa',
    operator: '#f5c2e7',
    lineNum: '#585b70',
    titleBg: '#181825',
    titleText: '#6c7086',
    titleDots: ['#f38ba8', '#fab387', '#a6e3a1'],
  };

  // ---- DOM Elements ----
  const canvas = document.getElementById('preview-canvas');
  const ctx = canvas.getContext('2d');
  const codeInput = document.getElementById('code-input');
  const langSelect = document.getElementById('lang-select');
  const themeSelect = document.getElementById('theme-select');
  const fontSizeSelect = document.getElementById('font-size');
  const paddingRange = document.getElementById('padding-range');
  const toggleMac = document.getElementById('toggle-mac');
  const toggleLines = document.getElementById('toggle-lines');
  const toggleWatermark = document.getElementById('toggle-watermark');
  const toggleShadow = document.getElementById('toggle-shadow');
  const btnDownload = document.getElementById('btn-download');
  const btnCopy = document.getElementById('btn-copy');
  const gradientPicker = document.getElementById('gradient-picker');
  const toastEl = document.getElementById('toast');

  let selectedGradient = 0;
  let dpr = window.devicePixelRatio || 2;

  // ---- Init Gradient Picker ----
  function initGradientPicker() {
    GRADIENTS.forEach((g, i) => {
      const swatch = document.createElement('div');
      swatch.className = 'gradient-swatch' + (i === 0 ? ' active' : '');
      swatch.style.background = `linear-gradient(135deg, ${g.colors.join(', ')})`;
      swatch.title = g.name;
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.gradient-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        selectedGradient = i;
        render();
      });
      gradientPicker.appendChild(swatch);
    });
  }

  // ---- Simple Tokenizer (for Canvas rendering) ----
  function tokenize(code, lang) {
    // Use Prism to tokenize, then flatten to simple {type, content} pairs
    const grammar = Prism.languages[lang] || Prism.languages.javascript;
    const tokens = Prism.tokenize(code, grammar);
    const result = [];

    function flatten(token) {
      if (typeof token === 'string') {
        result.push({ type: 'plain', content: token });
      } else if (token.content && typeof token.content === 'string') {
        result.push({ type: token.type, content: token.content });
      } else if (Array.isArray(token.content)) {
        token.content.forEach(flatten);
      } else if (typeof token === 'object' && token.content) {
        flatten(token.content);
      }
    }

    tokens.forEach(flatten);
    return result;
  }

  function getTokenColor(type, theme) {
    const t = theme === 'dark' ? DARK_THEME : LIGHT_THEME;
    const map = {
      'keyword': t.keyword,
      'builtin': t.keyword,
      'boolean': t.keyword,
      'string': t.string,
      'template-string': t.string,
      'number': t.number,
      'function': t.function,
      'class-name': t.function,
      'comment': t.comment,
      'operator': t.operator,
      'punctuation': t.text,
      'plain': t.text,
    };
    return map[type] || t.text;
  }

  // ---- Core Render ----
  function render() {
    const code = codeInput.value || '// 在这里粘贴代码';
    const lang = langSelect.value;
    const theme = themeSelect.value;
    const fontSize = parseInt(fontSizeSelect.value);
    const padding = parseInt(paddingRange.value);
    const showMac = toggleMac.checked;
    const showLines = toggleLines.checked;
    const showWatermark = toggleWatermark.checked;
    const showShadow = toggleShadow.checked;
    const t = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

    const lines = code.split('\n');
    const lineHeight = fontSize * 1.65;
    const fontFamily = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

    // Measure
    ctx.font = `${fontSize}px ${fontFamily}`;
    const lineNumWidth = showLines ? ctx.measureText(String(lines.length).padStart(3, ' ')).width + 20 : 0;

    let maxLineWidth = 0;
    lines.forEach(line => {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    });

    const macBarHeight = showMac ? 36 : 0;
    const codeBlockW = lineNumWidth + maxLineWidth + padding * 2 + 40;
    const codeBlockH = lines.length * lineHeight + padding * 2 + macBarHeight + 10;

    const outerPad = padding;
    const totalW = codeBlockW + outerPad * 2;
    const totalH = codeBlockH + outerPad * 2 + (showWatermark ? 28 : 0);

    // Set canvas size (HiDPI)
    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width = totalW + 'px';
    canvas.style.height = totalH + 'px';
    ctx.scale(dpr, dpr);

    // ---- Draw Background Gradient ----
    const grad = ctx.createLinearGradient(0, 0, totalW, totalH);
    const colors = GRADIENTS[selectedGradient].colors;
    colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = grad;
    roundRect(ctx, 0, 0, totalW, totalH, 16);
    ctx.fill();

    // ---- Draw Code Window ----
    const wx = outerPad;
    const wy = outerPad;
    const ww = codeBlockW;
    const wh = codeBlockH;

    // Shadow
    if (showShadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = t.bg;
      roundRect(ctx, wx, wy, ww, wh, 12);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = t.bg;
      roundRect(ctx, wx, wy, ww, wh, 12);
      ctx.fill();
    }

    // ---- Mac Title Bar ----
    let codeStartY = wy + padding;
    if (showMac) {
      // Title bar bg
      ctx.fillStyle = t.titleBg;
      roundRectTop(ctx, wx, wy, ww, macBarHeight, 12);
      ctx.fill();

      // Traffic lights
      const dotY = wy + macBarHeight / 2;
      const dotStart = wx + 16;
      t.titleDots.forEach((color, i) => {
        ctx.beginPath();
        ctx.arc(dotStart + i * 20, dotY, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });

      // Title text
      ctx.fillStyle = t.titleText;
      ctx.font = `500 11px 'Inter', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('codeshot.js', wx + ww / 2, dotY + 4);
      ctx.textAlign = 'left';

      // Divider
      ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wx, wy + macBarHeight);
      ctx.lineTo(wx + ww, wy + macBarHeight);
      ctx.stroke();

      codeStartY = wy + macBarHeight + padding / 2;
    }

    // ---- Render Code Lines ----
    ctx.font = `${fontSize}px ${fontFamily}`;
    const tokens = tokenize(code, lang);

    let curX = wx + padding + lineNumWidth;
    let curY = codeStartY + fontSize;
    let lineIdx = 0;

    // Draw line numbers first
    if (showLines) {
      ctx.fillStyle = t.lineNum;
      for (let i = 0; i < lines.length; i++) {
        const num = String(i + 1).padStart(String(lines.length).length, ' ');
        ctx.fillText(num, wx + padding, codeStartY + fontSize + i * lineHeight);
      }
    }

    // Draw tokens
    curX = wx + padding + lineNumWidth;
    curY = codeStartY + fontSize;

    tokens.forEach(tok => {
      const parts = tok.content.split('\n');
      parts.forEach((part, pi) => {
        if (pi > 0) {
          // New line
          lineIdx++;
          curX = wx + padding + lineNumWidth;
          curY = codeStartY + fontSize + lineIdx * lineHeight;
        }
        if (part.length > 0) {
          ctx.fillStyle = getTokenColor(tok.type, theme);
          ctx.fillText(part, curX, curY);
          curX += ctx.measureText(part).width;
        }
      });
    });

    // ---- Watermark ----
    if (showWatermark) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `500 10px 'Inter', sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText('toolbox — codeshot', totalW - outerPad, totalH - 10);
      ctx.textAlign = 'left';
    }

    // Reset scale for next render
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- Canvas Helpers ----
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function roundRectTop(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ---- Export Functions ----
  function downloadPNG() {
    const link = document.createElement('a');
    link.download = `codeshot-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('✅ 已下载 PNG');
  }

  async function copyToClipboard() {
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      showToast('✅ 已复制到剪贴板');
    } catch (err) {
      // Fallback: download
      showToast('⚠️ 无法复制，已触发下载');
      downloadPNG();
    }
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2000);
  }

  // ---- Wait for fonts to load, then render ----
  function init() {
    initGradientPicker();

    // Bind events
    codeInput.addEventListener('input', debounce(render, 150));
    langSelect.addEventListener('change', render);
    themeSelect.addEventListener('change', render);
    fontSizeSelect.addEventListener('change', render);
    paddingRange.addEventListener('input', render);
    toggleMac.addEventListener('change', render);
    toggleLines.addEventListener('change', render);
    toggleWatermark.addEventListener('change', render);
    toggleShadow.addEventListener('change', render);
    btnDownload.addEventListener('click', downloadPNG);
    btnCopy.addEventListener('click', copyToClipboard);

    // Tab key in textarea
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeInput.selectionStart;
        const end = codeInput.selectionEnd;
        codeInput.value = codeInput.value.substring(0, start) + '  ' + codeInput.value.substring(end);
        codeInput.selectionStart = codeInput.selectionEnd = start + 2;
        render();
      }
    });

    // Initial render after fonts
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        setTimeout(render, 100);
      });
    } else {
      setTimeout(render, 500);
    }
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
