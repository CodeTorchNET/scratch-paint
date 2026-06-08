import paper from '@turbowarp/paper';

const valueObserverObj = {r: 0, sx: 1, sy: 1, kx: 0, ky: 0, outlineRatio: 1};
const toDeg = 180 / Math.PI;

let isPatched = false;

const updateTransforms = (item, updater) => {
    if (!item.customTransformData) item.customTransformData = Object.assign({}, valueObserverObj);
    updater(item.customTransformData);
    if (item._children) {
        for (const child of item._children) {
            updateTransforms(child, updater);
        }
    }
};

export const applyPaperPatches = () => {
    if (isPatched) return;
    isPatched = true;

    const ogRotate = paper.Item.prototype.rotate;
    paper.Item.prototype.rotate = function (...args) {
        const realAngle = typeof args[0] === 'number' ? args[0] : 0;
        updateTransforms(this, data => {
            data.r += realAngle;
        });
        return ogRotate.call(this, ...args);
    };

    const ogScale = paper.Item.prototype.scale;
    paper.Item.prototype.scale = function (...args) {
        const sx = typeof args[0] === 'number' ? args[0] : 1;
        const sy = typeof args[1] === 'number' ? args[1] : sx;
        updateTransforms(this, data => {
            data.sx *= sx;
            data.sy *= sy;
        });
        return ogScale.call(this, ...args);
    };

    const ogShear = paper.Item.prototype.shear;
    paper.Item.prototype.shear = function (...args) {
        const kx = typeof args[0] === 'number' ? args[0] : 1;
        const ky = typeof args[1] === 'number' ? args[1] : kx;
        updateTransforms(this, data => {
            data.kx += Math.atan(kx) * toDeg;
            data.ky += Math.atan(ky) * toDeg;
        });
        return ogShear.call(this, ...args);
    };
};
