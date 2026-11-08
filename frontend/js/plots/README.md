# Writing a plot plugin

A plot is a `.js` file in this directory that exports a descriptor object. `example.js` is the smallest working one (a table with selectable rows); the other files are full plots you can use as reference.

## Descriptor

```js
export const myPlot = {
    plotName: "My plot",       // name shown in the plot menu
    fields: [                  // dropdowns the user fills in when creating the plot
        { isRequired: true, fieldType: "numerical", fieldName: "x-axis" },
    ],
    options: ["log scale"],    // one checkbox per string
    width: 1,                  // size in grid cells
    height: 1,
    plotClass: MyPlot,
};
```

`fieldType` is `"numerical"`, `"categorical"` or `"any"`, and limits which columns show up in that dropdown. A required field must be filled in before the plot can be created.

Register it in `../main.js`:

```js
import { myPlot } from "./plots/myPlot.js";
let plots = [scatterPlot, histogram, barPlot, parallelCoordinates, myPlot];
```

## Plot class

```js
class MyPlot {
    constructor(fields, options, plotDiv, data, updatePlotsFun, utils) { ... }
    update() { ... }
}
```

`constructor` runs once, when the plot is created:

- `fields`: `Map` of field name to the chosen column, e.g. `fields.get("x-axis") === "Height"`.
- `options`: `Map` of option name to checkbox state, e.g. `options.get("log scale") === true`.
- `plotDiv`: the element to draw into. Its size follows `width`/`height`.
- `data`: the dataset as an array of row objects. Treat it as read-only. Values are strings as read from the CSV, e.g. `{ Age: "24", Height: "180", Medal: "Gold", ... }`.
- `updatePlotsFun(selection)`: call it when the user brushes (see below).
- `utils()`: returns helpers that describe the global selection state (see below).

`update()` runs whenever the global selection changes. Redraw the plot so it reflects it.

## Reporting a selection

`selection` is an array of filters. A row is selected if it passes all of them. An empty array selects every row.

```js
{ type: "numerical",   field: "Height", range: [167.68, 191.27] }  // value within [min, max]
{ type: "categorical", field: "Medal",  categories: ["Gold", "Bronze"] }
{ type: "index",       indexes: [true, true, false, true] }       // one flag per row
```

## Utils

- `isRowSelected(i)`: whether row `i` is selected once every plot and every client is taken into account.
- `dataSet()`: name of this plot's dataset.
- `dataSetColor()`: hex colour of this plot's dataset.
- `colorsPerDataSet()`: `{ dataSetName: hexColour }` for every dataset on the server.
- `allDataSets()`: names of every dataset on the server.
- `dataSetsOf(i)`: names of the other datasets that select row `i` through a cross-dataset link.
