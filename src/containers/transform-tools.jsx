import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import paper from '@turbowarp/paper';
import bindAll from 'lodash.bindall';
import Popover from 'react-popover';

import LabeledIconButton from '../components/labeled-icon-button/labeled-icon-button.jsx';
import BufferedInputHOC from '../components/forms/buffered-input-hoc.jsx';
import Input from '../components/forms/input.jsx';

import {getSelectedRootItems} from '../helper/selection';
import {ART_BOARD_WIDTH, ART_BOARD_HEIGHT} from '../helper/view';
import {isBitmap} from '../lib/format';

import propertiesIcon from '!../tw-recolor/build!../components/fixed-tools/icons/properties.svg';
import styles from './transform-tools.css';

const BufferedInput = BufferedInputHOC(Input);

const BLEND_MODES = [
    'normal', 'multiply', 'screen', 'overlay',
    'soft-light', 'hard-light', 'color-dodge', 'color-burn',
    'darken', 'lighten', 'difference', 'exclusion',
    'hue', 'saturation', 'color', 'luminosity'
];

const OUTLINE_TYPES = [
    {text: 'miter', value: 'miter'},
    {text: 'round', value: 'round'},
    {text: 'bevel', value: 'bevel'}
];

const toRad = Math.PI / 180;

class TransformTools extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleX', 'handleY',
            'handleWidth', 'handleHeight',
            'handleRot', 'handleScaleX', 'handleScaleY',
            'handleSkewX', 'handleSkewY',
            'handleBlendMode', 'handleLayerOrder',
            'handleOutlineType', 'handleOutlineDash',
            'updateSelectionBounds',
            'handleToggleOpen', 'handleClose'
        ]);
        this.state = {
            isOpen: false,
            key: 0
        };
    }

    componentWillReceiveProps (nextProps) {
        if (this.props.selectedItems !== nextProps.selectedItems) {
            this.setState({key: this.state.key + 1});
        }
    }

    handleToggleOpen () {
        this.setState({isOpen: !this.state.isOpen});
    }

    handleClose () {
        this.setState({isOpen: false});
    }

    updateSelectionBounds () {
        if (paper.tool && typeof paper.tool.boundingBoxTool?.setSelectionBounds === 'function') {
            paper.tool.boundingBoxTool.setSelectionBounds();
        }
        this.props.onUpdateImage();
        this.setState({key: this.state.key + 1});
    }

    applyToSelection (func) {
        const items = getSelectedRootItems();
        if (items.length === 0) return;
        const center = this.getCenter(items);
        for (const item of items) {
            func(item, center);
        }
        this.updateSelectionBounds();
    }

    getCenter (items) {
        if (items.length === 0) return [ART_BOARD_WIDTH / 2, ART_BOARD_HEIGHT / 2];
        let bounds = items[0].bounds;
        for (let i = 1; i < items.length; i++) bounds = bounds.unite(items[i].bounds);
        return [bounds.centerX, bounds.centerY];
    }

    handleX (value) {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        const targetX = num + (ART_BOARD_WIDTH / 2);
        this.applyToSelection((item, center) => {
            const offset = item.position.x - center[0];
            item.position.x = targetX + offset;
        });
    }

    handleY (value) {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        const targetY = (ART_BOARD_HEIGHT / 2) - num;
        this.applyToSelection((item, center) => {
            const offset = item.position.y - center[1];
            item.position.y = targetY + offset;
        });
    }

    handleWidth (value) {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) return;
        const items = getSelectedRootItems();
        if (items.length === 0) return;
        let groupBounds = items[0].bounds;
        for (let i = 1; i < items.length; i++) groupBounds = groupBounds.unite(items[i].bounds);
        const currentWidth = groupBounds.width;
        const scale = num / (currentWidth || 1);
        
        this.applyToSelection((item, center) => {
            item.scale(scale, 1, new paper.Point(center[0], center[1]));
        });
    }

    handleHeight (value) {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) return;
        const items = getSelectedRootItems();
        if (items.length === 0) return;
        let groupBounds = items[0].bounds;
        for (let i = 1; i < items.length; i++) groupBounds = groupBounds.unite(items[i].bounds);
        const currentHeight = groupBounds.height;
        const scale = num / (currentHeight || 1);
        
        this.applyToSelection((item, center) => {
            item.scale(1, scale, new paper.Point(center[0], center[1]));
        });
    }

    handleRot (value) {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        this.applyToSelection((item, center) => {
            let currentR = ((item.customTransformData?.r ?? 0) + 90) % 360;
            if (currentR < 0) currentR += 360;
            const delta = num - currentR;
            item.rotate(delta, new paper.Point(center[0], center[1]));
        });
    }

    handleScaleX (value) {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        this.applyToSelection((item, center) => {
            const currentSx = (item.customTransformData?.sx ?? 1) * 100;
            const scale = num / (currentSx === 0 ? 1 : currentSx);
            item.scale(scale, 1, new paper.Point(center[0], center[1]));
        });
    }

    handleScaleY (value) {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        this.applyToSelection((item, center) => {
            const currentSy = (item.customTransformData?.sy ?? 1) * 100;
            const scale = num / (currentSy === 0 ? 1 : currentSy);
            item.scale(1, scale, new paper.Point(center[0], center[1]));
        });
    }

    handleSkewX (value) {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        this.applyToSelection((item, center) => {
            const currentKx = item.customTransformData?.kx ?? 0;
            const delta = num - currentKx;
            const pivot = new paper.Point(center[0], center[1]);
            item.translate(pivot.multiply(-1));
            item.shear(Math.tan(delta * toRad), 0);
            item.translate(pivot);
        });
    }

    handleSkewY (value) {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        this.applyToSelection((item, center) => {
            const currentKy = item.customTransformData?.ky ?? 0;
            const delta = num - currentKy;
            const pivot = new paper.Point(center[0], center[1]);
            item.translate(pivot.multiply(-1));
            item.shear(0, Math.tan(delta * toRad));
            item.translate(pivot);
        });
    }

    handleBlendMode (e) {
        const mode = e.target.value;
        this.applyToSelection(item => {
            item.blendMode = mode;
        });
    }

    handleLayerOrder (value) {
        const num = parseInt(value, 10);
        if (isNaN(num)) return;
        const layer = paper.project.activeLayer;
        const children = layer.children.slice();
        this.applyToSelection(item => {
            if (item.parent === layer) item.remove();
            const idx = Math.max(0, Math.min(children.length - 1, children.length - num - 1));
            layer.insertChild(idx, item);
        });
    }

    handleOutlineType (e) {
        const val = e.target.value;
        this.applyToSelection(item => {
            item.strokeJoin = val;
            item.strokeCap = val === 'round' ? 'round' : (val === 'bevel' ? 'square' : 'butt');
        });
    }

    handleOutlineDash (value) {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        this.applyToSelection(item => {
            if (num <= 0) {
                item.dashArray = [];
            } else {
                item.dashArray = [num, num];
            }
        });
    }

    render () {
        const items = getSelectedRootItems();
        let popoverBody = <div />;

        if (this.state.isOpen && items.length > 0) {
            const isMixed = items.length > 1;
            const item1 = items[0];
            let groupBounds = item1.bounds;
            for (let i = 1; i < items.length; i++) groupBounds = groupBounds.unite(items[i].bounds);

            // Using Math.round to avoid huge decimals
            const xVal = isMixed ? '' : Math.round((item1.position.x - (ART_BOARD_WIDTH / 2)) * 100) / 100;
            const yVal = isMixed ? '' : Math.round((item1.position.y - (ART_BOARD_HEIGHT / 2)) * -100) / 100;
            
            let rotMod = (((item1.customTransformData?.r ?? 0) + 90) % 360);
            if (rotMod < 0) rotMod += 360;

            const rotVal = isMixed ? '' : Math.round(rotMod * 100) / 100;
            const sxVal = isMixed ? '' : Math.round(((item1.customTransformData?.sx ?? 1) * 100) * 100) / 100;
            const syVal = isMixed ? '' : Math.round(((item1.customTransformData?.sy ?? 1) * 100) * 100) / 100;
            const wVal = Math.round(groupBounds.width * 100) / 100;
            const hVal = Math.round(groupBounds.height * 100) / 100;
            const kxVal = isMixed ? '' : Math.round((item1.customTransformData?.kx ?? 0) * 100) / 100;
            const kyVal = isMixed ? '' : Math.round((item1.customTransformData?.ky ?? 0) * 100) / 100;

            const layerChildren = paper.project.activeLayer.children;
            const orderVal = isMixed ? '' : layerChildren.length - layerChildren.indexOf(item1) - 1;
            const blendVal = isMixed ? 'normal' : item1.blendMode;
            const outTypeVal = isMixed ? 'miter' : item1.strokeJoin;
            const outDashVal = isMixed ? '' : (item1.dashArray && item1.dashArray.length ? item1.dashArray[0] : 0);

            popoverBody = (
                <div className={styles.popoverContent}>
                    <div className={styles.section}>
                        <div className={styles.sectionHeader}>Geometry</div>
                        <div className={styles.grid2x2}>
                            <div className={styles.inputWrapper}>
                                <span className={styles.inputPrefix}>X</span>
                                <BufferedInput
                                    type="number"
                                    value={xVal}
                                    onSubmit={this.handleX}
                                    className={styles.compactInput}
                                />
                            </div>
                            <div className={styles.inputWrapper}>
                                <span className={styles.inputPrefix}>Y</span>
                                <BufferedInput
                                    type="number"
                                    value={yVal}
                                    onSubmit={this.handleY}
                                    className={styles.compactInput}
                                />
                            </div>
                            <div className={styles.inputWrapper}>
                                <span className={styles.inputPrefix}>W</span>
                                <BufferedInput
                                    type="number"
                                    value={wVal}
                                    onSubmit={this.handleWidth}
                                    className={styles.compactInput}
                                />
                            </div>
                            <div className={styles.inputWrapper}>
                                <span className={styles.inputPrefix}>H</span>
                                <BufferedInput
                                    type="number"
                                    value={hVal}
                                    onSubmit={this.handleHeight}
                                    className={styles.compactInput}
                                />
                            </div>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionHeader}>Transform</div>
                        <div className={styles.grid2x2}>
                            <div className={styles.inputWrapper}>
                                <span className={styles.inputPrefix}>R°</span>
                                <BufferedInput
                                    type="number"
                                    value={rotVal}
                                    onSubmit={this.handleRot}
                                    className={styles.compactInput}
                                />
                            </div>
                            <div className={styles.inputWrapper}>
                                <span className={styles.inputPrefix}>L</span>
                                <BufferedInput
                                    type="number"
                                    value={orderVal}
                                    onSubmit={this.handleLayerOrder}
                                    className={styles.compactInput}
                                />
                            </div>
                            <div className={styles.inputWrapper}>
                                <span className={styles.inputPrefix}>SX</span>
                                <BufferedInput
                                    type="number"
                                    value={sxVal}
                                    onSubmit={this.handleScaleX}
                                    className={styles.compactInput}
                                />
                            </div>
                            <div className={styles.inputWrapper}>
                                <span className={styles.inputPrefix}>SY</span>
                                <BufferedInput
                                    type="number"
                                    value={syVal}
                                    onSubmit={this.handleScaleY}
                                    className={styles.compactInput}
                                />
                            </div>
                        </div>
                        <div
                            className={styles.grid2}
                            style={{marginTop: '0.5rem'}}
                        >
                            <div className={styles.inputWrapper}>
                                <span className={styles.inputPrefix}>KX</span>
                                <BufferedInput
                                    type="number"
                                    value={kxVal}
                                    onSubmit={this.handleSkewX}
                                    className={styles.compactInput}
                                />
                            </div>
                            <div className={styles.inputWrapper}>
                                <span className={styles.inputPrefix}>KY</span>
                                <BufferedInput
                                    type="number"
                                    value={kyVal}
                                    onSubmit={this.handleSkewY}
                                    className={styles.compactInput}
                                />
                            </div>
                        </div>
                    </div>

                    {!isBitmap(this.props.format) && (
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>Style & Blending</div>
                            <div className={styles.fullWidthRow}>
                                <span className={styles.selectLabel}>Blend</span>
                                <select
                                    className={styles.blendSelectInput}
                                    value={blendVal}
                                    onChange={this.handleBlendMode}
                                >
                                    {BLEND_MODES.map(m => (<option
                                        key={m}
                                        value={m}
                                    >{m}</option>))}
                                </select>
                            </div>
                            <div
                                className={styles.grid2}
                                style={{marginTop: '0.5rem'}}
                            >
                                <div className={styles.fullWidthRow}>
                                    <span className={styles.selectLabel}>Join</span>
                                    <select
                                        className={styles.selectInput}
                                        value={outTypeVal}
                                        onChange={this.handleOutlineType}
                                    >
                                        {OUTLINE_TYPES.map(m => (<option
                                            key={m.value}
                                            value={m.value}
                                        >{m.text}</option>))}
                                    </select>
                                </div>
                                <div className={styles.inputWrapper}>
                                    <span className={styles.inputPrefix}>Dash</span>
                                    <BufferedInput
                                        type="number"
                                        value={outDashVal}
                                        onSubmit={this.handleOutlineDash}
                                        className={styles.dashCompactInput}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <Popover
                body={popoverBody}
                isOpen={this.state.isOpen && items.length > 0}
                preferPlace="below"
                onOuterAction={this.handleClose}
            >
                <div onClick={this.handleToggleOpen}>
                    <LabeledIconButton
                        disabled={items.length === 0}
                        hideLabel={this.props.hideLabel}
                        imgSrc={propertiesIcon}
                        title={this.props.title || 'Properties'}
                        onClick={this.handleToggleOpen}
                    />
                </div>
            </Popover>
        );
    }
}

TransformTools.propTypes = {
    format: PropTypes.string,
    selectedItems: PropTypes.array,
    onUpdateImage: PropTypes.func,
    hideLabel: PropTypes.bool,
    title: PropTypes.string
};

const mapStateToProps = state => ({
    format: state.scratchPaint.format,
    selectedItems: state.scratchPaint.selectedItems
});

export default connect(mapStateToProps)(TransformTools);
