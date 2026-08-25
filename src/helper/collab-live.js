let importer = null;
let reporting = false;
let bitmapReplayer = null;

export const setShapeReporting = value => {
    reporting = value === true;
};

/**
 * Should this commit be split into shapes?
 *
 * @returns {boolean} true while somebody is in a room
 */
export const shapeReportingEnabled = () => reporting;

/**
 * Register the open editor's bitmap replayer. Called by the update-image HOC on mount.
 *
 * @param {?function(object): boolean} fn the replayer, or null to clear it
 */
export const setBitmapReplayer = fn => {
    bitmapReplayer = fn;
};

/**
 * Is a bitmap costume open and able to take a remote action?
 *
 * @returns {boolean} true when an editor has registered a replayer
 */
export const canReplayBitmap = () => bitmapReplayer !== null;

/**
 * Perform a bitmap action somebody else made.
 *
 * @param {object} op the action
 * @returns {boolean} true when it was performed; false when no editor was open, or the action is
 *   one that cannot be replayed and the costume has to arrive as an asset instead
 */
export const replayBitmap = op => {
    if (!bitmapReplayer) return false;
    return bitmapReplayer(op);
};

/**
 * Register the open canvas's live importer. Called by `paper-canvas` on mount.
 *
 * @param {?function(string, number, number, string[]): void} fn the importer, or null to clear it
 */
export const setLiveImporter = fn => {
    importer = fn;
};

/*
 * Undo is about this person's history, and this drawing is not only theirs.
 */
let resyncer = null;

/**
 * Register a way to redraw the open costume from the shared document.
 *
 * @param {?function(): void} fn the redraw, or null to clear it
 */
export const setLiveResync = fn => {
    resyncer = fn;
};


/*
 * Somebody else lifting a selection changes THIS picture.
 */
let refresher = null;

/**
 * Register a way to hand the raster back to the VM without announcing anything.
 *
 * @param {?function(): void} fn the refresh, or null to clear it
 */
export const setBitmapRefresher = fn => {
    refresher = fn;
};

/** Push the raster to the VM after a change nobody made locally. */
export const refreshBitmap = () => {
    if (refresher) refresher();
};

/*
 * Where a shape is being dragged to, while it is still being dragged there.
 */
let dragReporter = null;

/**
 * Register a way to tell the room about a drag in progress.
 *
 * @param {?function(?object): void} fn the reporter, or null to clear it
 */
export const setDragReporter = fn => {
    dragReporter = fn;
};

/**
 * Say where a shape is being dragged, or that it has stopped being dragged.
 *
 * @param {?object} claim the drag, or null when the gesture has ended
 */
export const reportDrag = claim => {
    if (dragReporter) dragReporter(claim);
};

/**
 * Ask for the open costume to be drawn again from the document.
 */
export const requestLiveResync = () => {
    if (resyncer) resyncer();
};

/**
 * Is a paint editor open and able to take a remote drawing?
 *
 * @returns {boolean} true when a canvas has registered an importer
 */
export const canApplyLive = () => importer !== null;

/**
 * Draw a costume that changed elsewhere into the open editor.
 *
 * @param {string} svg the whole costume, composed from the shared document
 * @param {number} rotationCenterX the costume's centre
 * @param {number} rotationCenterY the costume's centre
 * @param {string[]} ids one shape id per item, in z-order, so the items keep their identity
 * @returns {boolean} whether an editor was open to take it
 */
export const applyLive = (svg, rotationCenterX, rotationCenterY, ids) => {
    if (!importer) return false;
    importer(svg, rotationCenterX, rotationCenterY, ids);
    return true;
};

export default {
    setLiveImporter,
    canApplyLive,
    applyLive,
    setLiveResync,
    requestLiveResync,
    setBitmapRefresher,
    refreshBitmap,
    setShapeReporting,
    shapeReportingEnabled,
    setBitmapReplayer,
    canReplayBitmap,
    replayBitmap,
    setDragReporter,
    reportDrag
};
