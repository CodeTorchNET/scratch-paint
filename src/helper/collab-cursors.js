import paper from '@turbowarp/paper';

const REPORT_INTERVAL_MS = 50;

const CURSOR_PATH = 'M2.5 2.5 L2.5 17 L6.5 13.5 L9.5 20.5 L12 19.5 L9 12.5 L15 12 Z';

let reporter = null;
let canvas = null;
let layer = null;
let peers = [];
const elements = new Map();
let frame = null;
let lastReportAt = 0;
let trailing = null;
let lastMatrix = '';
let dirty = false;

/**
 * Register the callback that carries this person's pointer to everybody else.
 *
 * @param {?function(?{x: number, y: number}): void} fn called with a point on the art board, or null
 *   when the pointer has left the canvas and the cursor should stop being drawn
 */
export const setCursorReporter = fn => {
    reporter = fn;
};

/**
 * Whether a paint editor is open and able to show somebody else's cursor.
 *
 * @returns {boolean} true while a canvas is mounted
 */
export const cursorLayerMounted = () => layer !== null;

const report = point => {
    lastReportAt = Date.now();
    if (reporter) reporter(point);
};

const clearTrailing = () => {
    if (trailing) {
        clearTimeout(trailing);
        trailing = null;
    }
};

const handlePointerMove = event => {
    if (!reporter || !paper.view) return;
    const point = paper.view.viewToProject(new paper.Point(event.offsetX, event.offsetY));
    const wait = REPORT_INTERVAL_MS - (Date.now() - lastReportAt);
    if (wait <= 0) {
        clearTrailing();
        report({x: point.x, y: point.y});
        return;
    }
    clearTrailing();
    trailing = setTimeout(() => {
        trailing = null;
        report({x: point.x, y: point.y});
    }, wait);
};

const handlePointerLeave = () => {
    clearTrailing();
    report(null);
};

const removeElement = id => {
    const element = elements.get(id);
    if (element) element.remove();
    elements.delete(id);
};

const buildElement = peer => {
    const root = document.createElement('div');
    root.dataset.collabCursor = peer.name;
    root.style.cssText = [
        'position:absolute', 'pointer-events:none', 'z-index:20',
        'transform-origin:top left', 'will-change:left,top'
    ].join(';');

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('width', '18');
    arrow.setAttribute('height', '22');
    arrow.setAttribute('viewBox', '0 0 18 22');
    arrow.style.cssText = 'display:block;filter:drop-shadow(1px 1px 2px rgba(0,0,0,.35))';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', CURSOR_PATH);
    path.setAttribute('fill', peer.color);
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', '1.2');
    path.setAttribute('stroke-linejoin', 'round');
    arrow.appendChild(path);

    const label = document.createElement('div');
    label.textContent = peer.name;
    label.style.cssText = [
        'position:absolute', 'left:14px', 'top:16px', 'white-space:nowrap',
        `background:${peer.color}`, 'color:#ffffff', 'font-size:11px', 'font-weight:bold',
        'font-family:"Helvetica Neue", Helvetica, sans-serif',
        'padding:2px 6px', 'border-radius:8px', 'box-shadow:0 1px 3px rgba(0,0,0,.35)'
    ].join(';');

    root.appendChild(arrow);
    root.appendChild(label);
    layer.appendChild(root);
    return root;
};

const draw = () => {
    frame = null;
    if (!layer || !canvas || !paper.view) return;
    if (!peers.length) {
        for (const id of [...elements.keys()]) removeElement(id);
        return;
    }
    const matrix = paper.view.matrix.values.join(',');
    if (!dirty && matrix === lastMatrix) {
        frame = requestAnimationFrame(draw);
        return;
    }
    lastMatrix = matrix;
    dirty = false;

    const left = canvas.offsetLeft;
    const top = canvas.offsetTop;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    const present = new Set();
    for (const peer of peers) {
        present.add(peer.id);
        let element = elements.get(peer.id);
        if (!element) {
            element = buildElement(peer);
            elements.set(peer.id, element);
        }
        const view = paper.view.projectToView(new paper.Point(peer.x, peer.y));

        if (view.x < 0 || view.y < 0 || view.x > width || view.y > height) {
            element.style.display = 'none';
            continue;
        }
        element.style.display = '';
        element.style.left = `${left + view.x}px`;
        element.style.top = `${top + view.y}px`;
    }

    for (const id of [...elements.keys()]) {
        if (!present.has(id)) removeElement(id);
    }

    frame = requestAnimationFrame(draw);
};

const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(draw);
};

/**
 * @param {Array<{id: (string|number), name: string, color: string, x: number, y: number}>} list
 *   cursors in art-board coordinates
 */
export const setRemoteCursors = list => {
    peers = Array.isArray(list) ? list : [];
    dirty = true;
    if (peers.length || elements.size) schedule();
};

/** Stop watching, and take every cursor */
export const unmountCursorLayer = () => {
    if (canvas) {
        canvas.removeEventListener('pointermove', handlePointerMove);
        canvas.removeEventListener('pointerleave', handlePointerLeave);
    }
    clearTrailing();
    if (reporter) reporter(null);
    if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
    }
    for (const id of [...elements.keys()]) removeElement(id);
    if (layer) layer.remove();
    layer = null;
    canvas = null;
    peers = [];
    lastMatrix = '';
};

/**
 * Start watching this canvas, and give it somewhere to draw other people's cursors.
 *
 * @param {HTMLCanvasElement} element the paint canvas, already set up by paper
 */
export const mountCursorLayer = element => {
    if (layer) unmountCursorLayer();
    canvas = element;
    layer = document.createElement('div');
    layer.dataset.collabCursorLayer = 'true';
    layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none';
    canvas.parentElement.appendChild(layer);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
};

export default {
    setCursorReporter,
    setRemoteCursors,
    mountCursorLayer,
    unmountCursorLayer,
    cursorLayerMounted
};
