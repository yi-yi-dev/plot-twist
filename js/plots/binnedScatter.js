import * as d3 from "d3";
import { customTickFormat } from "./plotsUtils/tickFormat.js";
import { LegendOverlay } from "./plotsUtils/togglableLegendOverlay.js";

export class BinnedScatterPlot {
    constructor(fields, options, plotDiv, data, updatePlotsFun, utils) {
        this.fields = fields;
        this.plotDiv = plotDiv;
        this.data = data;
        this.updatePlotsFun = updatePlotsFun;
        this.utils = utils;

        this.xField = fields.get("x-axis");
        this.yField = fields.get("y-axis");
        this.vField = fields.get("value");

        this.container = d3.select(plotDiv).style("position", "relative");

        this.width = this.container.node().clientWidth;
        this.height = this.container.node().clientHeight;

        this.margin = { top: 10, right: 100, bottom: 36, left: 48 };

        this.fallbackColor = d3.scaleOrdinal(d3.schemeCategory10);
        this.unselectedColor = "#d9d9d9";

        this._createScales();
        this._createCanvasAndOverlay();

        this._createAxesGroups();
        this.colorbarLayer = this.overlaySvg
            .append("g")
            .attr("class", "colorbar-layer");

        this.legend = new LegendOverlay(this.container, {
            fallbackColor: this.fallbackColor,
            onToggle: () => this.update(),
        });

        this.currentSelection = null;

        this._throttledBrush = this._throttle(
            (selection) => this._onBrush(selection),
            50
        );

        this.overlaySvg.call(
            d3
                .brush()
                .extent([
                    [this.margin.left, this.margin.top],
                    [
                        this.width - this.margin.right,
                        this.height - this.margin.bottom,
                    ],
                ])
                .on("start brush end", ({ selection }) =>
                    this._throttledBrush(selection)
                )
        );

        this.update();
    }

    _createScales() {
        this.x = d3
            .scaleLinear()
            .domain(d3.extent(this.data, (d) => +d[this.xField]) || [0, 1])
            .range([this.margin.left, this.width - this.margin.right]);

        this.y = d3
            .scaleLinear()
            .domain(d3.extent(this.data, (d) => +d[this.yField]) || [0, 1])
            .nice()
            .range([this.height - this.margin.bottom, this.margin.top]);
    }

    _createCanvasAndOverlay() {
        const dpr = window.devicePixelRatio || 1;

        this.canvas = this.container
            .append("canvas")
            .attr(
                "style",
                `position:absolute;left:0;top:0;width:${this.width}px;height:${this.height}px;display:block;`
            )
            .node();

        this.canvas.width = Math.max(1, Math.floor(this.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(this.height * dpr));
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;

        this.ctx = this.canvas.getContext("2d");
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.overlaySvg = this.container
            .append("svg")
            .attr("viewBox", `0 0 ${this.width} ${this.height}`)
            .style("position", "absolute")
            .style("left", 0)
            .style("top", 0)
            .style("pointer-events", "all")
            .style("overflow", "visible"); // allow text to show outside strict bounds if needed
    }

    _throttle(fn, delay) {
        let last = 0;
        let timeout = null;
        let lastArgs = null;
        return (...args) => {
            const now = Date.now();
            lastArgs = args;
            if (now - last >= delay) {
                last = now;
                fn(...args);
            } else if (!timeout) {
                timeout = setTimeout(
                    () => {
                        last = Date.now();
                        timeout = null;
                        fn(...lastArgs);
                    },
                    delay - (now - last)
                );
            }
        };
    }

    _createAxesGroups() {
        // Axis groups
        this.xAxisG = this.overlaySvg
            .append("g")
            .attr(
                "transform",
                `translate(0,${this.height - this.margin.bottom})`
            );

        this.yAxisG = this.overlaySvg
            .append("g")
            .attr("transform", `translate(${this.margin.left},0)`);

        // draw axes
        this.xAxisG
            .call(d3.axisBottom(this.x).tickFormat(customTickFormat))
            .call((g) => g.select(".domain").remove())
            .call((g) =>
                g
                    .selectAll("text")
                    .attr("text-anchor", "start")
                    .attr("transform", "rotate(45)")
                    .attr("dx", "0.4em")
                    .attr("dy", "0.6em")
            );

        this.yAxisG
            .call(d3.axisLeft(this.y).ticks(7).tickFormat(customTickFormat))
            .call((g) => g.select(".domain").remove());

        // Axis labels - explicit fill and font to ensure visibility across themes
        const plotCenterX =
            (this.width - this.margin.left - this.margin.right) / 2 +
            this.margin.left;
        const plotCenterY =
            (this.height - this.margin.top - this.margin.bottom) / 2 +
            this.margin.top;

        // X axis label (centered below the x-axis). Place slightly below the axis ticks.
        this.xLabel = this.overlaySvg
            .append("text")
            .attr("class", "x-axis-label")
            .attr("x", plotCenterX)
            .attr("y", this.height - this.margin.bottom + 28) // ensure below axis and ticks
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("fill", "#222")
            .attr("font-family", "sans-serif")
            .style("pointer-events", "none")
            .text(this.xField || "");

        // Y axis label (rotated). Use rotate with explicit center so it doesn't get clipped or misplaced.
        const yLabelX = this.margin.left - 36;
        const yLabelY = plotCenterY;
        this.yLabel = this.overlaySvg
            .append("text")
            .attr("class", "y-axis-label")
            .attr("x", yLabelX)
            .attr("y", yLabelY)
            .attr("transform", `rotate(-90 ${yLabelX} ${yLabelY})`)
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("fill", "#222")
            .attr("font-family", "sans-serif")
            .style("pointer-events", "none")
            .text(this.yField || "");

        // ensure labels rendered above axes / canvas
        this.xLabel.raise();
        this.yLabel.raise();
    }

    _binData() {
        const xBins = Math.max(10, Math.floor(this.width / 40));
        const yBins = Math.max(10, Math.floor(this.height / 40));

        const xBin = d3
            .bin()
            .domain(this.x.domain())
            .thresholds(xBins)
            .value((d) => +d[this.xField]);

        const bins = [];
        xBin(this.data).forEach((xb) => {
            const yBin = d3
                .bin()
                .domain(this.y.domain())
                .thresholds(yBins)
                .value((d) => +d[this.yField]);
            yBin(xb).forEach((yb) => {
                if (!yb.length) return;
                bins.push({
                    x0: xb.x0,
                    x1: xb.x1,
                    y0: yb.x0,
                    y1: yb.x1,
                    rows: yb.map((d) => this.data.indexOf(d)),
                });
            });
        });
        return bins;
    }

    _normalize(x) {
        return x == null ? "" : String(x);
    }

    _datasetForRow(i, visibleSet, allDataSets, origin, u) {
        const rawList =
            typeof u.dataSetsOf === "function"
                ? u.dataSetsOf(i) || []
                : Array.isArray(u.dataSetsOf)
                  ? u.dataSetsOf
                  : [];
        const isSelected =
            typeof u.isRowSelected === "function"
                ? !!u.isRowSelected(i)
                : !!u.isRowSelected;
        const dsSet = new Set(rawList.map((d) => this._normalize(d)));
        if (isSelected && origin) dsSet.add(this._normalize(origin));

        for (const ds of allDataSets) {
            if (!visibleSet.has(ds)) continue;
            if (ds === origin) continue;
            if (dsSet.has(this._normalize(ds))) return ds;
        }
        if (
            origin &&
            visibleSet.has(origin) &&
            dsSet.has(this._normalize(origin))
        )
            return origin;
        for (const ds of rawList) if (visibleSet.has(ds)) return ds;
        return null;
    }

    _hslFromColorString(colorStr) {
        const c = d3.color(colorStr);
        return c ? d3.hsl(c) : d3.hsl(120, 0.5, 0.5);
    }

    _binSelected(bin) {
        if (!this.currentSelection) return true;
        const [[x0, y0], [x1, y1]] = this.currentSelection;
        return !(
            this.x(bin.x1) < x0 ||
            this.x(bin.x0) > x1 ||
            this.y(bin.y0) < y0 ||
            this.y(bin.y1) > y1
        );
    }

    update() {
        const CB_MIN = 0;
        const CB_MAX = 0.1;

        const u =
            typeof this.utils === "function" ? this.utils() : this.utils || {};
        const allDataSets =
            typeof u.allDataSets === "function"
                ? u.allDataSets() || []
                : u.allDataSets || [];
        const colors = u.colorsPerDataSet || u.colors || {};
        const origin =
            typeof u.dataSet === "function" ? u.dataSet() : u.dataSet || "";

        this.legend.render(allDataSets, colors);

        const hidden = this.legend.getGlobalDatasets?.() || new Set();
        const visibleSet = new Set(allDataSets.filter((ds) => !hidden.has(ds)));

        const bins = this._binData();

        const binInfos = bins.map((b) => {
            const dsToMin = new Map();
            for (const idx of b.rows) {
                const chosen = this._datasetForRow(
                    idx,
                    visibleSet,
                    allDataSets,
                    origin,
                    u
                );
                if (!chosen) continue;
                const raw = this.data[idx][this.vField];
                if (raw == null || raw === "" || isNaN(+raw)) continue;
                const v = +raw;
                if (!dsToMin.has(chosen) || v < dsToMin.get(chosen))
                    dsToMin.set(chosen, v);
            }
            const priority = allDataSets
                .filter((d) => d !== origin && dsToMin.has(d))
                .concat(origin && dsToMin.has(origin) ? [origin] : []);
            const chosen = priority.length
                ? priority[0]
                : dsToMin.size
                  ? Array.from(dsToMin.keys())[0]
                  : null;
            return {
                bin: b,
                dataset: chosen,
                value: chosen ? dsToMin.get(chosen) : null,
            };
        });

        const L_MIN = 0.18;
        const L_MAX = 0.92;
        const S_MIN = 0.3;
        const S_MAX = 0.88;

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        for (const bi of binInfos) {
            const b = bi.bin;
            const x = this.x(b.x0);
            const y = this.y(b.y1);
            const w = Math.max(1, this.x(b.x1) - this.x(b.x0));
            const h = Math.max(1, this.y(b.y0) - this.y(b.y1));

            let fill = this.unselectedColor;
            if (bi.value != null) {
                const baseHsl = this._hslFromColorString(
                    colors[bi.dataset] || this.fallbackColor(bi.dataset)
                );
                let t = (bi.value - CB_MIN) / (CB_MAX - CB_MIN || 1);
                t = Math.max(0, Math.min(1, t));
                fill = d3
                    .hsl(
                        baseHsl.h,
                        S_MIN + t * (S_MAX - S_MIN),
                        L_MIN + t * (L_MAX - L_MIN)
                    )
                    .formatHex();
            }

            ctx.fillStyle = fill;
            ctx.globalAlpha = this._binSelected(b) ? 1 : 0.25;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 1;
        }

        // update label text (in case fields changed)
        if (this.xLabel) this.xLabel.text(this.xField || "");
        if (this.yLabel) this.yLabel.text(this.yField || "");

        this._drawColorbar(
            allDataSets,
            visibleSet,
            colors,
            origin,
            CB_MIN,
            CB_MAX,
            L_MIN,
            L_MAX,
            S_MIN,
            S_MAX
        );

        // ensure axis labels remain on top
        if (this.xLabel) this.xLabel.raise();
        if (this.yLabel) this.yLabel.raise();
    }

    _drawColorbar(
        allDataSets,
        visibleSet,
        colors,
        origin,
        minV,
        maxV,
        L_MIN,
        L_MAX,
        S_MIN,
        S_MAX
    ) {
        this.colorbarLayer.selectAll("*").remove();

        const visible = allDataSets.filter((ds) => visibleSet.has(ds));
        const dataset = visible.find((d) => d !== origin) || visible[0];
        if (!dataset) return;

        const baseHsl = this._hslFromColorString(
            colors[dataset] || this.fallbackColor(dataset)
        );

        const cbWidth = 14;
        const cbX = this.width - this.margin.right + 20;
        const cbY = this.margin.top;
        const cbH = this.height - this.margin.top - this.margin.bottom;

        const gid = `cb-grad-${dataset}`.replace(/\s+/g, "-");
        const defs = this.colorbarLayer.append("defs");
        const lg = defs
            .append("linearGradient")
            .attr("id", gid)
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "0%")
            .attr("y2", "100%");

        lg.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", d3.hsl(baseHsl.h, S_MAX, L_MAX).formatHex());
        lg.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", d3.hsl(baseHsl.h, S_MIN, L_MIN).formatHex());

        this.colorbarLayer
            .append("rect")
            .attr("x", cbX)
            .attr("y", cbY)
            .attr("width", cbWidth)
            .attr("height", cbH)
            .attr("fill", `url(#${gid})`);

        const scale = d3
            .scaleLinear()
            .domain([minV, maxV])
            .range([cbY + cbH, cbY]);

        this.colorbarLayer
            .append("g")
            .attr("transform", `translate(${cbX + cbWidth},0)`)
            .call(d3.axisRight(scale).ticks(5).tickFormat(customTickFormat))
            .call((g) => g.select(".domain").remove())
            .selectAll("text")
            .attr("fill", "#222")
            .attr("font-family", "sans-serif");

        // Colorbar label to the right of the colorbar axis (vertical, centered)
        const cbLabelOffset = 36; // px to the right of the colorbar axis ticks
        const cbLabelX = cbX + cbWidth + cbLabelOffset;
        const cbLabelY = cbY + cbH / 2;

        // Use rotate with explicit center so position is predictable
        this.colorbarLayer
            .append("text")
            .attr("class", "colorbar-label")
            .attr("x", cbLabelX)
            .attr("y", cbLabelY)
            .attr("transform", `rotate(-90 ${cbLabelX} ${cbLabelY})`)
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("fill", "#222")
            .attr("font-family", "sans-serif")
            .style("pointer-events", "none")
            .text(this.vField || "");

        // keep axis labels above the colorbar
        if (this.xLabel) this.xLabel.raise();
        if (this.yLabel) this.yLabel.raise();
    }

    _onBrush(selection) {
        this.currentSelection = selection;
        if (!selection) {
            this.updatePlotsFun([]);
        } else {
            const [[x0, y0], [x1, y1]] = selection;
            this.updatePlotsFun([
                {
                    field: this.xField,
                    type: "numerical",
                    range: [this.x.invert(x0), this.x.invert(x1)],
                },
                {
                    field: this.yField,
                    type: "numerical",
                    range: [this.y.invert(y1), this.y.invert(y0)],
                },
            ]);
        }
        this.update();
    }
}

export const binnedScatterPlot = {
    plotName: "Binned Scatter Plot",
    fields: [
        { isRequired: true, fieldType: "numerical", fieldName: "x-axis" },
        { isRequired: true, fieldType: "numerical", fieldName: "y-axis" },
        { isRequired: true, fieldType: "numerical", fieldName: "value" },
    ],
    options: [],
    height: 1,
    width: 1,
    plotClass: BinnedScatterPlot,
};
