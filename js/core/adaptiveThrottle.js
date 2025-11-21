export function makeAdaptiveThrottle(fn) {
    let initialDelay = 50,
        multiplier = 1.5,
        alpha = 0.20,
        leading = true,
        trailing = true;

    const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    let delay = initialDelay;
    let ewma = initialDelay;
    let lastInvoke = 0;
    let timer = null;
    let pendingArgs = null;
    let pendingThis = null;
    let enabled = true;

    let delaySetAt = nowMs();

    async function doInvoke() {
        lastInvoke = nowMs();
        const args = pendingArgs;
        const self = pendingThis;
        pendingArgs = pendingThis = null;
        const result = fn.apply(self, args);
        if (result && typeof result.then === 'function') await result;
    }

    function schedule(ms) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; doInvoke(); }, Math.max(0, ms));
    }

    const wrapper = function(...args) {
        if (!enabled) {
            return fn.apply(this, args); // bypass throttling
        }

        const now = nowMs();
        const remaining = delay - (now - lastInvoke);

        pendingArgs = args;
        pendingThis = this;

        if (remaining <= 0 || remaining > delay) {
            if (timer) { clearTimeout(timer); timer = null; }
            if (leading) {
                doInvoke();
            } else if (trailing) {
                schedule(delay);
            }
        } else if (!timer && trailing) {
            schedule(remaining);
        }
    };

    wrapper.report = function(elapsedMs) {
        if (!enabled) return; // ignore updates when disabled
        ewma = alpha * elapsedMs + (1 - alpha) * ewma;
        const newDelay = Math.max(initialDelay, Math.round(multiplier * ewma));
        if (newDelay !== delay) {
            const now = nowMs();
            delay = newDelay;
            delaySetAt = now;
            if (timer) {
                const remaining = Math.max(0, delay - (now - lastInvoke));
                clearTimeout(timer);
                timer = null;
                schedule(remaining);
            }
        }
    };

    wrapper.getDelay = () => delay;
    wrapper.getEWMA = () => ewma;

    wrapper.enable = (state = true) => {
        enabled = !!state;
        if (!enabled) wrapper.cancel(); // clear pending work when disabling
    };

    wrapper.cancel = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        pendingArgs = pendingThis = null;
    };

    wrapper.flush = async () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
            await doInvoke();
        }
    };

    return wrapper;
}
