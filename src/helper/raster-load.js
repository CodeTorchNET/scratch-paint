import paper from '@turbowarp/paper';

/**
 * Every raster under these items that has not loaded.
 *
 * @param {paper.Item[]} items the items to look through
 * @returns {paper.Raster[]} the rasters still waiting for their pixels
 */
const unloadedRasters = items => {
    const found = [];
    const walk = item => {
        if (item instanceof paper.Raster && !item.loaded) found.push(item);
        for (const child of item.children || []) walk(child);
    };
    for (const item of items) walk(item);
    return found;
};

/**
 * Run `fn` once every raster under `items` has its pixels.
 *
 * @param {paper.Item[]} items the items whose rasters have to be ready
 * @param {function(): void} fn what to run
 * @returns {boolean} true if `fn` ran at once
 */
const whenRastersLoaded = (items, fn) => {
    const pending = unloadedRasters(items);
    if (pending.length === 0) {
        fn();
        return true;
    }
    let left = pending.length;
    const arrived = () => {
        left -= 1;
        if (left === 0) fn();
    };
    for (const raster of pending) {
        let once = false;
        const settle = () => {
            if (once) return;
            once = true;
            arrived();
        };
        raster.on('load', settle);
        raster.on('error', settle);
        if (raster.loaded) settle();
    }
    return false;
};

export {
    unloadedRasters,
    whenRastersLoaded
};
