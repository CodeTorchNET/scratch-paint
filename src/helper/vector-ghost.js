import paper from '@turbowarp/paper';
import {getGuideLayer, setGuideItem} from './layer';

/** Partners' drags */
const ghosts = new Map();

/** How solid a partner's dragged shape looks */
const GHOST_OPACITY = 0.4;

/** How far outside the shape its dashed box sits (in screen pixels) */
const OUTLINE_PADDING = 4;

let nextDragId = 0;

/**
 * Describe a drag in progress, for a partner to draw.
 *
 * @param {paper.Item[]} items the items being dragged
 * @param {paper.Point} offset how far they have moved from where they were picked up
 * @param {?string} dragId this gesture's id, or null to start one
 * @returns {?object} `{dragId, kind, dx, dy, ids}`, or null when there is nothing worth showing
 */
export const describeDrag = (items, offset, dragId) => {
    if (!items || !items.length || !offset) return null;
    const ids = [];
    for (const item of items) {
        if (item.data && item.data.collabId) ids.push(item.data.collabId);
    }
    if (!ids.length) return null;
    return {dragId: dragId || `d${++nextDragId}`, kind: 'move', dx: offset.x, dy: offset.y, ids};
};

/**
 * Take one partner's ghost off the canvas.
 *
 * @param {string} dragId the gesture's id
 */
const removeGhost = dragId => {
    const existing = ghosts.get(dragId);
    ghosts.delete(dragId);
    if (!existing) return;
    existing.ghost.remove();
    existing.outline.remove();
};

/**
 * Everything on the painting layer that the room has a name for, by that name.
 *
 * @returns {Map} `collabId` to the item carrying it
 */
const namedItems = () => {
    const found = new Map();
    const layer = paper.project && paper.project.activeLayer;
    if (!layer) return found;
    for (const child of layer.children) {
        if (child.data && child.data.collabId) found.set(child.data.collabId, child);
    }
    return found;
};

/**
 * Build, or move, one partner's ghost.
 *
 * @param {object} claim `{dragId, kind, dx, dy, ids, color}`
 * @param {Map} named the painting layer's items by `collabId`
 */
const showGhost = (claim, named) => {
    const sources = [];
    for (const id of claim.ids) {
        const item = named.get(id);
        if (item) sources.push(item);
    }
    if (!sources.length) {
        removeGhost(claim.dragId);
        return;
    }

    const key = claim.ids.join(',');
    let entry = ghosts.get(claim.dragId);
    if (!entry || !entry.ghost.isInserted() || entry.key !== key) {
        removeGhost(claim.dragId);

        const ghost = new paper.Group(sources.map(item => item.clone({insert: false})));
        ghost.opacity = GHOST_OPACITY;
        const outline = new paper.Path.Rectangle(
            ghost.bounds.expand(OUTLINE_PADDING / paper.view.zoom));
        outline.strokeColor = claim.color || '#4c97ff';
        outline.strokeWidth = 1 / paper.view.zoom;
        outline.dashArray = [4 / paper.view.zoom, 4 / paper.view.zoom];
        outline.fillColor = null;

        for (const item of [ghost, outline]) {
            // Locked and marked as a guide, so this person's own tools cannot "nudge" a shape that is not theirs to move.
            setGuideItem(item);
            item.data = Object.assign({}, item.data, {collabGhost: claim.dragId});
            getGuideLayer().addChild(item);
        }
        entry = {ghost, outline, key};
        ghosts.set(claim.dragId, entry);
    }

    let bounds = null;
    for (const source of sources) bounds = bounds ? bounds.unite(source.bounds) : source.bounds;
    const to = bounds.center.add(new paper.Point(claim.dx, claim.dy));
    entry.ghost.position = to;
    entry.outline.position = to;
};

/**
 * Show exactly the drags that are currently claimed, and no others.
 *
 * @param {object[]} claims `{dragId, kind, dx, dy, ids, color}` for every drag anybody is showing
 */
export const syncRemoteGhosts = claims => {
    if (!paper.project) return;
    const named = claims.length ? namedItems() : null;
    const wanted = new Set();
    for (const claim of claims) {
        if (!claim || !claim.dragId || claim.kind !== 'move') continue;
        if (!Array.isArray(claim.ids) || !claim.ids.length) continue;
        wanted.add(claim.dragId);
        showGhost(claim, named);
    }
    for (const dragId of [...ghosts.keys()]) {
        if (!wanted.has(dragId)) removeGhost(dragId);
    }
};

/**
 * Throw away every ghost. Called when the canvas changes costume or is torn down.
 */
export const clearRemoteGhosts = () => {
    for (const dragId of [...ghosts.keys()]) removeGhost(dragId);
};
