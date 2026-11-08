import * as d3 from "d3";
import { customTickFormat } from "./plotsUtils/tickFormat.js";
import { LegendOverlay } from "./plotsUtils/togglableLegendOverlay.js";

export class Histogram {
    // constructor initializes DOM, scales, bins, and draws once
    constructor(fields, options, plotDiv, data, updatePlotsFun, utils) {
        this.fields = fields;
        this.options = options;
        this.plotDiv = plotDiv;
        this.data = data;
        this.updatePlotsFun = updatePlotsFun;
        this.utils = utils;

        this.field = fields.get("bin-variable");
        this.isLogSelected = options.get("y-axis log scale");

        this.container = d3.select(plotDiv);
        // keeps container positioned for legend overlay
        this.container.style("position", "relative");

        this.width = this.container.node().clientWidth;
        this.height = this.container.node().clientHeight;

        this.marginTop = 10;
        this.marginRight = 20;
        this.marginBottom = 50;
        this.marginLeft = 40;

        this.brushThrottleMs = 50;
        this.barInnerPadding = 2;

        // Build x scale & bins
        let [min, max] = d3.extent(this.data, (d) => Number(d[this.field]));
        if (min === max) {
            min -= 0.5;
            max += 0.5;
        }

        this.x = d3
            .scaleLinear()
            .domain([min, max])
            .range([this.marginLeft, this.width - this.marginRight]);

        const binGenerator = d3
            .bin()
            .domain(this.x.domain())
            .thresholds(this.x.ticks());

        const rawBins = binGenerator(
            this.data.map((d) => Number(d[this.field]))
        );
        this.bins = rawBins.map((b) => ({ x0: b.x0, x1: b.x1 }));

        this.fallbackColor = d3.scaleOrdinal(d3.schemeCategory10);

        // Scales for y
        this.yLinear = d3
            .scaleLinear()
            .range([this.height - this.marginBottom, this.marginTop]);
        this.yLogLike = d3
            .scaleSymlog()
            .constant(1)
            .range([this.height - this.marginBottom, this.marginTop]);
        this.y = this.isLogSelected ? this.yLogLike : this.yLinear;

        // Create canvas
        const dpr = window.devicePixelRatio || 1;
        this.canvas = this.container
            .append("canvas")
            .attr(
                "style",
                `width:${this.width}px;height:${this.height}px;display:block;`
            )
            .node();

        this.canvas.width = Math.max(1, Math.floor(this.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(this.height * dpr));
        this.canvas.style.width = this.width + "px";
        this.canvas.style.height = this.height + "px";

        this.ctx = this.canvas.getContext("2d");
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Overlay SVG for brush handling
        this.overlaySvg = this.container
            .append("svg")
            .attr("viewBox", `0 0 ${this.width} ${this.height}`)
            .style("position", "absolute")
            .style("left", "0")
            .style("top", "0")
            .style("pointer-events", "all")
            .style("width", this.width + "px")
            .style("height", this.height + "px");

        // togglable legend overlay
        this.legend = new LegendOverlay(this.container, {
            fallbackColor: this.fallbackColor,
            onToggle: () => this.update(),
        });

        // bind handlers
        this.handleSelection = this.handleSelection.bind(this);

        // Brush behaviour
        this.overlaySvg.call(
            d3
                .brushX()
                .extent([
                    [this.marginLeft, this.marginTop],
                    [
                        this.width - this.marginRight,
                        this.height - this.marginBottom,
                    ],
                ])
                .on("start brush end", this.handleSelection)
        );

        // initial draw
        this.update();
    }

    // compute counts per bin and dataset distribution
    computeCounts() {
        const u = this.utils();

        const origin = u.dataSet();
        const allDataSets = u.allDataSets() || [];
        const colors = u.colorsPerDataSet();

        const countsPerBin = this.bins.map(() => ({ total: 0, datasets: {} }));
        this.bins.forEach((b, bi) => {
            allDataSets.forEach((ds) => (countsPerBin[bi].datasets[ds] = 0));
        });

        this.data.forEach((d, i) => {
            const value = Number(d[this.field]);
            const binIdx = this.bins.findIndex(
                (b, idx) =>
                    b.x0 <= value &&
                    (value < b.x1 ||
                        (idx === this.bins.length - 1 && value <= b.x1))
            );
            if (binIdx < 0) return;

            const binCounts = countsPerBin[binIdx];
            binCounts.total += 1;

            const isSelected = u.isRowSelected(i);
            if (isSelected && origin) {
                if (!(origin in binCounts.datasets))
                    binCounts.datasets[origin] = 0;
                binCounts.datasets[origin] += 1;
            }

            const others = u.dataSetsOf(i) || [];
            const uniqueOthers = Array.from(new Set(others));

            uniqueOthers.forEach((ds) => {
                if (!(ds in binCounts.datasets)) binCounts.datasets[ds] = 0;
                if (ds === origin && isSelected) return;
                binCounts.datasets[ds] += 1;
            });
        });

        return { countsPerBin, allDataSets, colors, origin };
    }

    // draw everything on canvas given counts
    drawAll(countsPerBin, allDataSets, colors) {
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        const marginLeft = this.marginLeft;
        const marginRight = this.marginRight;
        const marginTop = this.marginTop;
        const marginBottom = this.marginBottom;
        const x = this.x;
        const yLinear = this.yLinear;
        const yLogLike = this.yLogLike;
        let y = this.isLogSelected ? yLogLike : yLinear;

        // clear canvas
        ctx.clearRect(0, 0, width, height);

        // compute y domain and set y scale
        const maxDatasetCount =
            d3.max(countsPerBin, (bin) =>
                d3.max(allDataSets.map((ds) => bin.datasets[ds] || 0))
            ) || 0;
        const maxTotal = d3.max(countsPerBin, (bin) => bin.total) || 0;
        let yMax = Math.max(maxDatasetCount, maxTotal);
        if (this.isLogSelected) {
            if (yMax < 1) yMax = 1;
            y = yLogLike.domain([0, yMax]);
        } else {
            y = yLinear.domain([0, yMax]);
        }
        this.y = y;

        // draw grid (x grid at bottom and y grid lines)
        ctx.save();
        ctx.strokeStyle = "rgba(0,0,0,0.08)";
        ctx.lineWidth = 0.5;

        // y grid lines
        const yTicks = y.ticks ? y.ticks(7) : d3.ticks(0, yMax, 7);
        yTicks.forEach((t) => {
            const yy = y(t);
            ctx.beginPath();
            ctx.moveTo(marginLeft, yy + 0.5);
            ctx.lineTo(width - marginRight, yy + 0.5);
            ctx.stroke();
        });

        // x grid lines (vertical grid based on BIN EDGES)
        let binEdges = [];
        if (this.bins && this.bins.length > 0) {
            binEdges.push(this.bins[0].x0);
            this.bins.forEach((b) => binEdges.push(b.x1));
            const seen = new Set();
            binEdges = binEdges.filter((v) => {
                const key = Number.isFinite(v) ? +v : v;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        } else {
            binEdges = [this.x.domain()[0], this.x.domain()[1]];
        }

        ctx.strokeStyle = "rgba(0,0,0,0.08)";
        binEdges.forEach((t) => {
            const xx = x(t);
            ctx.beginPath();
            ctx.moveTo(xx + 0.5, marginTop);
            ctx.lineTo(xx + 0.5, height - marginBottom);
            ctx.stroke();
        });

        ctx.restore();

        // draw axes (tick labels and domain lines)
        ctx.save();
        ctx.fillStyle = "#000";
        ctx.font = "12px sans-serif";

        // x axis tick marks
        const axisBaselineY = height - marginBottom + 0.5;
        const tickMarkLen = 6;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        binEdges.forEach((t) => {
            const xx = x(t);
            ctx.moveTo(xx + 0.5, axisBaselineY);
            ctx.lineTo(xx + 0.5, axisBaselineY + tickMarkLen);
        });
        ctx.stroke();

        // rotated labels
        ctx.fillStyle = "#000";
        ctx.font = "12px sans-serif";
        const labelOffset = 6;
        binEdges.forEach((t) => {
            const xx = x(t);
            ctx.save();
            const px = xx;
            const py = axisBaselineY + tickMarkLen + labelOffset;
            ctx.translate(px, py);
            ctx.rotate(Math.PI / 4);
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(customTickFormat(t), 0, 0);
            ctx.restore();
        });

        // y axis labels
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const yTickValues = y.ticks ? y.ticks(7) : d3.ticks(0, yMax, 7);
        yTickValues.forEach((t) => {
            const yy = y(t);
            ctx.fillStyle = "#000";
            ctx.fillText(customTickFormat(t), marginLeft - 8, yy);
        });

        // axis lines
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.beginPath();
        ctx.moveTo(marginLeft, axisBaselineY);
        ctx.lineTo(width - marginRight, axisBaselineY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(marginLeft - 0.5, marginTop);
        ctx.lineTo(marginLeft - 0.5, height - marginBottom);
        ctx.stroke();

        ctx.restore();

        // title (top-right)
        ctx.save();
        ctx.fillStyle = "black";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText(this.field, width - marginRight, marginTop + 5);
        ctx.restore();

        // draw bars per bin
        this.bins.forEach((bin, bi) => {
            const binX = x(bin.x0);
            const binWidth = Math.max(1, x(bin.x1) - x(bin.x0));

            // background gray rect for total
            const total = countsPerBin[bi].total;
            const bgY = y(total);
            const bgHeight = height - marginBottom - bgY;
            ctx.fillStyle = "#e6e6e6";
            ctx.fillRect(binX, bgY, binWidth, bgHeight);

            // dataset bars
            const dsList = allDataSets;
            const N = dsList.length || 1;
            const innerWidth = Math.max(
                0,
                (binWidth - (N - 1) * this.barInnerPadding) / N
            );

            dsList.forEach((ds, idx) => {
                const count = countsPerBin[bi].datasets[ds] || 0;
                const barX = binX + idx * (innerWidth + this.barInnerPadding);
                const barY = y(count);
                const barHeight = height - marginBottom - barY;
                ctx.fillStyle = colors[ds] || this.fallbackColor(ds);
                ctx.globalAlpha = this.legend.getGlobalDatasets().has(ds)
                    ? 0
                    : 1;
                ctx.fillRect(barX, barY, innerWidth, barHeight);
                ctx.globalAlpha = 1;
            });
        });
    }

    // brush handler -> calls updatePlotsFun with ranges
    handleSelection(event) {
        const selection = event && event.selection ? event.selection : null;
        let selectRanges;
        if (selection) {
            const [x0, x1] = selection;
            let xRange = [this.x.invert(x0), this.x.invert(x1)];
            selectRanges = [
                { range: xRange, field: this.field, type: "numerical" },
            ];
        } else {
            selectRanges = [];
        }
        this.updatePlotsFun(selectRanges);
    }

    // update method to re-render plot
    update() {
        const { countsPerBin, allDataSets, colors } = this.computeCounts();
        this.legend.render(allDataSets, colors);
        this.drawAll(countsPerBin, allDataSets, colors);
    }
}

export const histogram = {
    plotName: "Histogram",
    fields: [
        {
            isRequired: true,
            fieldName: "bin-variable",
            fieldType: "numerical",
        },
    ],
    options: ["y-axis log scale"],
    height: 1,
    width: 1,
    plotClass: Histogram,
};