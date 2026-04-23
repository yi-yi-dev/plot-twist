import * as d3 from "d3";
import { customTickFormat } from "./plotsUtils/tickFormat.js";
import { LegendOverlay } from "./plotsUtils/togglableLegendOverlay.js";

export class BarPlot {
    constructor(fields, options, plotDiv, data, updatePlotsFun, utils) {
        // store inputs
        this.fields = fields;
        this.options = options;
        this.plotDiv = plotDiv;
        this.data = data;
        this.updatePlotsFun = updatePlotsFun;
        this.utils = utils;

        // configuration & layout
        this.field = fields.get("bin-variable");
        this.container = d3.select(plotDiv).style("position", "relative");
        this.containerWidth = this.container.node().clientWidth;
        this.canvasHeight = this.container.node().clientHeight;

        this.marginTop = 10;
        this.marginRight = 20;
        this.marginBottom = 40; // room for rotated labels
        this.marginLeft = 60; // pinned y axis width

        this.innerPadding = 2;
        this.fallbackColor = d3.scaleOrdinal(d3.schemeCategory10);
        this.minBinWidth = 40;

        // unique id for CSS scoping
        this.uid = `barplot-${Math.random().toString(36).slice(2, 9)}`;
        this.container.attr("data-barplot-id", this.uid);

        // inject small style block for scroll + legend layout
        const style = `
            [data-barplot-id="${this.uid}"] .bp-scroll { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
            [data-barplot-id="${this.uid}"] .bp-scroll::-webkit-scrollbar { height: 10px; }
            [data-barplot-id="${this.uid}"] .bp-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 6px; }
            [data-barplot-id="${this.uid}"] .bp-scroll::-webkit-scrollbar-button { display: none; height: 0; }
            [data-barplot-id="${this.uid}"] .bp-scroll { scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.2) transparent; }
            [data-barplot-id="${this.uid}"] .bp-left { position: absolute; left: 0; top: 0; bottom: 0; width: ${this.marginLeft}px; pointer-events: none; }
            [data-barplot-id="${this.uid}"] .bp-right { position: absolute; left: ${this.marginLeft}px; top: 0; right: 0; bottom: 0; }
            [data-barplot-id="${this.uid}"] .bp-title { position: absolute; right: ${this.marginRight}px; top: ${this.marginTop}px; pointer-events: none; font-family: sans-serif; font-weight: 700; font-size: 12px; }
            [data-barplot-id="${this.uid}"] .x-label { cursor: default; pointer-events: auto; }
            [data-barplot-id="${this.uid}"] .legend-overlay { pointer-events: auto; display: flex; gap: 6px; align-items: center; }
            [data-barplot-id="${this.uid}"] .legend-item { display:flex; align-items:center; cursor:pointer; height:18px; }
            [data-barplot-id="${this.uid}"] .legend-swatch { width:16px; height:16px; border-radius:7px; border:1px solid #ccc; }
        `;
        this.container.append("style").text(style);

        // lightweight tooltip (used for bar/category hover)
        this.tooltip = d3
            .select("body")
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

        // categories (order preserved by first appearance)
        this.categories = Array.from(
            new Set(this.data.map((d) => d[this.field]))
        );

        // canvas sizes
        const minTotalWidth = this.categories.length * this.minBinWidth;
        const rightPaneWidth = Math.max(
            this.containerWidth - this.marginLeft,
            minTotalWidth
        );
        this.canvasRightWidth = rightPaneWidth;

        // create DOM panes: left pinned, right scrollable
        this.leftDiv = this.container.append("div").attr("class", "bp-left");
        this.rightDiv = this.container
            .append("div")
            .attr("class", "bp-right bp-scroll");

        // pinned title
        this.container.append("div").attr("class", "bp-title").text(this.field);

        // create canvases
        this.leftCanvasNode = this.leftDiv.append("canvas").node();
        this.leftCanvasNode.style.background = "transparent";
        this.leftCanvasNode.style.display = "block";
        this.leftCanvasNode.style.pointerEvents = "none";
        this.leftCtx = this.leftCanvasNode.getContext("2d");

        this.rightCanvasNode = this.rightDiv.append("canvas").node();
        this.rightCanvasNode.style.background = "transparent";
        this.rightCanvasNode.style.display = "block";
        this.rightCtx = this.rightCanvasNode.getContext("2d");

        // set HiDPI sizes
        this.setCanvasSize(
            this.leftCanvasNode,
            this.leftCtx,
            this.marginLeft,
            this.canvasHeight
        );
        this.setCanvasSize(
            this.rightCanvasNode,
            this.rightCtx,
            this.canvasRightWidth,
            this.canvasHeight
        );

        // attach event handlers (bound to instance)
        this.handleCanvasClick = this.handleCanvasClick.bind(this);
        this.handleCanvasMouseMove = this.handleCanvasMouseMove.bind(this);
        this.handleCanvasMouseLeave = this.handleCanvasMouseLeave.bind(this);
        this.rightCanvasNode.addEventListener("click", this.handleCanvasClick);
        this.rightCanvasNode.addEventListener(
            "mousemove",
            this.handleCanvasMouseMove
        );
        this.rightCanvasNode.addEventListener(
            "mouseleave",
            this.handleCanvasMouseLeave
        );

        // scales
        this.x = d3
            .scaleBand()
            .domain(this.categories)
            .range([0, this.canvasRightWidth - this.marginRight])
            .padding(0.1);

        this.y = d3
            .scaleLinear()
            .range([this.canvasHeight - this.marginBottom, this.marginTop]);

        // selection state & hit-testing structures
        this.selectedCategories = [];
        this.categoryRects = []; // [{x,y,width,height,category,total}]
        this.barRects = []; // [{x,y,width,height,category,dsName,count,idx}]

        // Legend overlay handles dataset toggling; onToggle -> update plot
        this.legend = new LegendOverlay(this.container, {
            fallbackColor: this.fallbackColor,
            onToggle: () => this.update(),
        });

        // initial render
        this.update(); // computes counts, draws axes, bars, legend
    }

    // utility: set canvas CSS + pixel buffer sizes and scale context for DPR
    setCanvasSize(node, ctx, w, h) {
        const ratio = window.devicePixelRatio || 1;
        node.width = Math.max(1, Math.floor(w * ratio));
        node.height = Math.max(1, Math.floor(h * ratio));
        node.style.width = w + "px";
        node.style.height = h + "px";
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    // compute counts per category and per dataset (keeps same logic as original)
    computeCounts() {
        const u =
            typeof this.utils === "function" ? this.utils() : this.utils || {};
        const origin =
            typeof u.dataSet === "function" ? u.dataSet() : u.dataSet || "";
        const allDataSets =
            typeof u.allDataSets === "function"
                ? u.allDataSets() || []
                : u.allDataSets || [];
        const colors = u.colorsPerDataSet || u.colors || {};

        const countsPerCat = this.categories.map(() => ({
            total: 0,
            datasets: {},
        }));
        countsPerCat.forEach((c) => {
            allDataSets.forEach((ds) => (c.datasets[ds] = 0));
        });

        this.data.forEach((d, i) => {
            const cat = d[this.field];
            const ci = this.categories.indexOf(cat);
            if (ci < 0) return;
            const c = countsPerCat[ci];
            c.total += 1;

            const isSel =
                typeof u.isRowSelected === "function"
                    ? !!u.isRowSelected(i)
                    : !!u.isRowSelected;
            if (isSel && origin) {
                if (!(origin in c.datasets)) c.datasets[origin] = 0;
                c.datasets[origin] += 1;
            }

            let others = [];
            if (typeof u.dataSetsOf === "function") {
                const res = u.dataSetsOf(i);
                if (Array.isArray(res)) others = res;
            }
            const uniqueOthers = Array.from(new Set(others || []));
            uniqueOthers.forEach((ds) => {
                if (!(ds in c.datasets)) c.datasets[ds] = 0;
                if (ds === origin && isSel) return; // dedupe selected origin
                c.datasets[ds] += 1;
            });
        });

        return { countsPerCat, allDataSets, colors };
    }

    // draw left pinned Y axis (numbers) on left canvas
    drawLeftAxis(yScale, yMax) {
        const ctx = this.leftCtx;
        const w = this.marginLeft;
        const h = this.canvasHeight;
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = "#333";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.font = "12px sans-serif";

        const ticks = yScale.ticks
            ? yScale.ticks(7)
            : d3.range(0, yMax + 1, Math.ceil(yMax / 7));
        ticks.forEach((t) => {
            const yPos = yScale(t);
            // short tick mark
            ctx.strokeStyle = "#666";
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(w - 6, yPos);
            ctx.lineTo(w - 2, yPos);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillText(customTickFormat(t), w - 8, yPos);
        });
    }

    // draw grid (on right canvas) and bars; populate hit-test maps
    drawGridAndBars(countsPerCat, allDataSets, colors) {
        const ctx = this.rightCtx;
        const w = this.canvasRightWidth;
        const h = this.canvasHeight;
        ctx.clearRect(0, 0, w, h);

        // y grid lines
        const yTicks = this.y.ticks
            ? this.y.ticks(7)
            : d3.range(
                  0,
                  (this.y.domain()[1] || 1) + 1,
                  Math.ceil(this.y.domain()[1] / 7)
              );
        ctx.strokeStyle = "#999";
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 0.5;
        yTicks.forEach((t) => {
            const yPos = this.y(t);
            ctx.beginPath();
            ctx.moveTo(0, yPos);
            ctx.lineTo(w - this.marginRight, yPos);
            ctx.stroke();
        });
        ctx.globalAlpha = 1;

        // reset hit-test arrays
        this.categoryRects = [];
        this.barRects = [];

        const catWidth = Math.max(1, this.x.bandwidth());
        const N = Math.max(1, allDataSets.length);
        const innerW = Math.max(
            0,
            (catWidth - (N - 1) * this.innerPadding) / N
        );

        // iterate categories and draw totals + dataset bars
        this.categories.forEach((cat, ci) => {
            const cx = this.x(cat) || 0;
            const total = countsPerCat[ci].total || 0;
            const rectY = this.y(total);
            const rectH = this.canvasHeight - this.marginBottom - rectY;

            // background rect for total
            ctx.fillStyle = "#e6e6e6";
            ctx.fillRect(cx, rectY, catWidth, rectH);

            this.categoryRects.push({
                x: cx,
                y: rectY,
                width: catWidth,
                height: rectH,
                category: cat,
                total,
            });

            // dataset bars
            allDataSets.forEach((ds, idx) => {
                const count = countsPerCat[ci].datasets[ds] || 0;
                const bx = cx + idx * (innerW + this.innerPadding);
                const by = this.y(count);
                const bh = this.canvasHeight - this.marginBottom - by;
                const color = colors[ds] || this.fallbackColor(ds);

                // rely on LegendOverlay for global hidden set
                const hidden = this.legend.getGlobalDatasets().has(ds);
                ctx.fillStyle = hidden ? "rgba(0,0,0,0)" : color;
                ctx.globalAlpha = hidden ? 0 : 1;
                ctx.fillRect(bx, by, innerW, bh);
                ctx.globalAlpha = 1;

                this.barRects.push({
                    x: bx,
                    y: by,
                    width: innerW,
                    height: bh,
                    category: cat,
                    dsName: ds,
                    count,
                    idx,
                });
            });

            // highlight selection border if selected
            if (this.selectedCategories.includes(cat)) {
                ctx.strokeStyle = "#222";
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    cx + 1,
                    rectY + 1,
                    catWidth - 2,
                    Math.max(1, rectH - 2)
                );
            }
        });

        // x-axis baseline
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, this.canvasHeight - this.marginBottom);
        ctx.lineTo(
            Math.max(0, this.canvasRightWidth - this.marginRight),
            this.canvasHeight - this.marginBottom
        );
        ctx.stroke();

        // x-axis labels (rotated, truncated if necessary)
        this.drawXAxisLabels(ctx, this.categories, this.x.bandwidth());
    }

    // draw rotated/truncated x-axis labels; conservative measurement so it fits narrow columns
    drawXAxisLabels(ctx, cats, bandwidth) {
        ctx.save();
        ctx.translate(0, this.canvasHeight - this.marginBottom + 6);
        ctx.fillStyle = "#111";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        const maxW = Math.max(8, bandwidth);
        cats.forEach((cat) => {
            const full = String(cat);
            // adjust font size if label too wide for available width
            ctx.font = "12px sans-serif";
            let text = full;
            let measure = ctx.measureText(text).width;
            let fontSize = 12;
            while (fontSize > 8 && measure > maxW) {
                fontSize -= 1;
                ctx.font = `${fontSize}px sans-serif`;
                measure = ctx.measureText(text).width;
            }
            if (measure > maxW) {
                let t = full;
                ctx.font = `${fontSize}px sans-serif`;
                while (t.length > 0 && ctx.measureText(t + "...").width > maxW)
                    t = t.slice(0, -1);
                text = t + "...";
            }

            ctx.save();
            ctx.translate(this.x(cat), 0);
            ctx.rotate((45 * Math.PI) / 180);
            ctx.fillText(text, 0, 0);
            ctx.restore();
        });

        ctx.restore();
    }

    // click handling: supports single and multi (ctrl/cmd) selection on category or bar.
    handleCanvasClick(ev) {
        const { x: mx, y: my } = this.getEventOffset(ev, this.rightCanvasNode);

        // bars preferred
        const hitBar = this.barRects.find(
            (r) =>
                mx >= r.x &&
                mx <= r.x + r.width &&
                my >= r.y &&
                my <= r.y + r.height
        );
        if (hitBar) {
            const clickedCategory = hitBar.category;
            if (ev.ctrlKey || ev.metaKey)
                this.handleMultiClick(clickedCategory);
            else this.handleSingleClick(clickedCategory);
            return;
        }

        const hitCat = this.categoryRects.find(
            (r) =>
                mx >= r.x &&
                mx <= r.x + r.width &&
                my >= r.y &&
                my <= r.y + r.height
        );
        if (hitCat) {
            const clickedCategory = hitCat.category;
            if (ev.ctrlKey || ev.metaKey)
                this.handleMultiClick(clickedCategory);
            else this.handleSingleClick(clickedCategory);
            return;
        }

        this.handleBackgroundClick();
    }

    handleCanvasMouseMove(ev) {
        const { x: mx, y: my } = this.getEventOffset(ev, this.rightCanvasNode);

        // prefer bar hover
        const hitBar = this.barRects.find(
            (r) =>
                mx >= r.x &&
                mx <= r.x + r.width &&
                my >= r.y &&
                my <= r.y + r.height
        );
        if (hitBar) {
            this.tooltip
                .html(
                    `<strong>${hitBar.dsName}</strong><br/>count: ${hitBar.count}<br/>category: ${hitBar.category}`
                )
                .style("left", ev.pageX + 8 + "px")
                .style("top", ev.pageY + 8 + "px")
                .style("display", "block")
                .style("opacity", 1);
            return;
        }

        const hitCat = this.categoryRects.find(
            (r) =>
                mx >= r.x &&
                mx <= r.x + r.width &&
                my >= r.y &&
                my <= r.y + r.height
        );
        if (hitCat) {
            this.tooltip
                .html(
                    `<strong>${hitCat.category}</strong><br/>total: ${hitCat.total || 0}`
                )
                .style("left", ev.pageX + 8 + "px")
                .style("top", ev.pageY + 8 + "px")
                .style("display", "block")
                .style("opacity", 1);
            return;
        }

        this.tooltip.style("opacity", 0).style("display", "none");
    }

    handleCanvasMouseLeave() {
        this.tooltip.style("opacity", 0).style("display", "none");
    }

    // helper: convert client event to canvas-local coordinates
    getEventOffset(ev, canvas) {
        const rect = canvas.getBoundingClientRect();
        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }

    // selection helpers
    handleMultiClick(clickedCategory) {
        const idx = this.selectedCategories.indexOf(clickedCategory);
        if (idx > -1) this.selectedCategories.splice(idx, 1);
        else this.selectedCategories.push(clickedCategory);
        this.updateSelection();
    }
    handleSingleClick(clickedCategory) {
        this.selectedCategories = [clickedCategory];
        this.updateSelection();
    }
    handleBackgroundClick() {
        this.selectedCategories = [];
        this.updateSelection();
    }

    // after selection update, notify caller and re-render visuals
    updateSelection() {
        let payload = [];
        if (this.selectedCategories.length)
            payload = [
                {
                    categories: this.selectedCategories,
                    field: this.field,
                    type: "categorical",
                },
            ];
        this.updatePlotsFun(payload);
        this.renderAll(); // update visual selection emphasis
    }

    // render/initial draw entrypoint (keeps same behaviour as original)
    initialRender() {
        const { countsPerCat, allDataSets, colors } = this.computeCounts();
        const maxDatasetCount =
            d3.max(countsPerCat, (c) =>
                d3.max(allDataSets.map((ds) => c.datasets[ds] || 0))
            ) || 0;
        const maxTotal = d3.max(countsPerCat, (c) => c.total) || 0;
        this.y.domain([0, Math.max(maxDatasetCount, maxTotal)]);

        // draw pinned y axis and right pane
        this.drawLeftAxis(this.y, Math.max(maxDatasetCount, maxTotal));
        this.drawGridAndBars(countsPerCat, allDataSets, colors);

        // legend via LegendOverlay (handles toggles)
        this.legend.render(allDataSets, colors);
    }

    // full re-render (used by LegendOverlay onToggle and external updater)
    renderAll() {
        const { countsPerCat, allDataSets, colors } = this.computeCounts();
        const maxDatasetCount =
            d3.max(countsPerCat, (c) =>
                d3.max(allDataSets.map((ds) => c.datasets[ds] || 0))
            ) || 0;
        const maxTotal = d3.max(countsPerCat, (c) => c.total) || 0;
        const yMax = Math.max(maxDatasetCount, maxTotal) || 1;
        this.y.domain([0, yMax]);

        // left axis
        this.drawLeftAxis(this.y, yMax);

        // recompute right canvas width if container resized
        const cw = this.container.node().clientWidth;
        const newRightPaneWidth = Math.max(
            cw - this.marginLeft,
            this.categories.length * this.minBinWidth
        );
        this.canvasRightWidth = newRightPaneWidth;
        this.setCanvasSize(
            this.rightCanvasNode,
            this.rightCtx,
            this.canvasRightWidth,
            this.canvasHeight
        );

        this.x.range([0, this.canvasRightWidth - this.marginRight]);

        // draw right pane
        this.drawGridAndBars(countsPerCat, allDataSets, colors);

        // ensure legend is current
        this.legend.render(allDataSets, colors);
    }

    update() {
        this.renderAll();
    }
}

export const barPlot = {
    plotName: "Bar Plot",
    fields: [
        {
            isRequired: true,
            fieldName: "bin-variable",
            fieldType: "any",
        },
    ],
    options: [],
    height: 1,
    width: 1,
    plotClass: BarPlot,
};
