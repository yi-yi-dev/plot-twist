import * as d3 from "d3";
import { customTickFormat } from "./plotsUtils/tickFormat.js";

export const barPlot = {
    plotName: "Bar Plot",
    fields: [
        {
            isRequired: true,
            fieldName: "bin-variable",
            fieldType: "categorical",
        },
    ],
    options: [],
    height: 1,
    width: 1,
    createPlotFunction: createBarPlot,
};

// Canvas-based refactor of the original SVG/D3 bar plot with transparent background.
// Preserves: pinned Y axis, scrollable right pane, legend overlay, click selection (single / multi via ctrl/cmd), tooltip, dataset hiding.
// Rendering is done on <canvas> (faster for many categories). d3 scales/utilities still used for math.

export function createBarPlot(fields, options, plotDiv, data, updatePlotsFun, utils) {
    const field = fields.get("bin-variable");
    const container = d3.select(plotDiv).style("position", "relative");
    const containerWidth = container.node().clientWidth;
    const height = container.node().clientHeight;

    // layout
    const marginTop = 10;
    const marginRight = 20;
    const marginBottom = 40; // leave extra for rotated labels
    const marginLeft = 60; // space reserved for pinned y-axis

    const innerPadding = 2;
    const fallbackColor = d3.scaleOrdinal(d3.schemeCategory10);
    const minBinWidth = 40; // minimal width per category

    const uid = `barplot-${Math.random().toString(36).slice(2,9)}`;
    container.attr("data-barplot-id", uid);

    const style = `
        [data-barplot-id="${uid}"] .bp-scroll { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
        [data-barplot-id="${uid}"] .bp-scroll::-webkit-scrollbar { height: 10px; }
        [data-barplot-id="${uid}"] .bp-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 6px; }
        [data-barplot-id="${uid}"] .bp-scroll::-webkit-scrollbar-button { display: none; height: 0; }
        [data-barplot-id="${uid}"] .bp-scroll { scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.2) transparent; }
        [data-barplot-id="${uid}"] .bp-left { position: absolute; left: 0; top: 0; bottom: 0; width: ${marginLeft}px; pointer-events: none; }
        [data-barplot-id="${uid}"] .bp-right { position: absolute; left: ${marginLeft}px; top: 0; right: 0; bottom: 0; }
        [data-barplot-id="${uid}"] .bp-title { position: absolute; right: ${marginRight}px; top: ${marginTop}px; pointer-events: none; font-family: sans-serif; font-weight: 700; font-size: 12px; }
        [data-barplot-id="${uid}"] .x-label { cursor: default; pointer-events: auto; }
        [data-barplot-id="${uid}"] .legend-overlay { pointer-events: auto; display: flex; gap: 6px; align-items: center; }
        [data-barplot-id="${uid}"] .legend-item { display:flex; align-items:center; cursor:pointer; height:18px; }
        [data-barplot-id="${uid}"] .legend-swatch { width:16px; height:16px; border-radius:7px; border:1px solid #ccc; }
    `;
    container.append("style").text(style);

    // Tooltip (placed inside container)
    const tooltip = d3.select("body")
        .append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("pointer-events", "none")
        .style("color", "#333")
        .style("background", "rgba(250, 250, 250, 0.95)")
        .style("padding", "6px 12px")
        .style("border-radius", "8px")
        .style("box-shadow", "0 2px 8px rgba(0,0,0,0.15)")
        .style("font-size", "13px")
        .style("z-index", 10000)
        .style("opacity", 0)
        .style("transform", "translateY(5px)")
        .style("transition", "opacity 0.15s ease, transform 0.15s ease")
        .style("display", "none");

    // categories
    const categories = Array.from(new Set(data.map(d => d[field])));

    // compute widths
    const minTotalWidth = categories.length * minBinWidth;
    const rightPaneWidth = Math.max(containerWidth - marginLeft, minTotalWidth);
    let canvasRightWidth = rightPaneWidth;
    const canvasHeight = height;

    // create left (pinned y-axis) and right (scrollable plot) panes
    const leftDiv = container.append("div").attr("class", "bp-left");
    const rightDiv = container.append("div").attr("class", "bp-right bp-scroll");

    // pinned title (top-right, pinned not scrolling)
    container.append("div").attr("class", "bp-title").text(field);

    // left canvas (y-axis)
    const leftCanvasNode = leftDiv.append("canvas").node();
    leftCanvasNode.style.background = 'transparent';
    leftCanvasNode.style.display = 'block';
    leftCanvasNode.style.pointerEvents = 'none';
    const leftCtx = leftCanvasNode.getContext('2d');

    // right canvas (bars + x-axis + grid)
    const rightCanvasNode = rightDiv.append("canvas").node();
    rightCanvasNode.style.background = 'transparent';
    rightCanvasNode.style.display = 'block';
    const rightCtx = rightCanvasNode.getContext('2d');

    // high DPI handling
    function setCanvasSize(node, ctx, w, h) {
        const ratio = window.devicePixelRatio || 1;
        node.width = Math.max(1, Math.floor(w * ratio));
        node.height = Math.max(1, Math.floor(h * ratio));
        node.style.width = w + 'px';
        node.style.height = h + 'px';
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    setCanvasSize(leftCanvasNode, leftCtx, marginLeft, canvasHeight);
    setCanvasSize(rightCanvasNode, rightCtx, canvasRightWidth, canvasHeight);

    // background click capture on rightCanvas - will clear selection when clicking empty area
    rightCanvasNode.addEventListener('click', (ev) => handleCanvasClick(ev));
    rightCanvasNode.addEventListener('mousemove', (ev) => handleCanvasMouseMove(ev));
    rightCanvasNode.addEventListener('mouseleave', () => {
        tooltip.style('opacity', 0).style('display', 'none');
    });

    // Scales
    let x = d3.scaleBand()
        .domain(categories)
        .range([0, canvasRightWidth - marginRight])
        .padding(0.1);

    let y = d3.scaleLinear().range([canvasHeight - marginBottom, marginTop]);

    // state
    let hiddenDatasets = new Set();
    let selectedCategories = [];

    // hit-test maps
    let categoryRects = []; // [{x,y,width,height,category,index}]
    let barRects = []; // [{x,y,width,height,category,dsName,count,idx}]

    function handleMultiClick(clickedCategory) {
        const idx = selectedCategories.indexOf(clickedCategory);
        if (idx > -1) selectedCategories.splice(idx, 1);
        else selectedCategories.push(clickedCategory);
        updateSelection();
    }
    function handleSingleClick(clickedCategory) {
        selectedCategories = [clickedCategory];
        updateSelection();
    }
    function handleBackgroundClick() {
        selectedCategories = [];
        updateSelection();
    }

    function updateSelection() {
        let payload = [];
        if (selectedCategories.length) payload = [{ categories: selectedCategories, field, type: 'categorical' }];
        updatePlotsFun(payload);
        // re-render visual emphasis on labels/bars
        renderAll();
    }

    // canvas mouse handlers — perform hit testing
    function getEventOffset(ev, canvas) {
        const rect = canvas.getBoundingClientRect();
        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }

    function handleCanvasClick(ev) {
        const { x: mx, y: my } = getEventOffset(ev, rightCanvasNode);
        // check barRects first
        const hitBar = barRects.find(r => mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height);
        if (hitBar) {
            const clickedCategory = hitBar.category;
            if (ev.ctrlKey || ev.metaKey) handleMultiClick(clickedCategory);
            else handleSingleClick(clickedCategory);
            return;
        }
        // check category bg rects
        const hitCat = categoryRects.find(r => mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height);
        if (hitCat) {
            const clickedCategory = hitCat.category;
            if (ev.ctrlKey || ev.metaKey) handleMultiClick(clickedCategory);
            else handleSingleClick(clickedCategory);
            return;
        }
        handleBackgroundClick();
    }

    function handleCanvasMouseMove(ev) {
        const { x: mx, y: my } = getEventOffset(ev, rightCanvasNode);
        // prefer bar hover
        const hitBar = barRects.find(r => mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height);
        if (hitBar) {
            tooltip.html(`<strong>${hitBar.dsName}</strong><br/>count: ${hitBar.count}<br/>category: ${hitBar.category}`)
                .style('left', (ev.pageX + 8) + 'px')
                .style('top', (ev.pageY + 8) + 'px')
                .style('display', 'block')
                .style('opacity', 1);
            return;
        }
        const hitCat = categoryRects.find(r => mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height);
        if (hitCat) {
            // hover total
            tooltip.html(`<strong>${hitCat.category}</strong><br/>total: ${hitCat.total || 0}`)
                .style('left', (ev.pageX + 8) + 'px')
                .style('top', (ev.pageY + 8) + 'px')
                .style('display', 'block')
                .style('opacity', 1);
            return;
        }
        tooltip.style('opacity', 0).style('display', 'none');
    }

    // computeCounts reused
    function computeCounts() {
        const u = utils();
        const origin = typeof u.dataSet === 'function' ? u.dataSet() : (u.dataSet || '');
        const allDataSets = typeof u.allDataSets === 'function' ? (u.allDataSets() || []) : (u.allDataSets || []);
        const colors = u.colorsPerDataSet || u.colors || {};

        const countsPerCat = categories.map(() => ({ total: 0, datasets: {} }));
        countsPerCat.forEach(c => { allDataSets.forEach(ds => c.datasets[ds] = 0); });

        data.forEach((d, i) => {
            const cat = d[field];
            const ci = categories.indexOf(cat);
            if (ci < 0) return;
            const c = countsPerCat[ci];
            c.total += 1;
            const isSel = typeof u.isRowSelected === 'function' ? !!u.isRowSelected(i) : !!u.isRowSelected;
            if (isSel && origin) {
                if (!(origin in c.datasets)) c.datasets[origin] = 0;
                c.datasets[origin] += 1;
            }
            let others = [];
            if (typeof u.dataSetsOf === 'function') {
                const res = u.dataSetsOf(i);
                if (Array.isArray(res)) others = res;
            }
            const uniqueOthers = Array.from(new Set(others || []));
            uniqueOthers.forEach(ds => {
                if (!(ds in c.datasets)) c.datasets[ds] = 0;
                if (ds === origin && isSel) return; // dedupe
                c.datasets[ds] += 1;
            });
        });

        return { countsPerCat, allDataSets, colors };
    }

    // draw helpers
    function clearContext(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
    }

    function drawLeftAxis(yScale, yMax) {
        const ctx = leftCtx;
        const w = marginLeft;
        const h = canvasHeight;
        clearContext(ctx, w, h);
        // transparent background intentionally left (no fill)

        ctx.fillStyle = '#333';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '12px sans-serif';

        const ticks = yScale.ticks ? yScale.ticks(7) : d3.range(0, yMax + 1, Math.ceil(yMax / 7));
        ticks.forEach(t => {
            const yPos = yScale(t);
            // tick line small
            ctx.strokeStyle = '#666';
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(w - 6, yPos);
            ctx.lineTo(w - 2, yPos);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillText(customTickFormat(t), w - 8, yPos);
        });
    }

    function drawGridAndBars(countsPerCat, allDataSets, colors) {
        const ctx = rightCtx;
        const w = canvasRightWidth;
        const h = canvasHeight;
        clearContext(ctx, w, h);
        // transparent background — no fillRect

        // y grid lines
        const yTicks = y.ticks ? y.ticks(7) : d3.range(0, (y.domain()[1] || 1) + 1, Math.ceil(y.domain()[1] / 7));
        ctx.strokeStyle = '#999';
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 0.5;
        yTicks.forEach(t => {
            const yPos = y(t);
            ctx.beginPath();
            ctx.moveTo(0, yPos);
            ctx.lineTo(w - marginRight, yPos);
            ctx.stroke();
        });
        ctx.globalAlpha = 1;

        // prepare category rectangles and dataset bars for hit-testing
        categoryRects = [];
        barRects = [];

        const catWidth = Math.max(1, x.bandwidth());
        const N = Math.max(1, allDataSets.length);
        const innerW = Math.max(0, (catWidth - (N - 1) * innerPadding) / N);

        categories.forEach((cat, ci) => {
            const cx = x(cat) || 0;
            // background grey rect (total)
            const total = countsPerCat[ci].total || 0;
            const rectY = y(total);
            const rectH = (canvasHeight - marginBottom) - rectY;
            ctx.fillStyle = '#e6e6e6';
            ctx.fillRect(cx, rectY, catWidth, rectH);

            categoryRects.push({ x: cx, y: rectY, width: catWidth, height: rectH, category: cat, total });

            // dataset bars
            allDataSets.forEach((ds, idx) => {
                const count = countsPerCat[ci].datasets[ds] || 0;
                const bx = cx + idx * (innerW + innerPadding);
                const by = y(count);
                const bh = (canvasHeight - marginBottom) - by;
                const color = colors[ds] || fallbackColor(ds);
                ctx.fillStyle = hiddenDatasets.has(ds) ? 'rgba(0,0,0,0)' : color;
                ctx.globalAlpha = hiddenDatasets.has(ds) ? 0 : 1;
                ctx.fillRect(bx, by, innerW, bh);
                ctx.globalAlpha = 1;
                barRects.push({ x: bx, y: by, width: innerW, height: bh, category: cat, dsName: ds, count, idx });
            });

            // highlight selection border if selected
            if (selectedCategories.includes(cat)) {
                ctx.strokeStyle = '#222';
                ctx.lineWidth = 2;
                ctx.strokeRect(cx + 1, rectY + 1, catWidth - 2, Math.max(1, rectH - 2));
            }
        });

        // draw x-axis line
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvasHeight - marginBottom);
        ctx.lineTo(Math.max(0, canvasRightWidth - marginRight), canvasHeight - marginBottom);
        ctx.stroke();

        // draw x-axis labels (rotated like original, with truncation)
        drawXAxisLabels(ctx, categories, x.bandwidth());
    }

    function drawXAxisLabels(ctx, cats, bandwidth) {
        ctx.save();
        ctx.translate(0, canvasHeight - marginBottom + 6);
        ctx.fillStyle = '#111';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        // rotate each label by 45deg about its x position
        const maxW = Math.max(8, bandwidth);
        cats.forEach(cat => {
            const cx = x(cat) + 4; // small offset
            const full = String(cat);
            // measure and possibly truncate
            ctx.font = '12px sans-serif';
            let text = full;
            let measure = ctx.measureText(text).width;
            const minFs = 8;
            // if too wide, reduce font size (simple approach: reduce to 10 then 9 then 8)
            let fontSize = 12;
            while (fontSize > minFs && measure > maxW) {
                fontSize -= 1;
                ctx.font = `${fontSize}px sans-serif`;
                measure = ctx.measureText(text).width;
            }
            // if still too wide, truncate
            if (measure > maxW) {
                let t = full;
                ctx.font = `${fontSize}px sans-serif`;
                while (t.length > 0 && ctx.measureText(t + '...').width > maxW) t = t.slice(0, -1);
                text = t + '...';
            }
            // draw rotated
            ctx.save();
            ctx.translate(x(cat), 0);
            ctx.rotate((45 * Math.PI) / 180);
            ctx.fillText(text, 0, 0);
            ctx.restore();
        });
        ctx.restore();
    }

    // Render or update legend items — only swatches, labels on hover (tooltip), like histogram
    function renderLegend(allDataSets, colors) {
        const outer = container; // container already set to d3.select(plotDiv)
        outer.style("position", "relative");

        const currentAll = Array.isArray(allDataSets) ? allDataSets : (allDataSets || []);
        if (!currentAll.length) {
            // remove any leftover overlay
            outer.selectAll(".legend-overlay").remove();
            return;
        }

        const rightOffset = (currentAll.length + 10) + "px";
        // create/reuse overlay container
        let legendDiv = outer.select(".legend-overlay");
        if (legendDiv.empty()) {
            legendDiv = outer.append("div")
                .attr("class", "legend-overlay")
                .style("position", "absolute")
                .style("top", -25 + "px")
                .style("display", "flex")
                .style("gap", "6px")
                .style("z-index", 9999)
                .style("pointer-events", "auto");
        }
        legendDiv.style("right", rightOffset);

        const swatchSize = 16;
        const itemHeight = 18;

        // data-join keyed by dataset name
        const items = legendDiv.selectAll("div.legend-item").data(currentAll, d => d);
        items.exit().remove();

        const enter = items.enter()
            .append("div")
            .attr("class", "legend-item")
            .style("display", "flex")
            .style("align-items", "center")
            .style("cursor", "pointer")
            .style("height", itemHeight + "px")
            // prevent other pointer handlers (e.g. selection) from stealing the event
            .on("pointerdown", function(event, d) {
                event.stopPropagation();
                if (hiddenDatasets.has(d)) hiddenDatasets.delete(d);
                else hiddenDatasets.add(d);
                // re-render using existing update path
                renderAll();
            })
            .on("mouseover", function(event, d) {
                const rect = this.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                tooltip.html(d)
                    .style("left", (rect.left + scrollLeft + swatchSize + 8) + "px")
                    .style("top", (rect.top + scrollTop) + "px")
                    .style("display", "block")
                    .style("opacity", 1)
                    .on("transitionend", null);
            })
            .on("mousemove", function() {
                const rect = this.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                tooltip.style("left", (rect.left + scrollLeft + swatchSize + 8) + "px")
                    .style("top", (rect.top + scrollTop) + "px");
            })
            .on("mouseleave", function() {
                tooltip.style("opacity", 0).on("transitionend", function(event) {
                    if (event.propertyName === "opacity" && tooltip.style("opacity") === "0") {
                        tooltip.style("display", "none");
                        tooltip.on("transitionend", null);
                    }
                });
            });

        enter.append("div")
            .attr("class", "legend-swatch")
            .style("width", swatchSize + "px")
            .style("height", swatchSize + "px")
            .style("border-radius", "7px")
            .style("border", "1px solid #ccc");

        // update existing + new swatches
        const merged = enter.merge(items);
        merged.select(".legend-swatch")
            .style("background-color", d => (colors && colors[d]) || fallbackColor(d))
            .style("opacity", d => hiddenDatasets.has(d) ? 0.25 : 1);
    }


    function initialRender() {
        const { countsPerCat, allDataSets, colors } = computeCounts();
        const maxDatasetCount = d3.max(countsPerCat, c => d3.max(allDataSets.map(ds => c.datasets[ds] || 0))) || 0;
        const maxTotal = d3.max(countsPerCat, c => c.total) || 0;
        y.domain([0, Math.max(maxDatasetCount, maxTotal)]);

        // draw pinned y axis and grid + bars
        drawLeftAxis(y, Math.max(maxDatasetCount, maxTotal));
        drawGridAndBars(countsPerCat, allDataSets, colors);

        // legend
        renderLegend(allDataSets, colors);
    }

    function renderAll() {
        const { countsPerCat, allDataSets, colors } = computeCounts();
        const maxDatasetCount = d3.max(countsPerCat, c => d3.max(allDataSets.map(ds => c.datasets[ds] || 0))) || 0;
        const maxTotal = d3.max(countsPerCat, c => c.total) || 0;
        const yMax = Math.max(maxDatasetCount, maxTotal) || 1;
        y.domain([0, yMax]);

        // update left axis
        drawLeftAxis(y, yMax);

        // recompute right canvas size & x range based on container
        const cw = container.node().clientWidth;
        const newRightPaneWidth = Math.max(cw - marginLeft, categories.length * minBinWidth);
        canvasRightWidth = newRightPaneWidth;
        setCanvasSize(rightCanvasNode, rightCtx, canvasRightWidth, canvasHeight);

        x.range([0, canvasRightWidth - marginRight]);

        // draw everything on right canvas
        drawGridAndBars(countsPerCat, allDataSets, colors);
    }

    // initial draw
    initialRender();

    // return updater
    return function() {
        // update layout sizes if container resized externally
        const cw = container.node().clientWidth;
        const newRightPaneWidth = Math.max(cw - marginLeft, categories.length * minBinWidth);
        canvasRightWidth = newRightPaneWidth;
        setCanvasSize(rightCanvasNode, rightCtx, canvasRightWidth, canvasHeight);
        x.range([0, canvasRightWidth - marginRight]);
        renderAll();
    };
}
