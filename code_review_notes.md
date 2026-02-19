# ToolBox 审阅笔记 (2026-02-19)

## 一、 身份证防盗水印工具 (`src/tools/id-watermark/index.html`)

### 1. UX 交互改进
*   **多行文本支持**：目前水印仅支持单行。身份证水印常需包含“用途+日期+姓名”，建议改为 `textarea` 或支持 `
`。
*   **性能瓶颈 (Critical)**：当前的 `renderWatermark` 在高分辨率（如 4K 拍摄的身份证）下，使用双重 `for` 循环调用 `fillText` 会导致 UI 严重卡顿。
    *   **优化方案**：使用 `CanvasPattern`。先在离屏 Canvas 绘制一个水印单元，然后用 `createPattern` 一次性填充整个画布。性能提升约 10-20 倍。
*   **实时反馈优化**：滑动 Slider 时，可以增加一个“节流(Throttle)”或“防抖(Debounce)”处理，或者仅在滑动结束时渲染高清图，滑动中渲染低清预览。
*   **导出格式**：目前强制 `image/png`。对于手机拍摄的身份证照片（通常 3MB+ JPG），转为 PNG 可能会膨胀到 10MB+。建议增加“质量”选项或默认跟随原图格式。

### 2. 代码质量与 Bug
*   **字体兼容性**：`ctx.font` 中硬编码了字体名。在 Linux 或旧版 Android 上可能失效。建议优先使用系统默认黑体：`system-ui, -apple-system, sans-serif`。
*   **魔数问题**：`const scale = Math.max(w, h) / 800;` 这个比例系数对于不同尺寸的照片可能不够线性。
*   **可访问性**：Slider 缺少 `aria-label`。

### 3. 建议代码实现 (Canvas 性能优化)
```javascript
// 优化后的渲染逻辑：使用 Pattern
function renderWatermark() {
    if (!originalImage) return;
    const w = originalImage.naturalWidth;
    const h = originalImage.naturalHeight;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(originalImage, 0, 0, w, h);

    const text = watermarkText.value || '仅供办理XX业务使用';
    const angle = parseInt(angleSlider.value);
    const opacity = parseInt(opacitySlider.value) / 100;
    const fontSize = parseInt(fontSizeSlider.value);
    const spacing = parseInt(spacingSlider.value);
    const scale = Math.max(w, h) / 1000; // 调整基准

    const scaledFS = Math.round(fontSize * scale);
    const scaledGap = Math.round(spacing * scale);

    // 1. 创建离屏画布绘制单个水印单元
    const offscreen = document.createElement('canvas');
    const octx = offscreen.getContext('2d');
    octx.font = `bold ${scaledFS}px system-ui, -apple-system, sans-serif`;
    const metrics = octx.measureText(text);
    const textW = metrics.width;
    const textH = scaledFS;

    // 单元尺寸计算（考虑间距）
    offscreen.width = textW + scaledGap;
    offscreen.height = textH + scaledGap;

    octx.font = `bold ${scaledFS}px system-ui, -apple-system, sans-serif`;
    octx.fillStyle = currentColor.replace('OPACITY', opacity.toFixed(2));
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    
    // 在单元中心绘制
    octx.translate(offscreen.width/2, offscreen.height/2);
    octx.rotate(angle * Math.PI / 180);
    octx.fillText(text, 0, 0);

    // 2. 使用 Pattern 填充主画布
    const pattern = ctx.createPattern(offscreen, 'repeat');
    ctx.save();
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
}
```

---

## 二、 首页集成建议 (`index.html`)

### 1. 结构优化
*   目前的工具分类清晰，`id-watermark` 应归入 **"🔐 隐私安全"**。
*   **卡片视觉**：建议使用专属颜色（如 Teal/Cyan）区别于普通的红色脱敏工具。

### 2. 首页卡片代码
```html
<a href="src/tools/id-watermark/index.html" class="card tool-card">
    <div class="tool-icon" style="background:rgba(20,184,166,0.12)">🪪</div>
    <div>
        <h3>身份证防盗水印 <span class="tool-badge new">NEW</span></h3>
        <p>为身份证照片添加“仅供某某业务使用”全覆盖水印，防止被非法冒用。100% 本地处理。</p>
    </div>
</a>
```

### 3. SEO 优化建议
*   **Title 增强**：`ToolBox — 免费在线工具合集 | PDF处理、图片转换、身份证水印、隐私脱敏`。
*   **Keywords 补充**：`身份证防盗, 身份证加水印, 隐私保护工具, 数据本地处理`。
*   **JSON-LD 更新**：在 `featureList` 中加入 `"ID Card Watermark"`。

---

## 三、 移动端适配建议
*   **点击区域**：`preset-chip` 在手机上略小，建议增加 `padding: 0.5rem 1rem`。
*   **预览交互**：在移动端，Canvas 可能会超出屏幕宽度。建议在 `.preview-area` 增加 `touch-action: pinch-zoom`（如果未来支持缩放）或确保 `max-width: 100vw`。
