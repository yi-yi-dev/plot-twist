export function analyzeFieldType(data, field) {
    let allNumeric = true;
    let allCategorical = true;

    for (const entry of data) {
        const value = entry[field];

        const isNumber = !isNaN(parseFloat(value)) && isFinite(value);

        if (isNumber) {
            allCategorical = false;
        } else {
            allNumeric = false;
        }
    }

    return {
        isCategorical: allCategorical,
        isNumerical: allNumeric
    };
}


