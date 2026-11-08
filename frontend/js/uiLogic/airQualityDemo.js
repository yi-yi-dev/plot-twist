import airQualityCsv from "../../assets/demo/Us_Air_Quality.csv?raw";
import citiesCsv from "../../assets/demo/Us_Cities_Population_Density.csv?raw";

const AIR = "Us_Air_Quality.csv";
const CITIES = "Us_Cities_Population_Density.csv";

export const airQualityDemoDataSets = [
    { name: AIR, csv: airQualityCsv },
    { name: CITIES, csv: citiesCsv },
];

const scatter = (dataSet, col, row, x, y) => ({
    type: "Scatter Plot",
    dataSet, col, row,
    fields: [
        { fieldName: "x-axis", fieldSelected: x },
        { fieldName: "y-axis", fieldSelected: y },
    ],
    options: [
        { optionName: "linear regression", optionCheckBox: false },
        { optionName: "Spearman coefficient", optionCheckBox: false },
        { optionName: "Pearson coefficient", optionCheckBox: false },
    ],
});

const histogram = (dataSet, col, row, field, logScale) => ({
    type: "Histogram",
    dataSet, col, row,
    fields: [{ fieldName: "bin-variable", fieldSelected: field }],
    options: [{ optionName: "y-axis log scale", optionCheckBox: logScale }],
});

export const airQualityDemoLayout = [
    { col: 4, row: 2 },
    [
        scatter(AIR, 1, 1, "longitude", "latitude"),
        histogram(AIR, 2, 1, "90th Percentile AQI", false),
        scatter(AIR, 2, 2, "90th Percentile AQI", "Moderate Days"),
        scatter(CITIES, 3, 1, "lng", "lat"),
        histogram(CITIES, 4, 1, "population", true),
        {
            type: "Bar Plot",
            dataSet: CITIES, col: 3, row: 2,
            fields: [{ fieldName: "bin-variable", fieldSelected: "state_name" }],
            options: [],
        },
        histogram(CITIES, 4, 2, "density", true),
    ],
];

export const airQualityDemoLinks = [
    {
        type: "Bidirectional Link",
        id: 1,
        state: {
            dataSet1: AIR,
            dataSet2: CITIES,
            inputField: "Sqrt(\n    Pow(X.latitude - Y.lat, 2) +\n    Pow(X.longitude - Y.lng, 2)\n) <= 1",
        },
        isError: false,
    },
];
