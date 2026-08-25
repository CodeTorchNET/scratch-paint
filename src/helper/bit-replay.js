import paper from '@turbowarp/paper';
import BrushTool from './bit-tools/brush-tool';
import LineTool from './bit-tools/line-tool';
import FillTool from './bit-tools/fill-tool';
import {buildFloat} from './bit-float';
import {commitItemToBitmap} from './bitmap';
import {getGuideLayer, getRaster, setGuideItem} from './layer';
import {getSelectedLeafItems} from './selection';
import {refreshBitmap} from './collab-live';

const noop = () => {};

const floats = new Map();

/**
 * Drop a preview whose owner has stopped claiming it, putting back anything it was carrying.
 * @param {string} id the float's id
 */
const removeFloat = id => {
    const existing = floats.get(id);
    floats.delete(id);
    if (!existing) return;

    const lift = existing.data && existing.data.liftRect;
    if (lift && existing.isInserted() && existing.canvas) {
        getRaster().drawImage(existing.canvas, new paper.Point(lift[0], lift[1]));
        existing.remove();
        refreshBitmap();
        return;
    }
    existing.remove();
};

/**
 * Every partner's floating item that is currently on screen.
 *
 * @returns {paper.Item[]} the items, in no particular order
 */
export const remoteFloats = () => {
    const live = [];
    for (const [id, item] of floats) {
        if (item.isInserted()) live.push(item);
        else floats.delete(id);
    }
    return live;
};

/**
 * Throw away every preview. Called when the canvas changes costume or is torn down.
 */
export const clearRemoteFloats = () => {
    for (const item of floats.values()) item.remove();
    floats.clear();
};

/**
 * Show a partner's floating item, or move the one already showing.
 *
 * @param {string} id the float's id
 * @param {object} shape its description
 */
const showFloat = (id, shape) => {
    const existing = floats.get(id);
    if (existing && existing.isInserted() && shape.type === 'raster') {
        existing.matrix = new paper.Matrix(
            shape.matrix[0], shape.matrix[1], shape.matrix[2],
            shape.matrix[3], shape.matrix[4], shape.matrix[5]);
        return;
    }

    removeFloat(id);
    const item = buildFloat(shape);
    if (!item) return;
    setGuideItem(item);
    item.data = Object.assign({}, item.data, {collabFloat: id});
    getGuideLayer().addChild(item);
    floats.set(id, item);
};

/**
 * Show exactly the floats that are currently claimed, and no others.
 *
 * @param {object[]} claims `{floatId, shape}` for every float currently being shown by anybody
 */
export const syncRemoteFloats = claims => {
    const wanted = new Set();
    let lifted = false;
    for (const claim of claims) {
        if (!claim || !claim.floatId || !claim.shape) continue;
        wanted.add(claim.floatId);
        if (claim.shape.type === 'raster' && !floats.has(claim.floatId)) lifted = true;
        showFloat(claim.floatId, claim.shape);
    }
    for (const id of [...floats.keys()]) {
        if (!wanted.has(id)) removeFloat(id);
    }
    if (lifted) refreshBitmap();
};

/**
 * Draw a partner's floating item into the raster for good.
 *
 * @param {string} id the float's id
 * @param {object} shape its description
 */
const stampFloat = (id, shape) => {
    let item = floats.get(id);
    if (item && item.isInserted()) {
        item.matrix = new paper.Matrix(
            shape.matrix[0], shape.matrix[1], shape.matrix[2],
            shape.matrix[3], shape.matrix[4], shape.matrix[5]);
        item.remove();
    } else {
        item = buildFloat(shape);
    }
    floats.delete(id);
    if (item) commitItemToBitmap(item, getRaster());
};

/**
 * Throw a lift away for good.
 *
 * @param {string} id the float's id
 * @param {number[]} lift `[x, y, width, height]` in raster coordinates
 */
const cutFloat = (id, lift) => {
    const existing = floats.get(id);
    floats.delete(id);
    if (existing) existing.remove();
    if (!lift) return;
    getRaster().getContext(true /* modify */)
        .clearRect(lift[0], lift[1], lift[2], lift[3]);
};

/**
 * Replace the whole picture.
 *
 * @param {string} png the raster, as a data URL
 * @returns {Promise<boolean>} true once it has been drawn
 */
const drawImage = png => new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
        const raster = getRaster();
        const context = raster.getContext(true /* modify */);
        context.clearRect(0, 0, raster.canvas.width, raster.canvas.height);
        context.drawImage(image, 0, 0);
        resolve(true);
    };
    image.onerror = () => resolve(false);
    image.src = png;
});

/**
 * Perform one bitmap action against the open costume.
 *
 * @param {object} op the action, as recorded by the tool that made it
 * @returns {boolean|Promise<boolean>} true if it was performed, false if this is not an action we
 *   can replay, or a promise resolving to either for an action that has to decode a picture first
 */
export const applyBitmapOp = op => {
    if (!op || typeof op.kind !== 'string') return false;

    if (op.kind === 'brush' || op.kind === 'erase') {
        const tool = new BrushTool(noop, op.kind === 'erase');
        tool.color = op.color;
        tool.setBrushSize(op.size);
        tool.replay(op.points);
        return true;
    }

    if (op.kind === 'line') {
        const tool = new LineTool(noop);
        tool.color = op.color;
        tool.setLineSize(op.size);
        tool.replay(op.from, op.to);
        return true;
    }

    if (op.kind === 'fill') {
        const tool = new FillTool(noop);
        tool.replay(op.point, op.color, op.all);
        return true;
    }

    if (op.kind === 'gradfill') {
        const tool = new FillTool(noop);
        tool.replayGradient(op.point, op.color, op.color2, op.gradientType, op.all);
        return true;
    }

    if (op.kind === 'cut') {
        cutFloat(op.floatId, op.lift);
        return true;
    }

    if (op.kind === 'stamp') {
        stampFloat(op.floatId, op.shape);
        return true;
    }

    if (op.kind === 'image') {
        return drawImage(op.png);
    }

    return false;
};

/**
 * A hash of the picture, or null if it is not a picture anybody should be hashing yet.
 *
 * @returns {?string} the hash, or null while the picture is unsettled
 */
export const bitmapDigest = () => {
    if (floats.size) return null;
    if (getSelectedLeafItems().length) return null;

    const raster = getRaster();
    if (!raster.loaded) return null;
    const {width, height} = raster.canvas;
    const pixels = raster.getContext().getImageData(0, 0, width, height).data;
    let hash = 5381;
    for (let index = 0; index < pixels.length; index++) {
        hash = (((hash << 5) + hash) + pixels[index]) | 0;
    }
    return (hash >>> 0).toString(36);
};

/**
 * The whole picture, for when describing the edit that made it is not possible or not enough.
 *
 * @returns {?string} the raster as a data URL, or null if there is no loaded raster
 */
export const bitmapSnapshot = () => {
    const raster = getRaster();
    if (!raster.loaded) return null;
    return raster.canvas.toDataURL();
};

export default {
    applyBitmapOp,
    remoteFloats,
    clearRemoteFloats,
    syncRemoteFloats,
    bitmapDigest,
    bitmapSnapshot
};
