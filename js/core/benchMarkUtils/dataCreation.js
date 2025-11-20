// import * as d3 from "d3-random";

/**
 * from a matrix with data it creates a json table,
 * the matrix should have its categorical data on the last categorical_columns_amt columns
 */
export function dataToTable(matrix, categorical_columns_amt) {
    return matrix.map(row =>
        Object.fromEntries(row.map((value, index) =>
            [index < row.length - categorical_columns_amt ? `field${index}` : `catField${index - (row.length - categorical_columns_amt)}`, value],
        )),
    );
}

// deterministic, incremental data generator
// usage: createData(rows, numCols, catCols, distributionType, { seed: 1234, includeBounds: false })
export function createData(
    rows,
    numerical_columns_amt,
    categorical_columns_amt,
    distributionType,
    { seed = 1234, includeBounds = false } = {}
) {
    const categories = ["A", "B", "C", "D", "E", "F", "G"];

    // FNV-1a 32-bit hash to derive per-(row,col,...) integer seeds
    function fnv1a(str) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }

    // mulberry32 PRNG factory
    function mulberry32(a) {
        a >>>= 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // get a fresh RNG for a given set of keys (seed + row + col + tag)
    function rngFor(...keys) {
        const keyStr = keys.map(String).join("|");
        const seedInt = fnv1a(String(seed) + "|" + keyStr);
        return mulberry32(seedInt);
    }

    // get a deterministic normal sample for (row, col, tag)
    function seededNormal(mean, sd, ...keys) {
        const rng = rngFor(...keys);
        const u1 = rng();
        const u2 = rng();
        // Box-Muller
        const z0 = Math.sqrt(-2 * Math.log(Math.max(u1, Number.EPSILON))) * Math.cos(2 * Math.PI * u2);
        return mean + z0 * sd;
    }

    // clamp helper
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

    // build `rows` x (num + cat) matrix
    const totalCols = numerical_columns_amt + categorical_columns_amt;
    const data = Array.from({ length: rows }, () => Array(totalCols).fill(0));

    // numerical columns
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < numerical_columns_amt; col++) {
            switch (distributionType) {
                case "evenly distributed": {
                    const rng = rngFor("num", row, col, "even");
                    data[row][col] = rng();
                    break;
                }

                case "big clusters":
                case "small clusters": {
                    const numClusters = 2;
                    // deterministic cluster centers (independent of rows count)
                    const clusterCenters = Array.from({ length: numClusters }, (_, i) => (i + 1) / (numClusters + 1));
                    const spread = distributionType === "big clusters" ? 0.105 : 0.035;

                    // choose cluster for this row deterministically
                    const rngCluster = rngFor("cluster", row);
                    const clusterIndex = Math.floor(rngCluster() * numClusters);
                    const center = clusterCenters[clusterIndex];

                    // sample normal at (row, col)
                    const val = seededNormal(center, spread, "num", row, col, "norm");
                    data[row][col] = clamp01(val);
                    break;
                }

                default:
                    throw new Error("Invalid distribution type");
            }
        }
    }

    // categorical columns
    for (let row = 0; row < rows; row++) {
        for (let c = 0; c < categorical_columns_amt; c++) {
            const col = numerical_columns_amt + c;
            const rng = rngFor("cat", row, c);
            const idx = Math.floor(rng() * categories.length);
            data[row][col] = categories[idx];
        }
    }

    // optional: append two boundary rows (kept deterministic). If included, function
    // will return rows + 2 rows. Default is false to preserve incremental behavior.

    const boundA = Array.from({ length: totalCols }, () => 0);
    const boundB = Array.from({ length: totalCols }, () => 0);

    // If there are at least 2 numerical columns, force (0,1) and (1,0) in first two numerics
    if (numerical_columns_amt >= 2) {
        boundA[0] = 0;
        boundA[1] = 1;
        boundB[0] = 1;
        boundB[1] = 0;
    } else if (numerical_columns_amt === 1) {
        // with one numeric column, set extremes on that column
        boundA[0] = 0;
        boundB[0] = 1;
    }

    // for categorical columns fill deterministically from seed
    for (let col = numerical_columns_amt; col < totalCols; col++) {
        const idxA = Math.floor(rngFor("bound", "A", col)() * categories.length);
        const idxB = Math.floor(rngFor("bound", "B", col)() * categories.length);
        boundA[col] = categories[idxA];
        boundB[col] = categories[idxB];
    }

    return data.concat([boundA, boundB]);



}


// export function createData(rows, numerical_columns_amt, categorical_columns_amt, distributionType) {
//     const data = Array.from({ length: rows }, () => Array(numerical_columns_amt + categorical_columns_amt).fill(0));
//     const categories = ["A", "B", "C", "D", "E", "F", "G"];
//
//     for (let col = 0; col < numerical_columns_amt; col++) {
//         let values = [];
//
//         switch (distributionType) {
//             case "evenly distributed":
//                 values = Array.from({ length: rows }, () => Math.random());
//                 break;
//
//             case "big clusters":
//             case "small clusters": {
//                 const numClusters = 2;
//                 const clusterCenters = Array.from({ length: numClusters }, (_, i) => (i + 1) / (numClusters + 1));
//                 const spread = distributionType === "big clusters" ? 0.105 : 0.055;
//
//                 const rowClusters = Array.from({ length: rows }, () => clusterCenters[Math.floor(Math.random() * numClusters)]);
//
//                 for (let row = 0; row < rows; row++) {
//                     for (let col = 0; col < numerical_columns_amt; col++) {
//                         const value = d3.randomNormal(rowClusters[row], spread)();
//                         data[row][col] = Math.max(0, Math.min(1, value));
//                     }
//                 }
//                 break;
//             }
//
//             default:
//                 throw new Error("Invalid distribution type");
//         }
//
//         for (let row = 0; row < rows; row++) {
//             data[row][col] = values[row];
//         }
//     }
//
//     for (let col = numerical_columns_amt; col < numerical_columns_amt + categorical_columns_amt; col++) {
//         for (let row = 0; row < rows; row++) {
//             data[row][col] = categories[Math.floor(Math.random() * categories.length)];
//         }
//     }
//
//     // adds two final rows such that the scatter plot goes from (0,0) to (1,1) instead of getting cropped
//     data[rows] = data[rows-1];
//     data[rows][0] = 0;
//     data[rows][1] = 1;
//     data[rows+1] = data[rows-1];
//     data[rows+1][0] = 1;
//     data[rows+1][1] = 0;
//     return data;
// }