/**
 * function that takes a float and returns its corresponding string format
 */
export function customTickFormat(d) {
    return d;

    // if (d < 0) {
    //     // Format small negative numbers in scientific notation
    //     if (d > -1) {
    //         return d.toExponential(1);  // Scientific notation for small negative numbers
    //     } else if (String(d).length > 5) {
    //         return d.toExponential(1);  // Format large negative numbers in scientific notation
    //     } else {
    //         return d;  // Display as is
    //     }
    // } else {
    //     if (d > 0 && d < 1) {
    //         return d.toExponential(1);
    //     } else if (d === 0) {
    //         return "0";  // Display zero without decimal
    //     } else if (String(d).length > 5) {
    //         return d.toExponential(1);
    //     } else {
    //         return d;
    //     }
    // }
}

