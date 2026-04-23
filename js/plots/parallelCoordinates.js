import * as d3 from "d3";
import { customTickFormat } from "./plotsUtils/tickFormat.js";
import { LegendOverlay } from "./plotsUtils/togglableLegendOverlay.js";

export class ParallelCoordinates {
    constructor(fields, options, plotDiv, data, updatePlotsFun, utils) {
        this.fields = fields;
        this.options = options;
        this.plotDiv = plotDiv;
        this.data = data;
        this.updatePlotsFun = updatePlotsFun;
        this.utils = utils;

        // keys selected by user (preserve original filtering logic)
        this.keys = parallelCoordinates.fields
            .map((field) => fields.get(field.fieldName))
            .filter((value) => value !== "");

        // DOM container and dimensions
        this.container = d3.select(plotDiv);
        this.container.style("position", "relative");
        this.width = this.container.node().clientWidth;
        this.height = this.container.node().clientHeight;

        // margins and layout constants
        this.marginTop = 20;
        this.marginRight = 15;
        this.marginBottom = 30;
        this.marginLeft = 15;

        // colors and fallback
        this.unselectedColor = "grey";
        this.fallbackColor = d3.scaleOrdinal(d3.schemeCategory10);

        // build scales per-key (preserve exact domain endpoints; do not .nice())
        this.x = new Map(
            Array.from(this.keys, (key) => {
                let extent = d3.extent(this.data, (d) => {
                    const v = Number(d[key]);
                    return Number.isFinite(v) ? v : null;
                });
                if (extent[0] == null || extent[1] == null) extent = [0, 1];
                if (extent[0] === extent[1]) {
                    extent[0] -= 0.5;
                    extent[1] += 0.5;
                }
                return [
                    key,
                    d3
                        .scaleLinear()
                        .domain(extent)
                        .range([this.marginLeft, this.width - this.marginRight])
                        .unknown(this.marginLeft),
                ];
            })
        );

        // vertical layout for axes (point scale)
        this.y = d3
            .scalePoint()
            .domain(this.keys)
            .range([this.marginTop, this.height - this.marginBottom]);

        // LegendOverlay instance (manages toggling/hiding globally)
        this.legend = new LegendOverlay(this.container, {
            fallbackColor: this.fallbackColor,
            onToggle: () => this.update(),
        });

        // small tooltip for hovered polyline (row name)
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
            .style("transition", "opacity 0.18s ease, transform 0.18s ease")
            .style("display", "none");

        // SVG for axes and brushes (overlay above canvas)
        this.svg = this.container
            .append("svg")
            .attr("viewBox", `0 0 ${this.width} ${this.height}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .style("position", "absolute")
            .style("left", "0px")
            .style("top", "0px")
            .style("z-index", 2)
            .property("value", []);

        // canvas for drawing polylines (under SVG axes)
        this.canvas = this.container
            .append("canvas")
            .attr("class", "pc-canvas")
            .style("position", "absolute")
            .style("left", "0px")
            .style("top", "0px")
            .style("z-index", 1)
            .node();

        const dpr = Math.max(1, window.devicePixelRatio || 1);
        this.canvas.style.width = this.width + "px";
        this.canvas.style.height = this.height + "px";
        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);
        this.ctx = this.canvas.getContext("2d");
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.clearRect(0, 0, this.width, this.height);

        // compute axes groups and attach brushes
        this._renderAxesAndBrushes();

        // precompute polylines and bboxes for faster draws / hit-testing
        this.polylines = this._precomputePolylines();

        // mouse hit-testing throttle
        this.hoverTolerance = 6;
        this._findNearest = this._findNearest.bind(this);
        this._throttledMouse = (event) => this._onMouseMove(event);

        this.canvas.addEventListener("mousemove", this._throttledMouse);
        this.canvas.addEventListener("mouseleave", () => this._hideTooltip());

        // initial legend render using utils snapshot
        const initialUtils = this.utils();
        const initialAllDataSets =
            typeof initialUtils.allDataSets === "function"
                ? initialUtils.allDataSets() || []
                : initialUtils.allDataSets || [];
        const initialColors =
            initialUtils.colorsPerDataSet || initialUtils.colors || {};
        this.legend.render(initialAllDataSets, initialColors);

        // initial draw
        this.update();
    }

    // helper: compute evenly spaced tick values that ALWAYS include domain min and max
    computeEvenTicks(domain, count) {
        let [a, b] = domain;
        if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
        if (a === b) return [a];
        if (b < a) [a, b] = [b, a];

        const n = Math.max(2, Math.floor(count));
        const step = (b - a) / (n - 1);
        const ticks = [];
        for (let i = 0; i < n; i++) ticks.push(a + step * i);
        return ticks;
    }

    // Build axes, attach brush behaviour per-axis
    _renderAxesAndBrushes() {
        const marginLeft = this.marginLeft;
        const x = this.x;
        const y = this.y;

        // axes groups (one per key)
        this.axes = this.svg
            .append("g")
            .selectAll("g")
            .data(this.keys)
            .join("g")
            .attr("transform", (d) => `translate(0,${y(d)})`)
            .each((d, i, nodes) => {
                // compute tick values that include endpoints
                const scale = x.get(d);
                const domain = scale.domain();
                const tickCount = 5;
                const tickVals = this.computeEvenTicks(domain, tickCount);
                const axis = d3
                    .axisBottom(scale)
                    .tickValues(tickVals)
                    .tickFormat(customTickFormat);
                d3.select(nodes[i]).call(axis);
            })
            .call((g) =>
                g
                    .append("text")
                    .attr("x", marginLeft)
                    .attr("y", -6)
                    .attr("text-anchor", "start")
                    .attr("fill", "currentColor")
                    .text((d) => d)
            )
            .call((g) =>
                g
                    .selectAll("text")
                    .clone(true)
                    .lower()
                    .attr("fill", "none")
                    .attr("stroke-width", 5)
                    .attr("stroke-linejoin", "round")
                    .attr("stroke", "white")
            );

        // brush behaviour per-axis
        this.selectionsFromAxis = new Map();
        const brushHeight = 50;
        const brush = d3.brushX().extent([
            [this.marginLeft, -(brushHeight / 2)],
            [this.width - this.marginRight, brushHeight / 2],
        ]);
        // bind this.handleSelection so it's called with (event, field)
        const throttledHandle = (event, d) => this._handleSelection(event, d);
        this.axes.call((g) =>
            g.call(
                brush.on("start brush end", function (event, d) {
                    throttledHandle(event, d);
                })
            )
        );
    }

    // Brush handler: update selectionsFromAxis and call updatePlotsFun with aggregated ranges
    _handleSelection(event, fieldSelected) {
        const selection = event.selection;
        if (selection === null) {
            this.selectionsFromAxis.delete(fieldSelected);
        } else {
            const vals = selection.map((v) =>
                this.x.get(fieldSelected).invert(v)
            );
            this.selectionsFromAxis.set(fieldSelected, vals);
        }

        const selectRanges = Array.from(
            this.selectionsFromAxis,
            ([field, [min, max]]) => ({
                range: [min, max],
                field: field,
                type: "numerical",
            })
        );

        this.updatePlotsFun(selectRanges);
    }

    // Utility to extract datasets for a row (keeps original multi-source compatibility)
    dataSetsOfRow(i) {
        const u = this.utils();
        let others = [];
        if (typeof u.dataSetsOf === "function") {
            const res = u.dataSetsOf(i);
            if (Array.isArray(res)) others = res;
        } else if (Array.isArray(u.dataSestOf)) {
            const res = u.dataSestOf(i);
            if (Array.isArray(res)) others = res;
        } else if (Array.isArray(u.dataSetsOf)) {
            others = u.dataSetsOf;
        }

        const origin =
            typeof u.dataSet === "function" ? u.dataSet() : u.dataSet || "";
        const isSelected =
            typeof u.isRowSelected === "function"
                ? !!u.isRowSelected(i)
                : !!u.isRowSelected;
        if (isSelected && origin) others.push(origin);

        return Array.from(new Set(others || []));
    }

    // Precompute polyline points and simple bounding boxes for each datum
    _precomputePolylines() {
        const keys = this.keys;
        const x = this.x;
        const y = this.y;
        const polylines = this.data.map((d) => {
            const pts = keys
                .map((k) => {
                    const v = d[k];
                    const num = v == null || v === "" ? null : Number(v);
                    return num == null || !Number.isFinite(num)
                        ? null
                        : [x.get(k)(num), y(k)];
                })
                .filter((p) => p != null);

            // bounding box for quick rejection in hit-testing
            let minX = Infinity,
                minY = Infinity,
                maxX = -Infinity,
                maxY = -Infinity;
            for (const p of pts) {
                if (p[0] < minX) minX = p[0];
                if (p[0] > maxX) maxX = p[0];
                if (p[1] < minY) minY = p[1];
                if (p[1] > maxY) maxY = p[1];
            }
            if (!isFinite(minX)) {
                minX = 0;
                minY = 0;
                maxX = 0;
                maxY = 0;
            }
            return { pts, bbox: [minX, minY, maxX, maxY] };
        });
        return polylines;
    }

    // Draw polylines on canvas using dataset coloring and legend-hidden state
    drawCanvas(allDataSets, colors) {
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        ctx.clearRect(0, 0, width, height);

        const hidden = this.legend.getGlobalDatasets
            ? this.legend.getGlobalDatasets()
            : new Set();
        const visibleDatasets = new Set(
            allDataSets.filter((ds) => !hidden.has(ds))
        );

        for (let i = 0; i < this.data.length; i++) {
            const pl = this.polylines[i];
            if (!pl || pl.pts.length === 0) continue;

            const dsList = this.dataSetsOfRow(i);
            let chosen = null;
            for (let j = 0; j < dsList.length; j++) {
                if (visibleDatasets.has(dsList[j])) {
                    chosen = dsList[j];
                    break;
                }
            }

            const dsColor = chosen
                ? colors[chosen] || this.fallbackColor(chosen)
                : this.unselectedColor;
            const isRowSel = chosen;

            ctx.beginPath();
            const pts = pl.pts;
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let k = 1; k < pts.length; k++)
                ctx.lineTo(pts[k][0], pts[k][1]);

            ctx.lineWidth = isRowSel ? 0.8 : 0.08;
            ctx.globalAlpha = 1;
            ctx.strokeStyle = dsColor;
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }

    // Hit-testing: find nearest polyline index within hoverTolerance
    _findNearest(mx, my) {
        const candidates = [];
        for (let i = 0; i < this.polylines.length; i++) {
            const b = this.polylines[i].bbox;
            if (
                mx + this.hoverTolerance < b[0] ||
                mx - this.hoverTolerance > b[2] ||
                my + this.hoverTolerance < b[1] ||
                my - this.hoverTolerance > b[3]
            )
                continue;
            candidates.push(i);
        }

        let best = { idx: -1, dist: Infinity };
        for (const i of candidates) {
            const pts = this.polylines[i].pts;
            for (let s = 0; s < pts.length - 1; s++) {
                const x1 = pts[s][0],
                    y1 = pts[s][1],
                    x2 = pts[s + 1][0],
                    y2 = pts[s + 1][1];
                const A = mx - x1,
                    B = my - y1,
                    C = x2 - x1,
                    D = y2 - y1;
                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                let param = lenSq !== 0 ? dot / lenSq : -1;
                let xx, yy;
                if (param < 0) {
                    xx = x1;
                    yy = y1;
                } else if (param > 1) {
                    xx = x2;
                    yy = y2;
                } else {
                    xx = x1 + param * C;
                    yy = y1 + param * D;
                }
                const dx = mx - xx,
                    dy = my - yy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < best.dist) {
                    best = { idx: i, dist };
                }
            }
        }
        if (best.idx !== -1 && best.dist <= this.hoverTolerance)
            return best.idx;
        return -1;
    }

    // mousemove handler: find nearest polyline and show tooltip with row name
    _onMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const u = this.utils();
        const idx = this._findNearest(mx, my);
        if (idx >= 0) {
            const name =
                this.data[idx] && this.data[idx].name
                    ? this.data[idx].name
                    : "";
            this.tooltip
                .html(name)
                .style("left", event.pageX + 12 + "px")
                .style("top", event.pageY + 6 + "px")
                .style("display", "block")
                .style("opacity", 1);
        } else {
            this._hideTooltip();
        }
    }

    _hideTooltip() {
        this.tooltip.style("opacity", 0).on("transitionend", (ev) => {
            if (
                ev &&
                ev.propertyName === "opacity" &&
                this.tooltip.style("opacity") === "0"
            ) {
                this.tooltip.style("display", "none");
                this.tooltip.on("transitionend", null);
            }
        });
    }

    // Aggregates utils -> datasets/colors and performs legend render + canvas draw
    update() {
        const u = this.utils();
        const allDataSets =
            typeof u.allDataSets === "function"
                ? u.allDataSets() || []
                : u.allDataSets || [];
        const colors = u.colorsPerDataSet || u.colors || {};

        // update legend UI and redraw canvas based on legend state
        this.legend.render(allDataSets, colors);
        this.drawCanvas(allDataSets, colors);
    }

    // Expose a cleanup method in case consumers want to remove listeners (not required by original contract)
    destroy() {
        this.canvas.removeEventListener("mousemove", this._throttledMouse);
        this.canvas.removeEventListener("mouseleave", this._hideTooltip);
        this.tooltip.remove();
        this.svg.remove();
        d3.select(this.canvas).remove();
        if (this.legend && typeof this.legend.destroy === "function")
            this.legend.destroy();
    }
}

export const parallelCoordinates = {
    plotName: "Parallel Coordinates",
    fields: [
        { fieldType: "numerical", isRequired: true, fieldName: "1st axis" },
        { fieldType: "numerical", isRequired: true, fieldName: "2nd axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "3rd axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "4th axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "5th axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "6th axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "7th axis" },
        { fieldType: "numerical", isRequired: false, fieldName: "8th axis" },
    ],
    options: [],
    height: 2,
    width: 1,
    plotClass: ParallelCoordinates,
};
