/**
 * function that takes a float and returns its corresponding string format
 */
export function customTickFormat(d) {
    const s = String(d).replace(/[-.]/g, "");

    if (s.length <= 5) {
        // truncate to 5 significant digits
        return Number(d)
            .toPrecision(5)
            .replace(/\.?0+$/, "");
    }

    // scientific notation with fixed significant digits
    return Number(d).toExponential(1);
}


