const LEAF_TAGS = new Set([
    'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use', 'g'
]);

const DEF_TAGS = new Set([
    'lineargradient', 'radialgradient', 'clippath', 'mask', 'pattern', 'filter', 'symbol', 'marker'
]);

const CANONICAL_TAGS = {
    lineargradient: 'linearGradient',
    radialgradient: 'radialGradient',
    clippath: 'clipPath',
    foreignobject: 'foreignObject',
    textpath: 'textPath'
};

const canonical = tag => CANONICAL_TAGS[tag] || tag;

const ALLOWED_ATTRS = new Set([
    'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'width', 'height', 'points', 'transform', 'viewBox', 'preserveAspectRatio',
    'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-opacity', 'opacity', 'clip-path', 'clip-rule', 'mask', 'filter',
    'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
    'letter-spacing', 'word-spacing', 'xml:space',
    'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
    'spreadMethod', 'patternUnits', 'patternContentUnits', 'maskUnits', 'markerWidth',
    'markerHeight', 'refX', 'refY', 'orient', 'style'
]);

const HREF_ATTRS = new Set(['href', 'xlink:href']);

const isSafeHref = value => typeof value === 'string' && /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(value);

/**
 * An element "reduced" to what can be safely rebuilt.
 *
 * @param {Element} el the element to describe
 * @returns {?object} `{tag, attrs, kids}`, or null if the element is not one we rebuild
 */
const describe = el => {
    const tag = el.tagName.toLowerCase();
    if (!LEAF_TAGS.has(tag) && !DEF_TAGS.has(tag) && tag !== 'stop' && tag !== 'tspan') return null;
    const attrs = {};
    for (const attr of el.attributes) {
        const name = attr.name;
        if (ALLOWED_ATTRS.has(name)) {
            attrs[name] = attr.value;
        } else if (HREF_ATTRS.has(name) && isSafeHref(attr.value)) {
            attrs[name] = attr.value;
        }
    }
    const node = {tag: canonical(tag), attrs};
    const kids = [];
    for (const child of el.children) {
        const described = describe(child);
        if (described) kids.push(described);
    }
    if (kids.length) node.kids = kids;
    if ((tag === 'text' || tag === 'tspan') && el.textContent) node.text = el.textContent;
    return node;
};

const referencedIds = node => {
    const found = new Set();
    const walk = current => {
        for (const value of Object.values(current.attrs || {})) {
            const pattern = /url\(#([^)\s]+)\)/g;
            let match = pattern.exec(value);
            while (match) {
                found.add(match[1]);
                match = pattern.exec(value);
            }
        }
        for (const kid of current.kids || []) walk(kid);
    };
    walk(node);
    return found;
};

const renameReference = (node, from, to) => {
    for (const [name, value] of Object.entries(node.attrs || {})) {
        if (typeof value === 'string' && value.includes(`url(#${from})`)) {
            node.attrs[name] = value.split(`url(#${from})`).join(`url(#${to})`);
        }
    }
    for (const kid of node.kids || []) renameReference(kid, from, to);
};

/**
 * The group that holds the drawing
 *
 * @param {Element} root the `<svg>` element
 * @returns {?{outer: Element, inner: Element}} the two wrappers, or null if this is not that shape
 */
const findLayerGroup = root => {
    const groups = [...root.children].filter(child => child.tagName.toLowerCase() === 'g');
    if (groups.length !== 1) return null;
    const outer = groups[0];
    const innerGroups = [...outer.children].filter(child => child.tagName.toLowerCase() === 'g');
    if (outer.children.length === 1 && innerGroups.length === 1) {
        return {outer, inner: innerGroups[0]};
    }
    return {outer, inner: outer};
};

/**
 * Split a scratch-paint SVG export into addressable shapes.
 *
 * @param {string} svg the exported document
 * @param {string[]} ids one id per shape (in order) from the caller
 * @returns {?object} `{view, shapes}`, or null if the export is not a shape we recognise
 */
export const decompose = (svg, ids) => {
    let doc;
    try {
        doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    } catch (e) {
        return null;
    }
    if (!doc || doc.querySelector('parsererror')) return null;
    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== 'svg') return null;

    const wrappers = findLayerGroup(root);
    if (!wrappers) return null;

    const defs = {};
    const defsEl = [...root.children].find(child => child.tagName.toLowerCase() === 'defs');
    if (defsEl) {
        for (const child of defsEl.children) {
            const id = child.getAttribute('id');
            if (!id) continue;
            const described = describe(child);
            if (described) defs[id] = described;
        }
    }

    const shapes = [];
    const children = [...wrappers.inner.children];
    for (let index = 0; index < children.length; index++) {
        const described = describe(children[index]);
        if (!described) continue;
        const owned = {};
        for (const referenced of referencedIds(described)) {
            if (defs[referenced]) owned[referenced] = defs[referenced];
        }
        const shape = {id: ids[index] || null, tag: described.tag, attrs: described.attrs};
        if (described.kids) shape.kids = described.kids;
        if (described.text) shape.text = described.text;
        if (Object.keys(owned).length) shape.defs = owned;
        shapes.push(shape);
    }

    return {
        view: {
            width: root.getAttribute('width') || '0',
            height: root.getAttribute('height') || '0',
            viewBox: root.getAttribute('viewBox') || '',
            transform: wrappers.outer.getAttribute('transform') || '',
            group: Object.fromEntries([...wrappers.inner.attributes]
                .filter(attr => ALLOWED_ATTRS.has(attr.name))
                .map(attr => [attr.name, attr.value]))
        },
        shapes
    };
};

/*
 * A shape's id, made safe to use inside an SVG id.
 */
const safeId = id => String(id).replace(/[^A-Za-z0-9-]/g, char =>
    `_${char.charCodeAt(0).toString(16)}_`);

const clone = node => ({
    tag: node.tag,
    attrs: Object.assign({}, node.attrs),
    ...(node.text === undefined ? {} : {text: node.text}),
    ...(node.kids ? {kids: node.kids.map(clone)} : {}),
    ...(node.defs ? {defs: node.defs} : {}),
    ...(node.id === undefined ? {} : {id: node.id})
});

const XML_ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&apos;'};
const escapeXml = value => String(value).replace(/[&<>"']/g, char => XML_ESCAPES[char]);

const emit = node => {
    const lower = String(node.tag || '').toLowerCase();
    if (!LEAF_TAGS.has(lower) && !DEF_TAGS.has(lower) && lower !== 'stop' && lower !== 'tspan') return '';
    const tag = canonical(lower);
    let out = `<${tag}`;
    if (node.attrs && node.attrs.id) out += ` id="${escapeXml(node.attrs.id)}"`;
    for (const name of Object.keys(node.attrs || {}).sort()) {
        const value = node.attrs[name];
        if (name === 'id') continue;
        if (ALLOWED_ATTRS.has(name)) {
            out += ` ${name}="${escapeXml(value)}"`;
        } else if (HREF_ATTRS.has(name) && isSafeHref(value)) {
            out += ` ${name}="${escapeXml(value)}"`;
        }
    }
    const inner = (node.kids || []).map(emit).join('');
    const text = node.text ? escapeXml(node.text) : '';
    if (!inner && !text) return `${out}/>`;
    return `${out}>${inner}${text}</${tag}>`;
};

/**
 * Rebuild a costume from its shapes.
 *
 * @param {object} view geometry from `decompose`
 * @param {object[]} shapes the shapes, in z-order
 * @returns {string} an SVG document
 */
export const compose = (view, shapes) => {
    const defs = [];
    const body = [];
    for (const shape of shapes) {
        if (!shape) continue;
        let emitted = shape;
        const names = Object.keys(shape.defs || {});
        if (names.length && shape.id) {
            emitted = clone(shape);
            const prefix = safeId(shape.id);
            names.sort();
            for (const name of names) {
                const renamed = `${prefix}__${safeId(name)}`;
                const def = clone(shape.defs[name]);
                def.attrs = Object.assign({}, def.attrs, {id: renamed});
                defs.push(emit(def));
                renameReference(emitted, name, renamed);
            }
        }
        body.push(emit(emitted));
    }
    const groupAttrs = Object.keys(view.group || {}).sort()
        .filter(name => ALLOWED_ATTRS.has(name))
        .map(name => ` ${name}="${escapeXml(view.group[name])}"`)
        .join('');
    const transform = view.transform ? ` transform="${escapeXml(view.transform)}"` : '';
    return `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" ` +
        `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
        `width="${escapeXml(view.width)}" height="${escapeXml(view.height)}" ` +
        `viewBox="${escapeXml(view.viewBox)}">${
            defs.length ? `<defs>${defs.join('')}</defs>` : ''
        }<g${transform}><g${groupAttrs}>${body.join('')}</g></g></svg>`;
};

export default {decompose, compose};
