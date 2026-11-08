import * as d3 from "d3";

export class LegendOverlay {
    constructor(container, options = {}) {
        // accept d3 selection or DOM/selector
        this.container =
            container && typeof container.node === "function"
                ? container
                : d3.select(container);

        this.fallbackColor =
            options.fallbackColor || d3.scaleOrdinal(d3.schemeCategory10);
        this.onToggle = options.onToggle || (() => {});

        this.globalDatasets = new Set();
        this._lastAll = [];
        this._lastColors = {};

        // tooltip is attached to body to escape stacking contexts
        let tip = d3.select("body").select(".legend-tooltip");
        if (tip.empty()) {
            tip = d3
                .select("body")
                .append("div")
                .attr("class", "legend-tooltip")
                .style("position", "fixed")
                .style("pointer-events", "none")
                .style("display", "none")
                // frosty glass
                .style("background", "rgba(255,255,255,0.75)")
                .style("backdrop-filter", "blur(6px)")
                .style("-webkit-backdrop-filter", "blur(6px)")
                .style("box-shadow", "0 4px 12px rgba(0,0,0,0.08)")
                .style("color", "#000")
                .style("padding", "6px 10px")
                .style("border-radius", "6px")
                .style("font-size", "12px")
                // above everything
                .style("z-index", "2147483647");
        }
        this._tooltip = tip;
    }

    // render legend items
    render(allDataSets, colors) {
        this._lastAll = Array.isArray(allDataSets)
            ? allDataSets
            : allDataSets || [];
        this._lastColors = colors || {};

        const currentAll = this._lastAll;
        const rightOffset =
            (currentAll.length ? currentAll.length : 0) + 10 + "px";

        // create/reuse overlay container
        let legendDiv = this.container.select(".legend-overlay");
        if (legendDiv.empty()) {
            legendDiv = this.container
                .append("div")
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

        // data join keyed by dataset name
        const items = legendDiv
            .selectAll("div.legend-item")
            .data(currentAll, (d) => d);
        items.exit().remove();

        const enter = items
            .enter()
            .append("div")
            .attr("class", "legend-item")
            .style("display", "flex")
            .style("align-items", "center")
            .style("cursor", "pointer")
            .style("height", itemHeight + "px");

        enter
            .append("div")
            .attr("class", "legend-swatch")
            .style("width", swatchSize + "px")
            .style("height", swatchSize + "px")
            .style("border-radius", "7px")
            .style("border", "1px solid #ccc");

        const merged = enter.merge(items);

        // toggle visibility
        merged.on("pointerdown", (event, d) => {
            event.stopPropagation();
            if (this.globalDatasets.has(d)) this.globalDatasets.delete(d);
            else this.globalDatasets.add(d);
            this.onToggle(d, this.globalDatasets);
            this.render(this._lastAll, this._lastColors);
        });

        // tooltip handlers
        merged
            .on("pointerenter", (event, d) => {
                this._tooltip.style("display", "block").text(String(d));
                this._positionTooltip(event);
            })
            .on("pointermove", (event) => {
                this._positionTooltip(event);
            })
            .on("pointerleave", () => {
                this._tooltip.style("display", "none");
            });

        merged
            .select(".legend-swatch")
            .style(
                "background-color",
                (d) =>
                    (this._lastColors && this._lastColors[d]) ||
                    this.fallbackColor(d)
            )
            .style("opacity", (d) => (this.globalDatasets.has(d) ? 0.25 : 1));
    }

    // position tooltip in viewport space
    _positionTooltip(event) {
        this._tooltip
            .style("left", `${event.clientX + 10}px`)
            .style("top", `${event.clientY + 10}px`);
    }

    getGlobalDatasets() {
        return this.globalDatasets;
    }
}
