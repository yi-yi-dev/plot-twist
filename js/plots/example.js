class ejemploTablaSeleccionable {
    constructor(fields, options, plotDiv, data, updatePlotsFun, utils) {
        this.fields = fields;
        this.options = options;
        this.plotDiv = plotDiv;
        this.data = data;
        this.updatePlotsFun = updatePlotsFun;
        this.utils = utils;

        this.col1 = fields.get("columna 1");
        this.col2 = fields.get("columna 2");

        this.localSelection = Array(this.data.length).fill(false);
        this.visibleRows = this.data.slice(0, 10);

        this.render();
    }

    getRowColor(i) {
        const u = this.utils();
        return u.isRowSelected(i) ? u.dataSetColor() : "#999";
    }

    handleCheckboxChange(rowIndex, checked) {
        this.localSelection[rowIndex] = checked;

        this.updatePlotsFun([
            {
                indexes: [...this.localSelection],
                type: "index",
            },
        ]);
    }

    render() {
        this.plotDiv.innerHTML = "";

        const title = document.createElement("div");
        title.textContent = `Primeros 10 elementos`;
        this.plotDiv.appendChild(title);

        const table = document.createElement("table");
        const header = document.createElement("tr");

        const emptyTh = document.createElement("th");
        const th1 = document.createElement("th");
        th1.textContent = this.col1;
        const th2 = document.createElement("th");
        th2.textContent = this.col2;

        header.appendChild(emptyTh);
        header.appendChild(th1);
        header.appendChild(th2);
        table.appendChild(header);

        this.visibleRows.forEach((row, i) => {
            const tr = document.createElement("tr");
            const rowIndex = i;
            const color = this.getRowColor(rowIndex);

            const tdCheck = document.createElement("td");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = this.localSelection[rowIndex];
            checkbox.addEventListener("change", (e) => {
                this.handleCheckboxChange(rowIndex, e.target.checked);
            });
            tdCheck.appendChild(checkbox);

            const td1 = document.createElement("td");
            td1.textContent = row?.[this.col1] ?? "";
            td1.style.color = color;

            const td2 = document.createElement("td");
            td2.textContent = row?.[this.col2] ?? "";
            td2.style.color = color;

            tr.appendChild(tdCheck);
            tr.appendChild(td1);
            tr.appendChild(td2);
            table.appendChild(tr);
        });

        this.plotDiv.appendChild(table);
    }

    update() {
        this.render();
    }
}

export const ejemploTabla = {
    plotName: "Ejemplo tabla",
    fields: [
        { isRequired: true, fieldType: "any", fieldName: "columna 1" },
        { isRequired: true, fieldType: "any", fieldName: "columna 2" },
    ],
    options: [],
    height: 1,
    width: 1,
    plotClass: ejemploTablaSeleccionable,
};
